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
 * Clean-install check: a clean project installs the packed packages (the data comes with the library),
 * exports the assets with the explicit command, builds with Vite and shows the atlas without any
 * Svitylo service. Needs network access to the npm registry (three, lit, zod, vite).
 *
 *   node scripts/clean-install-check.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 'svitylo-clean-install-'));
const project = join(work, 'site');
const PORT = 4391;

function run(cmd, args, cwd) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
}

let preview;
try {
  run('pnpm', ['--filter', '@authorod/svitylo-3d-anatomy-atlas', 'run', 'build'], ROOT);
  run('pnpm', ['pack', '--pack-destination', work], join(ROOT, 'packages/data'));
  run('pnpm', ['pack', '--pack-destination', work], join(ROOT, 'packages/atlas'));
  const tarballs = readdirSync(work).filter((f) => f.endsWith('.tgz'));
  const atlasTgz = tarballs.find((f) => f.includes('atlas'));
  const dataTgz = tarballs.find((f) => f.includes('data'));

  run('mkdir', ['-p', join(project, 'src')], work);
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify(
      {
        name: 'clean-install-site',
        private: true,
        type: 'module',
        dependencies: {
          '@authorod/svitylo-3d-anatomy-atlas': `file:../${atlasTgz}`,
          // Resolves the library's exact data dependency to the packed tarball (a new version is not on npm yet).
          '@authorod/svitylo-3d-anatomy-data': `file:../${dataTgz}`,
        },
        devDependencies: { vite: '^8.3.1' },
        scripts: {
          'atlas:assets': 'svitylo-anatomy export-assets public/anatomy-data',
          build: 'npm run atlas:assets && vite build',
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(project, 'index.html'),
    `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Clean install</title>
<link rel="stylesheet" href="/src/style.css"></head><body>
<svitylo-anatomy lang="uk" ui-lang="uk"></svitylo-anatomy>
<script type="module" src="/src/main.js"></script></body></html>\n`,
  );
  writeFileSync(join(project, 'src/style.css'), 'html,body{margin:0;height:100%}svitylo-anatomy{display:block;height:100vh}\n');
  writeFileSync(join(project, 'src/main.js'), "import '@authorod/svitylo-3d-anatomy-atlas';\n");

  run('npm', ['install', '--no-audit', '--no-fund'], project);
  run('npm', ['run', 'build'], project);
  if (!existsSync(join(project, 'dist/anatomy-data'))) throw new Error('dist/anatomy-data is missing');

  preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: project, stdio: 'ignore' });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  for (let i = 0; i < 60; i++) {
    try {
      await page.goto(`http://localhost:${PORT}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await page.waitForFunction(() => Boolean(document.querySelector('svitylo-anatomy')?.viewer), null, { timeout: 60_000 });
  const undefinedElements = await page.evaluate(() =>
    ['svitylo-anatomy-tree', 'svitylo-anatomy-search', 'svitylo-anatomy-info'].filter((tag) => !customElements.get(tag)),
  );
  const glbBefore = requests.filter((u) => u.endsWith('.glb')).length;
  const result = await page.evaluate(async () => {
    const el = document.querySelector('svitylo-anatomy');
    const r = await el.showStructure('cardiovascular.heart');
    return { status: r.status, selected: el.getState().selected, stats: el.viewer.getResourceStats() };
  });
  await browser.close();

  const foreign = requests.filter((u) => !u.startsWith(`http://localhost:${PORT}/`));
  const problems = [];
  if (undefinedElements.length) problems.push(`custom elements not defined: ${undefinedElements.join(', ')}`);
  if (glbBefore !== 0) problems.push(`${glbBefore} GLB requests before any action`);
  if (result.status !== 'complete') problems.push(`showStructure status ${result.status}`);
  if (result.stats.readyChunks < 1 || result.stats.failedChunks) problems.push(`chunks: ${JSON.stringify(result.stats)}`);
  if (foreign.length) problems.push(`requests to other hosts: ${foreign.slice(0, 5).join(', ')}`);
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`clean install ok: ${result.stats.readyChunks} chunk(s) loaded, ${requests.length} requests, all same-origin`);
} finally {
  preview?.kill();
  if (!keep) rmSync(work, { recursive: true, force: true });
  else console.log(`kept ${work}`);
}
