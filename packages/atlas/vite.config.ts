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
import { defaultClientConditions, defineConfig } from 'vite';

/**
 * Library build: plain ES modules for bundlers and native `import`. Three.js, Lit and Zod stay
 * external (peer copies are shared with the host application); the default data version is
 * inlined from the data package so the library and its data release always match.
 */
const external = [/^three(?:\/.*)?$/, /^lit(?:\/.*)?$/, /^@lit\//, /^@lit-labs\//, /^zod(?:\/.*)?$/];

export default defineConfig({
  resolve: { conditions: ['source', ...defaultClientConditions] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    copyPublicDir: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        core: 'src/core/index.ts',
        schema: 'src/schema/index.ts',
        'strict-csp': 'src/strict-csp.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
