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
 *   svitylo-anatomy export-assets <target-dir> [--data-version <v>] [--force] [--dry-run]
 *   svitylo-anatomy verify <release-dir>
 *   svitylo-anatomy info
 *
 * export-assets copies the data release installed with the package
 * (@authorod/svitylo-3d-anatomy-data) to <target-dir>/<version>/, keeping the versioned
 * folder structure, licences and checksums. It verifies SHA256SUMS before and after copying,
 * never modifies an existing version folder with different content (published versions are
 * immutable) and never deletes other versions. Nothing runs automatically on install.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

function readSums(dir) {
  const file = join(dir, 'SHA256SUMS');
  if (!existsSync(file)) fail(`${file} is missing`);
  const sums = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) fail(`malformed line in ${file}: ${line.slice(0, 80)}`);
    const path = match[2];
    if (path.startsWith('/') || path.split('/').some((s) => s === '..' || s === '.' || s === '')) fail(`unsafe path in SHA256SUMS: ${path}`);
    sums.set(path, match[1]);
  }
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
    if (a === '--force' || a === '--dry-run' || a === '--help' || a === '-h') flags[a.replace(/^-+/, '')] = true;
    else if (a === '--data-version') flags['data-version'] = argv[++i];
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else positional.push(a);
  }
  return { positional, flags };
}

const USAGE = `Usage:
  svitylo-anatomy export-assets <target-dir> [--data-version <v>] [--force] [--dry-run]
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
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) fail(`invalid version ${version}`);
  const source = join(data.releases, version);
  if (!existsSync(join(source, 'manifest.json'))) fail(`data release ${version} is not part of the installed data package`);
  const sourceProblems = verifyDir(source);
  if (sourceProblems.length) fail(`installed data release ${version} is damaged:\n  ${sourceProblems.join('\n  ')}`);

  const dest = join(resolve(target), version);
  const sums = readSums(source);
  const files = ['SHA256SUMS', ...sums.keys()];
  if (existsSync(dest)) {
    const destProblems = existsSync(join(dest, 'SHA256SUMS')) ? verifyDir(dest, { extra: false }) : ['no SHA256SUMS'];
    const same = destProblems.length === 0 && sha256(join(dest, 'SHA256SUMS')) === sha256(join(source, 'SHA256SUMS'));
    if (same) {
      process.stdout.write(`up to date: ${relative(process.cwd(), dest) || dest}\n`);
      process.exit(0);
    }
    if (!flags.force) {
      fail(
        `${dest} exists with different content. Published data versions are immutable; ` +
          'remove the folder yourself or pass --force to overwrite it.',
      );
    }
  }
  if (flags['dry-run']) {
    process.stdout.write(`would copy ${files.length} files to ${dest}\n`);
    process.exit(0);
  }
  for (const file of files) {
    const to = join(dest, file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(source, file), to);
  }
  const copiedProblems = verifyDir(dest, { extra: false });
  if (copiedProblems.length) fail(`verification after copy failed:\n  ${copiedProblems.join('\n  ')}`);
  process.stdout.write(`exported data ${version} (${files.length} files) to ${relative(process.cwd(), dest) || dest}\n`);
  process.exit(0);
}

fail(`unknown command ${command}\n${USAGE}`);
