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
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, defaultClientConditions, type Plugin } from 'vite';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const fixtures = join(repoRoot, 'test/fixtures/anatomy-data');

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.md': 'text/markdown; charset=utf-8',
};

/** Development/test only: serves the synthetic fixture datasets under /test-data/. */
function fixtureData(): Plugin {
  return {
    name: 'svitylo-fixture-data',
    configureServer(server) {
      server.middlewares.use('/test-data', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const file = normalize(join(fixtures, decodeURIComponent(url.pathname)));
        if (!file.startsWith(fixtures) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Content-Length', String(statSync(file).size));
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
        void next;
      });
    },
  };
}

export default defineConfig({
  resolve: {
    // Use the library sources directly inside the workspace.
    conditions: ['source', ...defaultClientConditions],
  },
  plugins: [fixtureData()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: resolve(fileURLToPath(new URL('.', import.meta.url)), 'index.html'),
        // A note with embeds rendered from Markdown.
        notes: resolve(fileURLToPath(new URL('.', import.meta.url)), 'notes.html'),
      },
    },
  },
});
