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
import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defineConfig } from 'vite';

/** Bundles the atlas and the Livewire bridge for the workbench app (pnpm laravel:assets). */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { conditions: ['source', ...defaultClientConditions] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
    // One test bundle with Three.js inside; its size does not matter here.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: fileURLToPath(new URL('resources/js/app.ts', import.meta.url)),
      output: { entryFileNames: 'app.js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
