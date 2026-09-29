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
import { describe, expect, it } from 'vitest';
import {
  ManifestSchema,
  checkManifestIntegrity,
  isSafeRelativePath,
  normalizeBaseUrl,
  resolveDataPath,
  siblingVersionBase,
  type Manifest,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { readFixtureManifest } from './helpers.js';

const clone = <T>(v: T): T => structuredClone(v);

describe('manifest validation', () => {
  it('accepts the generated fixture manifest', () => {
    const result = ManifestSchema.safeParse(readFixtureManifest());
    expect(result.success).toBe(true);
  });

  it('detects broken hierarchy, aliases, mesh coverage and licence problems', () => {
    const base = readFixtureManifest() as Manifest;
    const problems = (mutate: (m: Manifest) => void) => {
      const m = clone(base);
      mutate(m);
      return checkManifestIntegrity(m).join('\n');
    };
    expect(problems((m) => m.structures.push({ ...m.structures[1]! }))).toMatch(/Duplicate structure id/);
    expect(problems((m) => (m.structures[2]!.parent = 'integument.missing'))).toMatch(/missing parent/);
    expect(
      problems((m) => {
        const a = m.structures.find((s) => s.id === 'cardiovascular.heart')!;
        const b = m.structures.find((s) => s.id === 'cardiovascular.heart.left_ventricle')!;
        a.parent = b.id;
      }),
    ).toMatch(/Cycle in hierarchy/);
    expect(problems((m) => (m.aliases['cardiovascular.heart'] = 'skeletal.skull'))).toMatch(/conflicts with an existing structure/);
    expect(problems((m) => (m.aliases['old.id'] = 'cardiovascular.cor'))).toMatch(/points to missing structure|Alias chain/);
    expect(problems((m) => (m.chunks[0]!.meshCount += 1))).toMatch(/several chunks|exceeds mesh table/);
    expect(
      problems((m) => {
        const blocked = m.assets.find((a) => a.id === 'fixture-blocked')!;
        blocked.included = true;
      }),
    ).toMatch(/included without confirmed commercial use/);
    expect(
      problems((m) => {
        m.channel = 'release';
        m.assets[0]!.audit = { status: 'pending' };
      }),
    ).toMatch(/licence audit is not approved/);
  });

  it('rejects markup in names and unsafe file paths', () => {
    const m = clone(readFixtureManifest());
    m.assets[0].title = '<script>alert(1)</script>';
    expect(ManifestSchema.safeParse(m).success).toBe(false);
    const n = clone(readFixtureManifest());
    n.chunks[0].files.standard.path = '../../secret.glb';
    expect(ManifestSchema.safeParse(n).success).toBe(false);
  });
});

describe('data paths', () => {
  it('accepts only plain relative paths', () => {
    for (const ok of ['manifest.json', 'standard/skeletal/femur.glb', 'names/uk.json']) expect(isSafeRelativePath(ok)).toBe(true);
    for (const bad of ['../x.glb', '/abs.glb', 'https://evil.test/x.glb', 'a//b.glb', '.hidden', 'a\\b.glb', 'x.glb?y=1', 'a/./b', '%2e%2e/x', '']) {
      expect(isSafeRelativePath(bad), bad).toBe(false);
    }
  });

  it('never resolves outside the configured data base', () => {
    const base = normalizeBaseUrl('/anatomy-data/1.0.0', 'https://site.test/atlas/page');
    expect(base.href).toBe('https://site.test/anatomy-data/1.0.0/');
    expect(resolveDataPath(base, 'standard/a.glb')).toBe('https://site.test/anatomy-data/1.0.0/standard/a.glb');
    expect(() => resolveDataPath(base, '../1.1.0/manifest.json')).toThrow();
    expect(() => normalizeBaseUrl('javascript:alert(1)', 'https://site.test/')).toThrow();
    expect(() => normalizeBaseUrl('https://user:pw@site.test/data/', 'https://site.test/')).toThrow();
  });

  it('looks up other data versions only in the sibling folder of the same site', () => {
    const base = normalizeBaseUrl('https://site.test/anatomy-data/1.1.0/', 'https://site.test/');
    expect(siblingVersionBase(base, '1.1.0', '1.0.0')?.href).toBe('https://site.test/anatomy-data/1.0.0/');
    expect(siblingVersionBase(base, '1.1.0', '../../x')).toBeNull();
    expect(siblingVersionBase(normalizeBaseUrl('https://site.test/data/', 'https://site.test/'), '1.1.0', '1.0.0')).toBeNull();
  });
});
