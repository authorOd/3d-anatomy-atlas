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
 * Reviews the trunk organs of the last export for overlaps and junction gaps (a maintainer tool):
 * runs packages/tools/blender/check_overlaps.py on .work/zanatomy/export and writes
 * .work/zanatomy/overlaps.json. Run it after pnpm data:export.
 *
 *   pnpm data:overlaps [--work .work/zanatomy]   (BLENDER=/path/to/blender to override)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT, WORK_DIR } from './lib/io.js';

const { values } = parseArgs({ options: { work: { type: 'string', default: join(WORK_DIR, 'zanatomy') } } });
const exportDir = join(values.work!, 'export');
if (!existsSync(join(exportDir, 'export.json'))) throw new Error(`No export in ${exportDir}; run pnpm data:export first`);
execFileSync(
  process.env.BLENDER ?? 'blender',
  [
    '-b',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    join(REPO_ROOT, 'packages/tools/blender/check_overlaps.py'),
    '--',
    '--export',
    exportDir,
    '--out',
    join(values.work!, 'overlaps.json'),
  ],
  { stdio: 'inherit' },
);
