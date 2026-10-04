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
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { UK_SOURCES, ukTermLookup, ukrainianDraft } from '@svitylo-atlas/tools/src/lib/terms.js';
import type { SourceNode } from '@svitylo-atlas/tools/src/lib/tree.js';
import { validateRelease } from '@svitylo-atlas/tools/src/lib/validate.js';
import { FIXTURES, REPO } from './helpers.js';

const RELEASES = join(REPO, 'packages/data/releases');
const CLI = join(REPO, 'packages/atlas/bin/svitylo-anatomy.mjs');
const checks = JSON.parse(readFileSync(join(REPO, 'packages/data/sources/checks.json'), 'utf8'));
// The geometry checks describe the release built from the current sources (the package version).
const current = JSON.parse(readFileSync(join(REPO, 'packages/data/package.json'), 'utf8')).version;

describe('data releases', () => {
  for (const version of existsSync(RELEASES) ? readdirSync(RELEASES) : []) {
    it(`release ${version} passes technical validation`, async () => {
      const report = await validateRelease(join(RELEASES, version), {
        heightRange: checks.heightRange,
        orientation: checks.orientation,
        ...(version === current ? { openings: checks.openings, junctions: checks.junctions } : {}),
      });
      expect(report.errors).toEqual([]);
      const manifest = JSON.parse(readFileSync(join(RELEASES, version, 'manifest.json'), 'utf8'));
      // The standard set contains only assets with confirmed commercial use.
      for (const asset of manifest.assets) if (asset.included) expect(asset.commercialUse).toBe('allowed');
      // Economy geometry really is cheaper.
      expect(report.stats.triangles.economy).toBeLessThan(report.stats.triangles.standard * 0.6);
    }, 120_000);
  }

  for (const version of readdirSync(FIXTURES)) {
    it(`fixture ${version} passes technical validation`, async () => {
      const report = await validateRelease(join(FIXTURES, version));
      expect(report.errors).toEqual([]);
    });
  }

  it('detects a tampered file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'svitylo-release-'));
    try {
      execFileSync('cp', ['-r', join(FIXTURES, '1.0.0'), dir]);
      const target = join(dir, '1.0.0');
      appendFileSync(join(target, 'names/en.json'), ' ');
      const report = await validateRelease(target);
      expect(report.errors.join('\n')).toMatch(/checksum mismatch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('export-assets command', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'svitylo-export-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { cwd: tmp, encoding: 'utf8' });

  it('copies the installed data release with licences and checksums, idempotently', () => {
    const out = run('export-assets', 'public/anatomy-data');
    expect(out).toMatch(/exported data/);
    const version = readdirSync(join(tmp, 'public/anatomy-data'))[0]!;
    const dest = join(tmp, 'public/anatomy-data', version);
    for (const file of ['manifest.json', 'SHA256SUMS', 'ATTRIBUTION.md', 'LICENSES.md', 'reports/COVERAGE.md']) {
      expect(existsSync(join(dest, file)), file).toBe(true);
    }
    expect(run('verify', dest)).toMatch(/^ok:/);
    expect(run('export-assets', 'public/anatomy-data')).toMatch(/up to date/);
  });

  it('never silently overwrites a modified version folder and keeps other versions', () => {
    const root = join(tmp, 'public/anatomy-data');
    const version = readdirSync(root)[0]!;
    appendFileSync(join(root, version, 'LICENSES.md'), '\nlocal edit\n');
    execFileSync('mkdir', ['-p', join(root, '0.9.0')]);
    expect(() => run('export-assets', 'public/anatomy-data')).toThrow(/immutable/);
    expect(run('export-assets', 'public/anatomy-data', '--force')).toMatch(/exported data/);
    expect(existsSync(join(root, '0.9.0'))).toBe(true);
  });

  it('leaves files of the site in a version folder alone (the atlas never requests them)', () => {
    const root = join(tmp, 'public/anatomy-data');
    const version = readdirSync(root).find((v) => v !== '0.9.0')!;
    writeFileSync(join(root, version, '.htaccess'), 'Header set Cache-Control "max-age=31536000, immutable"\n');
    expect(run('export-assets', 'public/anatomy-data')).toMatch(/up to date/);
    appendFileSync(join(root, version, 'LICENSES.md'), '\nlocal edit\n');
    expect(run('export-assets', 'public/anatomy-data', '--force')).toMatch(/exported data/);
    expect(existsSync(join(root, version, '.htaccess'))).toBe(true);
    // The full check still lists it.
    expect(() => run('verify', join(root, version))).toThrow(/not listed in SHA256SUMS: \.htaccess/);
  });

  it('with --prune removes the other versions of the same model and nothing the site added', () => {
    const root = join(tmp, 'public/anatomy-data');
    const version = readdirSync(root).find((v) => v !== '0.9.0')!;
    // Older releases of this model (copies under other versions); one keeps the site's .htaccess
    // and gets another site file, the other has none.
    execFileSync('cp', ['-r', join(root, version), join(root, '0.8.0')]);
    writeFileSync(join(root, '0.8.0', 'robots.txt'), 'site file\n');
    execFileSync('cp', ['-r', join(root, version), join(root, '0.6.0')]);
    rmSync(join(root, '0.6.0', '.htaccess'));
    // A release of another model, a folder that is not a release ('0.9.0' is empty) and one that
    // is not named like a version.
    execFileSync('cp', ['-r', join(root, version), join(root, '0.7.0')]);
    const manifest = JSON.parse(readFileSync(join(root, '0.7.0', 'manifest.json'), 'utf8'));
    writeFileSync(join(root, '0.7.0', 'manifest.json'), JSON.stringify({ ...manifest, model: 'another-model' }));
    execFileSync('mkdir', ['-p', join(root, 'uploads')]);

    const dry = run('export-assets', 'public/anatomy-data', '--prune', '--dry-run');
    expect(dry).toMatch(/would remove data 0\.6\.0/);
    expect(dry).toMatch(/would remove data 0\.8\.0/);
    expect(existsSync(join(root, '0.6.0', 'manifest.json'))).toBe(true);

    const out = run('export-assets', 'public/anatomy-data', '--prune');
    expect(out).toMatch(/up to date/);
    expect(out).toMatch(/removed data 0\.6\.0 \(\d+ files\)/);
    expect(existsSync(join(root, '0.6.0'))).toBe(false);
    expect(out).toMatch(/removed data 0\.8\.0 from .*kept 2 file\(s\)/);
    expect(readdirSync(join(root, '0.8.0')).sort()).toEqual(['.htaccess', 'robots.txt']);
    expect(out).toMatch(/kept .*0\.7\.0: data of another model \(another-model\)/);
    expect(out).toMatch(/kept .*0\.9\.0: no readable manifest\.json/);
    expect(readdirSync(root).sort()).toEqual(['0.7.0', '0.8.0', '0.9.0', version, 'uploads'].sort());
    // The exported version is untouched.
    expect(run('export-assets', 'public/anatomy-data')).toMatch(/up to date/);
  });
});

describe('Ukrainian drafts', () => {
  it("prefers the editors' drafts, falls back to machine-assisted ones and composes attachment names", () => {
    const lookup = ukTermLookup(
      new Map([['biceps brachii', { name: "Двоголовий м'яз плеча" }]]),
      new Map([
        ['biceps brachii', { name: 'інший варіант' }],
        ['deltoid', { name: "Дельтоподібний м'яз" }],
      ]),
    );
    expect(lookup('Biceps  Brachii')).toEqual({ name: "Двоголовий м'яз плеча", source: UK_SOURCES.editors });
    expect(lookup('Deltoid')).toEqual({ name: "Дельтоподібний м'яз", source: UK_SOURCES.machine });
    const node = (extra: Partial<SourceNode>) => ({ kind: 'structure', termKey: null, system: { id: 'insertions' }, ...extra }) as SourceNode;
    const origin = ukrainianDraft(node({ attachmentOf: { base: 'Biceps brachii', kind: 'origin', index: 2 } }), lookup);
    expect(origin?.name).toBe("Двоголовий м'яз плеча (початок 2)");
    expect(origin?.source).toContain(UK_SOURCES.editors);
    expect(ukrainianDraft(node({ attachmentOf: { base: 'Deltoid', kind: 'insertion' } }), lookup)?.name).toBe("Дельтоподібний м'яз (прикріплення)");
    expect(ukrainianDraft(node({ attachmentOf: { base: 'Deltoid', kind: 'group' } }), lookup)?.name).toBe("Дельтоподібний м'яз (місця прикріплення)");
    // Nothing is invented for a muscle without a Ukrainian name.
    expect(ukrainianDraft(node({ attachmentOf: { base: 'Unknown muscle', kind: 'origin' } }), lookup)).toBeUndefined();
    expect(ukrainianDraft(node({ termKey: 'Deltoid' }), lookup)?.name).toBe("Дельтоподібний м'яз");
  });
});
