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
 * Writes JSON Schema files generated from the Zod schemas (the single source of truth)
 * to packages/atlas/schema/.
 *
 *   pnpm schema:json
 */
import { join } from 'node:path';
import { jsonSchemas } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { REPO_ROOT, log, writeJson } from './lib/io.js';

const out = join(REPO_ROOT, 'packages/atlas/schema');
const schemas = jsonSchemas();
for (const [name, file] of [
  ['manifest', 'manifest.schema.json'],
  ['dictionary', 'dictionary.schema.json'],
  ['viewState', 'view-state.schema.json'],
] as const) {
  writeJson(join(out, file), schemas[name]);
  log(`wrote packages/atlas/schema/${file}`);
}
