#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: CPAL-1.0
 *
 * The contents of this file are subject to the Common Public Attribution License
 * Version 1.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * https://opensource.org/license/CPAL-1.0 and in the accompanying LICENSE.md.
 * The License is based on the Mozilla Public License Version 1.1 but Sections 14
 * and 15 have been added to cover use of software over a computer network and
 * provide for limited attribution for the Original Developer. In addition,
 * Exhibit A has been modified to be consistent with Exhibit B.
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
 * the specific language governing rights and limitations under the License.
 *
 * The Original Code is Svitylo 3D Anatomy Atlas.
 * The Original Developer is the Initial Developer.
 * The Initial Developer of the Original Code is authorOd.
 * All portions of the code written by authorOd are Copyright (c) 2026 authorOd.
 * All Rights Reserved.
 * Contributor(s): see the source history and accompanying copyright notices.
 */
/**
 * svitylo-anatomy — explicit asset export for sites that use the atlas.
 *
 *   svitylo-anatomy export-assets <target-dir> [--data-version <v>] [--force] [--dry-run] [--prune]
 *   svitylo-anatomy verify <release-dir>
 *   svitylo-anatomy info
 *
 * export-assets copies the data release installed with the package
 * (@authorod/svitylo-3d-anatomy-data) to <target-dir>/<version>/, keeping the versioned
 * folder structure, licences and checksums. It verifies SHA256SUMS before and after copying and
 * never modifies an existing version folder with different content (published versions are
 * immutable). Other versions stay, unless --prune is given: then, once this version is in place,
 * the other versions of the same model are removed (links open in the loaded data, so nothing
 * needs them). Nothing runs automatically on install.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);

function fail(message, code = 1) {
  process.stderr.write(`svitylo-anatomy: ${message}\n`);
  process.exit(code);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** The SHA256SUMS of a release folder (path -> hash), or the reason it cannot be used. */
function parseSums(dir) {
  const file = join(dir, 'SHA256SUMS');
  if (!existsSync(file)) return { error: `${file} is missing` };
  const sums = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) return { error: `malformed line in ${file}: ${line.slice(0, 80)}` };
    const path = match[2];
    if (path.startsWith('/') || path.split('/').some((s) => s === '..' || s === '.' || s === '')) return { error: `unsafe path in SHA256SUMS: ${path}` };
    sums.set(path, match[1]);
  }
  return { sums };
}

function readSums(dir) {
  const { sums, error } = parseSums(dir);
  if (error) fail(error);
  return sums;
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Returns a list of problems (empty when the release directory matches its SHA256SUMS). With
 * `extra: false`, files that SHA256SUMS does not list (a server's .htaccess) are allowed: the
 * atlas never requests them.
 */
function verifyDir(dir, { extra = true } = {}) {
  const problems = [];
  const sums = readSums(dir);
  const files = listFiles(dir).filter((f) => f !== 'SHA256SUMS');
  for (const [path, hash] of sums) {
    const full = join(dir, path);
    if (!existsSync(full)) problems.push(`missing: ${path}`);
    else if (sha256(full) !== hash) problems.push(`checksum mismatch: ${path}`);
  }
  if (extra) for (const f of files) if (!sums.has(f)) problems.push(`not listed in SHA256SUMS: ${f}`);
  return problems;
}

/** Removes the empty folders under `dir`, deepest first, then `dir` itself when it is empty. */
function removeEmptyDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (lstatSync(p).isDirectory()) removeEmptyDirs(p);
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

/**
 * --prune: removes the other data versions in `root`. Only folders named like a version that hold
 * a release of the same model are touched, and in them only the files their SHA256SUMS lists:
 * files the site added there stay, with their folders.
 */
function pruneVersions(root, keep, model, dryRun) {
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (name === keep || !VERSION.test(name) || !lstatSync(dir).isDirectory()) continue;
    const shown = relative(process.cwd(), dir) || dir;
    let other;
    try {
      other = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).model;
    } catch {
      process.stdout.write(`kept ${shown}: no readable manifest.json\n`);
      continue;
    }
    if (other !== model) {
      process.stdout.write(`kept ${shown}: data of another model (${other})\n`);
      continue;
    }
    const { sums, error } = parseSums(dir);
    if (error) {
      process.stdout.write(`kept ${shown}: ${error}\n`);
      continue;
    }
    const files = [...sums.keys(), 'SHA256SUMS'];
    if (dryRun) {
      process.stdout.write(`would remove data ${name} (${files.length} files) from ${shown}\n`);
      continue;
    }
    for (const file of files) {
      const p = join(dir, file);
      if (existsSync(p) && lstatSync(p).isFile()) rmSync(p);
    }
    removeEmptyDirs(dir);
    const left = existsSync(dir) ? listFiles(dir).length : 0;
    process.stdout.write(
      left
        ? `removed data ${name} from ${shown}; kept ${left} file(s) the release does not list\n`
        : `removed data ${name} (${files.length} files): ${shown}\n`,
    );
  }
}

function dataPackage() {
  let pkgJson;
  try {
    pkgJson = require.resolve('@authorod/svitylo-3d-anatomy-data/package.json');
  } catch {
    fail('the data package @authorod/svitylo-3d-anatomy-data is not installed');
  }
  const root = dirname(pkgJson);
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
  return { root, version: pkg.version, releases: join(root, 'releases') };
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force' || a === '--dry-run' || a === '--prune' || a === '--help' || a === '-h') flags[a.replace(/^-+/, '')] = true;
    else if (a === '--data-version') flags['data-version'] = argv[++i];
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else positional.push(a);
  }
  return { positional, flags };
}

const USAGE = `Usage:
  svitylo-anatomy export-assets <target-dir> [--data-version <v>] [--force] [--dry-run] [--prune]
  svitylo-anatomy verify <release-dir>
  svitylo-anatomy info
`;

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);

if (!command || flags.help || command === 'help') {
  process.stdout.write(USAGE);
  process.exit(command ? 0 : 1);
}

if (command === 'info') {
  const data = dataPackage();
  const versions = existsSync(data.releases) ? readdirSync(data.releases).filter((v) => existsSync(join(data.releases, v, 'manifest.json'))) : [];
  process.stdout.write(`data package: ${data.root}\npackage version: ${data.version}\nreleases: ${versions.join(', ') || '(none)'}\n`);
  process.exit(0);
}

if (command === 'verify') {
  const dir = positional[0];
  if (!dir) fail('verify needs a release directory');
  const problems = verifyDir(resolve(dir));
  if (problems.length) {
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    fail(`${problems.length} problem(s) in ${dir}`);
  }
  process.stdout.write(`ok: ${dir}\n`);
  process.exit(0);
}

if (command === 'export-assets') {
  const target = positional[0];
  if (!target) fail('export-assets needs a target directory, e.g. public/anatomy-data');
  const data = dataPackage();
  const version = flags['data-version'] ?? data.version;
  if (!VERSION.test(version)) fail(`invalid version ${version}`);
  const source = join(data.releases, version);
  if (!existsSync(join(source, 'manifest.json'))) fail(`data release ${version} is not part of the installed data package`);
  const sourceProblems = verifyDir(source);
  if (sourceProblems.length) fail(`installed data release ${version} is damaged:\n  ${sourceProblems.join('\n  ')}`);

  const root = resolve(target);
  const dest = join(root, version);
  const sums = readSums(source);
  const files = ['SHA256SUMS', ...sums.keys()];
  let upToDate = false;
  if (existsSync(dest)) {
    const destProblems = existsSync(join(dest, 'SHA256SUMS')) ? verifyDir(dest, { extra: false }) : ['no SHA256SUMS'];
    upToDate = destProblems.length === 0 && sha256(join(dest, 'SHA256SUMS')) === sha256(join(source, 'SHA256SUMS'));
    if (!upToDate && !flags.force) {
      fail(
        `${dest} exists with different content. Published data versions are immutable; ` +
          'remove the folder yourself or pass --force to overwrite it.',
      );
    }
  }
  if (upToDate) {
    process.stdout.write(`up to date: ${relative(process.cwd(), dest) || dest}\n`);
  } else if (flags['dry-run']) {
    process.stdout.write(`would copy ${files.length} files to ${dest}\n`);
  } else {
    for (const file of files) {
      const to = join(dest, file);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(source, file), to);
    }
    const copiedProblems = verifyDir(dest, { extra: false });
    if (copiedProblems.length) fail(`verification after copy failed:\n  ${copiedProblems.join('\n  ')}`);
    process.stdout.write(`exported data ${version} (${files.length} files) to ${relative(process.cwd(), dest) || dest}\n`);
  }
  // Only once this version is in place (a failed export stops above and removes nothing).
  if (flags.prune && existsSync(root)) {
    const model = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')).model;
    pruneVersions(root, version, model, flags['dry-run'] === true);
  }
  process.exit(0);
}

fail(`unknown command ${command}\n${USAGE}`);
