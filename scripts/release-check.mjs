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
 * Publication gate for the npm packages and the Composer package. It fails on:
 *  - a placeholder Svitylo logo or canonical URL (BRANDING_PLACEHOLDER in ui/branding.ts);
 *  - missing CPAL-1.0 code licence files or package metadata;
 *  - an included data asset without confirmed commercial use, or a missing review notice;
 *  - inconsistent versions (library ↔ data package ↔ release folder) or no changelog entry;
 *  - a failed technical data validation (`pnpm data:validate`).
 * The licence audit of the data does not block a release: a pending audit and the `preview`
 * channel are reported as warnings.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const failures = [];
const fail = (message) => failures.push(message);
const warnings = [];
const warn = (message) => warnings.push(message);

// Branding.
const branding = read('packages/atlas/src/ui/branding.ts');
if (/BRANDING_PLACEHOLDER\s*=\s*true/.test(branding)) fail('branding: final Svitylo logo and URL are not set (BRANDING_PLACEHOLDER = true)');

// Code licence: CPAL adoption and no stale draft.
const INTEGRATIONS = ['packages/markdown', 'packages/laravel'];
for (const file of ['LICENSE.md', 'packages/atlas/LICENSE.md', ...INTEGRATIONS.map((dir) => `${dir}/LICENSE.md`)]) {
  if (!existsSync(join(ROOT, file))) {
    fail(`${file} is missing`);
    continue;
  }
  const text = read(file);
  if (/licence-text:\s*draft/.test(text)) fail(`${file}: the licence text is a draft awaiting legal approval`);
  if (!text.includes('SPDX-License-Identifier: CPAL-1.0')) fail(`${file}: expected CPAL-1.0 code terms`);
}
for (const pkg of ['packages/atlas/package.json', 'packages/markdown/package.json', 'packages/laravel/composer.json']) {
  if (json(pkg).license !== 'CPAL-1.0') fail(`${pkg}: expected CPAL-1.0`);
}
if (json('packages/data/package.json').license !== 'SEE LICENSE IN LICENSES.md') {
  fail('data: per-asset licences must remain separate from the code licence');
}

// Versions.
const atlas = json('packages/atlas/package.json');
const data = json('packages/data/package.json');
const releaseDir = `packages/data/releases/${data.version}`;
if (!existsSync(join(ROOT, releaseDir, 'manifest.json'))) fail(`data release ${data.version} is missing (${releaseDir})`);
else {
  const manifest = json(`${releaseDir}/manifest.json`);
  if (manifest.version !== data.version) fail(`${releaseDir}: manifest version ${manifest.version} differs from the package version`);
  if (manifest.channel !== 'release') warn(`data ${data.version}: channel is "${manifest.channel}" (the licence audit is not complete)`);
  for (const asset of manifest.assets) {
    if (asset.included && asset.audit?.status !== 'approved') warn(`data ${data.version}: licence audit of "${asset.id}" is ${asset.audit?.status ?? 'missing'}`);
    if (asset.included && asset.commercialUse !== 'allowed') fail(`data ${data.version}: "${asset.id}" is included without confirmed commercial use`);
  }
  if (!manifest.notices?.review) fail(`data ${data.version}: the anatomy review notice is missing`);
}
const dep = atlas.dependencies?.['@authorod/svitylo-3d-anatomy-data'];
if (dep && dep !== 'workspace:*' && dep !== data.version) fail(`atlas depends on data ${dep}, expected exactly ${data.version}`);

// Changelog (the integration packages have their own versions).
const integrationVersions = [['packages/markdown/CHANGELOG.md', json('packages/markdown/package.json').version]];
for (const [file, version] of [['CHANGELOG.md', atlas.version], ['packages/atlas/CHANGELOG.md', atlas.version], ...integrationVersions]) {
  if (!existsSync(join(ROOT, file)) || !read(file).includes(`## ${version}`)) fail(`${file}: no entry for ${version}`);
}
// Composer takes the version from the git tag of the split repository: the changelog must name one.
const composerLog = 'packages/laravel/CHANGELOG.md';
if (!existsSync(join(ROOT, composerLog)) || !/^## \d+\.\d+\.\d+/m.test(read(composerLog))) fail(`${composerLog}: no version entry`);

// Technical validation; the licence audit is reported above.
const validation = spawnSync('pnpm', ['--silent', '--filter', '@svitylo-atlas/tools', 'run', 'validate'], { cwd: ROOT, encoding: 'utf8' });
if (validation.status !== 0) fail(`data validation failed:\n${(validation.stdout + validation.stderr).trim().replace(/^/gm, '    ')}`);

if (warnings.length) console.warn(`Warnings (${warnings.length}):\n- ${warnings.join('\n- ')}`);
if (failures.length) {
  console.error(`Release check failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Release check passed for ${atlas.name}@${atlas.version} with data ${data.version}.`);
