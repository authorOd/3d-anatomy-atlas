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
 * Architectural boundaries of the library (run in CI next to the unit tests):
 *  - the headless core never imports Lit or UI modules;
 *  - the schema module depends only on Zod;
 *  - no module depends on Svitylo/Laravel services, analytics or third-party CDNs;
 *  - the built bundles import nothing but Three.js, Lit and Zod, and register every inner element;
 *  - the integration packages (Markdown, the Laravel JS bridge) import only their declared
 *    dependencies.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages/atlas/src');
const DIST = join(ROOT, 'packages/atlas/dist');
const problems = [];

function files(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : ext.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

/** Import specifiers of a module (comments are ignored, so documented examples do not count). */
function imports(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const m of text.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;(])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);

for (const file of files(join(SRC, 'core'), ['.ts'])) {
  for (const spec of imports(readFileSync(file, 'utf8'))) {
    if (/^lit|^@lit\/|\/ui\//.test(spec)) problems.push(`${rel(file)}: core must not import ${spec}`);
  }
}

for (const file of files(join(SRC, 'schema'), ['.ts'])) {
  for (const spec of imports(readFileSync(file, 'utf8'))) {
    if (!spec.startsWith('.') && spec !== 'zod') problems.push(`${rel(file)}: schema may depend only on zod, found ${spec}`);
  }
}

const FORBIDDEN_TEXT = [
  /sendBeacon/,
  /google-analytics|googletagmanager|gtag\(/,
  /fonts\.googleapis|unpkg\.com|jsdelivr|cdnjs/,
  /laravel|livewire|inertia/i,
  /\/api\/svitylo|svitylo\.(?:com|org|ua)\/api/i,
];
for (const file of files(SRC, ['.ts'])) {
  const text = readFileSync(file, 'utf8');
  for (const re of FORBIDDEN_TEXT) if (re.test(text)) problems.push(`${rel(file)}: forbidden reference ${re}`);
}

// Integration packages: only their declared dependencies; no services, analytics or CDNs.
const INTEGRATIONS = [
  ['packages/markdown/src', ['.ts'], /^markdown-it$/],
  ['packages/laravel/resources/js', ['.js'], /^$/],
];
const SERVICE_TEXT = FORBIDDEN_TEXT.filter((re) => !re.test('laravel'));
for (const [dir, ext, allowed] of INTEGRATIONS) {
  for (const file of files(join(ROOT, dir), ext)) {
    const text = readFileSync(file, 'utf8');
    for (const spec of imports(text)) {
      if (!spec.startsWith('.') && !allowed.test(spec)) problems.push(`${rel(file)}: imports ${spec}`);
    }
    for (const re of SERVICE_TEXT) if (re.test(text)) problems.push(`${rel(file)}: forbidden reference ${re}`);
  }
}

const ALLOWED_BARE = /^(?:three(?:\/.*)?|lit(?:\/.*)?|@lit\/.+|zod(?:\/.*)?)$/;
const built = files(DIST, ['.js']);
for (const file of built) {
  for (const spec of imports(readFileSync(file, 'utf8'))) {
    if (!spec.startsWith('.') && !ALLOWED_BARE.test(spec)) problems.push(`${rel(file)}: bundle imports ${spec}`);
  }
}

// The build drops a registration that runs only when its module is imported without names, so the
// bundles must still contain every define call of the inner elements.
if (built.length) {
  const bundles = built.map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const tag of ['svitylo-anatomy-tree', 'svitylo-anatomy-search', 'svitylo-anatomy-info']) {
    if (!new RegExp(`customElements\\.define\\(\\s*['"\`]${tag}['"\`]`).test(bundles)) problems.push(`${rel(DIST)}: <${tag}> is never registered`);
  }
}

if (problems.length) {
  console.error(`Boundary check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Boundaries ok (${built.length ? `${built.length} built files checked` : 'no build output; sources only'}).`);
