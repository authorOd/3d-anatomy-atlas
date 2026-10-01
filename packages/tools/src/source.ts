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
 * Fetches the pinned Z-Anatomy snapshot and the models from other open sources, and verifies
 * every input by SHA-256. Never downloads a moving "latest" version: the commit and checksums come
 * from packages/data/sources/zanatomy.lock.json, the file addresses and checksums of the other
 * models from packages/data/sources/external.json.
 *
 *   pnpm data:source [--work .work/zanatomy]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DATA_SOURCES, WORK_DIR, ensureDir, log, readJson, sha256, writeBytes } from './lib/io.js';
import { extractZipEntry } from './lib/zip.js';

interface Lock {
  repository: string;
  revision: string;
  files: Record<string, string>;
  extracted: Record<string, string>;
}

const { values } = parseArgs({ options: { work: { type: 'string', default: join(WORK_DIR, 'zanatomy') } } });
const external = readJson<{ files: Record<string, { url: string; sha256: string }> }>(join(DATA_SOURCES, 'external.json'));
const externalDir = join(WORK_DIR, 'external');
const work = values.work!;
const lock = readJson<Lock>(join(DATA_SOURCES, 'zanatomy.lock.json'));
const repoDir = join(work, 'repo');
const sourceDir = join(work, 'source');
ensureDir(sourceDir);

const git = (...args: string[]) =>
  execFileSync('git', args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });

if (!existsSync(join(repoDir, '.git'))) {
  log(`cloning ${lock.repository} (no blobs)…`);
  git('clone', '--filter=blob:none', '--no-checkout', lock.repository, repoDir);
}
git('-C', repoDir, 'fetch', '--depth', '1', 'origin', lock.revision);
git('-C', repoDir, 'checkout', lock.revision, '--', ...Object.keys(lock.files));

let failed = false;
for (const [file, expected] of Object.entries(lock.files)) {
  const actual = sha256(readFileSync(join(repoDir, file)));
  if (actual !== expected) {
    log(`checksum mismatch: ${file} ${actual} (expected ${expected})`);
    failed = true;
  } else {
    copyFileSync(join(repoDir, file), join(sourceDir, file));
    log(`verified ${file}`);
  }
}
if (failed) {
  process.exitCode = 1;
} else {
  for (const [entry, expected] of Object.entries(lock.extracted)) {
    const bytes = extractZipEntry(join(sourceDir, 'Z-Anatomy.zip'), entry);
    const actual = sha256(bytes);
    if (actual !== expected) {
      log(`checksum mismatch: ${entry} ${actual} (expected ${expected})`);
      process.exitCode = 1;
      continue;
    }
    writeBytes(join(sourceDir, entry), bytes);
    log(`extracted and verified ${entry}`);
  }
}

// Models from other open sources: downloaded once, kept while their checksum matches.
for (const [file, { url, sha256: expected }] of Object.entries(external.files)) {
  const target = join(externalDir, file);
  if (existsSync(target) && sha256(readFileSync(target)) === expected) {
    log(`verified ${file}`);
    continue;
  }
  log(`downloading ${file}…`);
  const response = await fetch(url);
  if (!response.ok) {
    log(`download failed: ${file} (${response.status} ${response.statusText})`);
    process.exitCode = 1;
    continue;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) {
    log(`checksum mismatch: ${file} ${actual} (expected ${expected})`);
    process.exitCode = 1;
    continue;
  }
  writeBytes(target, bytes);
  log(`downloaded and verified ${file}`);
}
