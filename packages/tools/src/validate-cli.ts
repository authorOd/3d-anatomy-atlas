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
 * Technical validation of data releases (schema, integrity, checksums, GLB ↔ ID mapping, scale,
 * orientation, quality levels, licences, the seams of declared geometry corrections). It never
 * marks anatomy as reviewed.
 *
 *   pnpm data:validate                     # every release in packages/data/releases
 *   pnpm data:validate -- <dir> [--release] # one folder; --release adds publication requirements
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DATA_PACKAGE, DATA_RELEASES, DATA_SOURCES, readJson } from './lib/io.js';
import { validateRelease, type JunctionCheck, type OpeningCheck, type OrientationCheck } from './lib/validate.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    release: { type: 'boolean', default: false },
    'no-anatomy-checks': { type: 'boolean', default: false },
  },
});

const checks = readJson<{
  heightRange: [number, number];
  orientation: OrientationCheck[];
  openings: OpeningCheck[];
  junctions: JunctionCheck[];
}>(join(DATA_SOURCES, 'checks.json'));
// The geometry checks describe releases built from the current sources, i.e. the version of the
// data package; older releases kept next to it were built before those corrections.
const current = readJson<{ version: string }>(join(DATA_PACKAGE, 'package.json')).version;
const targets = positionals.length
  ? positionals.map((p) => resolve(p))
  : existsSync(DATA_RELEASES)
    ? readdirSync(DATA_RELEASES).map((v) => join(DATA_RELEASES, v))
    : [];

if (targets.length === 0) {
  console.error('No data release found.');
  process.exit(1);
}

let failed = false;
for (const dir of targets) {
  const report = await validateRelease(dir, {
    release: values.release,
    ...(values['no-anatomy-checks'] ? {} : { heightRange: checks.heightRange, orientation: checks.orientation }),
    ...(values['no-anatomy-checks'] || basename(dir) !== current ? {} : { openings: checks.openings, junctions: checks.junctions }),
  });
  const { stats } = report;
  const status = report.errors.length ? 'FAILED' : 'ok';
  console.log(
    `${status}: ${dir} — ${stats.files} files, ${stats.chunks} chunks, ` +
      `${stats.triangles.standard.toLocaleString('en')} / ${stats.triangles.economy.toLocaleString('en')} triangles (standard / economy)`,
  );
  for (const w of report.warnings) console.log(`  warning: ${w}`);
  for (const e of report.errors) console.log(`  error: ${e}`);
  if (report.errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
