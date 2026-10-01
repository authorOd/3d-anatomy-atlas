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
 * Runs the headless Blender export of the verified snapshot, with the models from other open
 * sources (packages/data/sources/external.json, placed by external-fit.json) and the declared
 * geometry corrections of packages/data/sources/geometry-fixes.json.
 *
 *   pnpm data:export [--work .work/zanatomy]   (BLENDER=/path/to/blender to override)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DATA_SOURCES, REPO_ROOT, WORK_DIR, log, readJson } from './lib/io.js';

const { values } = parseArgs({ options: { work: { type: 'string', default: join(WORK_DIR, 'zanatomy') } } });
const work = values.work!;
const lock = readJson<{ tools: { blender: string; subsurfMax: number; threads: number } }>(join(DATA_SOURCES, 'zanatomy.lock.json'));
const blender = process.env.BLENDER ?? 'blender';
const blend = join(work, 'source', 'Z-Anatomy', 'Startup.blend');
if (!existsSync(blend)) throw new Error(`${blend} not found; run pnpm data:source first`);
const version = execFileSync(blender, ['--version'], { encoding: 'utf8' }).split('\n')[0] ?? '';
if (!version.includes(lock.tools.blender)) log(`warning: ${version.trim()} differs from the locked Blender ${lock.tools.blender}`);
// With several threads Blender varies the last bit of some normals from run to run; the locked
// thread count (one) keeps the export byte-reproducible.
execFileSync(
  blender,
  [
    '-t',
    String(lock.tools.threads),
    '-b',
    blend,
    // A Python error must fail the command (Blender exits with 0 otherwise).
    '--python-exit-code',
    '1',
    '--python',
    join(REPO_ROOT, 'packages/tools/blender/export_zanatomy.py'),
    '--',
    '--out',
    join(work, 'export'),
    '--subsurf-max',
    String(lock.tools.subsurfMax),
    '--fixes',
    join(DATA_SOURCES, 'geometry-fixes.json'),
    '--external',
    join(DATA_SOURCES, 'external.json'),
    '--external-fit',
    join(DATA_SOURCES, 'external-fit.json'),
    '--external-dir',
    join(WORK_DIR, 'external'),
  ],
  { stdio: 'inherit' },
);
