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
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appliedFixes, fixDefinitions, type AppliedFix, type GeometryFixSource } from '@svitylo-atlas/tools/src/lib/geometry-fixes.js';
import { distanceToSurface, openings } from '@svitylo-atlas/tools/src/lib/mesh-checks.js';
import { validateRelease } from '@svitylo-atlas/tools/src/lib/validate.js';
import { FIXTURES } from './helpers.js';

type P = [number, number, number];

/** Triangle soup of quads given by their corners. */
function soup(quads: [P, P, P, P][]): number[] {
  const out: number[] = [];
  for (const [a, b, c, d] of quads) out.push(...a, ...b, ...c, ...a, ...c, ...d);
  return out;
}

const cube = (open: boolean): number[] => {
  const faces: [P, P, P, P][] = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]],
    [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
  ];
  return soup(open ? faces.slice(1) : faces);
};

describe('mesh checks', () => {
  it('finds the openings of a surface and welds split vertices', () => {
    expect(openings(cube(false))).toEqual([]);
    const [hole, ...rest] = openings(cube(true));
    expect(rest).toEqual([]);
    expect(hole!.vertices).toBe(4);
    expect(hole!.centre).toEqual([0.5, 0.5, 0]);
    expect(hole!.radius).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('measures the distance from a point to a surface', () => {
    const square = soup([[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]]);
    expect(distanceToSurface([0.25, 0.5, 2], square)).toBeCloseTo(2, 9);
    expect(distanceToSurface([2, 0.5, 0], square)).toBeCloseTo(1, 9);
    expect(distanceToSurface([-3, -4, 0], square)).toBeCloseTo(5, 9);
    expect(distanceToSurface([1.5, 1.5, 1], square)).toBeCloseTo(Math.sqrt(1.5), 9);
  });

  it('reports openings that must stay closed and seams missing from the report', async () => {
    const report = await validateRelease(join(FIXTURES, '1.0.0'), {
      openings: [
        { id: 'skeletal.femur_l', count: 0, minRadius: 0.001 },
        { id: 'skeletal.femur_r', count: 1, minRadius: 0.001 },
      ],
      junctions: [{ fix: 'femur-hip', structures: ['skeletal.femur_l'], maxGap: 0.001 }],
    });
    expect(report.errors).toEqual([
      'openings: skeletal.femur_r (standard) has 0 openings of 1 mm or more, expected 1',
      'openings: skeletal.femur_r (economy) has 0 openings of 1 mm or more, expected 1',
      'junction femur-hip: no seam in the coverage report',
    ]);
  });
});

describe('geometry fixes', () => {
  const fix: GeometryFixSource & { near: number[] } = {
    id: 'window',
    kind: 'close-hole',
    object: 'Stomach',
    near: [0, 0.5, 1],
    reason: 'A teaching window.',
    targets: [['8: Visceral systems', 'Stomach']],
    note: { en: 'The window is closed.' },
  };
  const applied: AppliedFix = { id: 'window', kind: 'close-hole', object: 'Stomach', seam: [[0, 0, 0]] };
  const exported = { definitions: fixDefinitions([fix]), applied: [applied] };

  it('accepts an export of the same fixes, whatever their reasons and notes', () => {
    expect(fixDefinitions([fix])).toEqual([{ id: 'window', kind: 'close-hole', object: 'Stomach', near: [0, 0.5, 1] }]);
    const renamed = { ...fix, reason: 'Another reason.', note: { en: 'Another note.' } };
    expect(appliedFixes([renamed], exported).get('window')).toBe(applied);
  });

  it('refuses an export made with other fixes or one that leaves a gap', () => {
    const moved: typeof fix = { ...fix, near: [0, 0.5, 1.1] };
    expect(() => appliedFixes([moved], exported)).toThrow(/run pnpm data:export/);
    expect(() => appliedFixes([fix], undefined)).toThrow(/run pnpm data:export/);
    const gap = { ...applied, kind: 'join-tube-end' as const, gapAfter: { mean: 0.001, max: 0.002 } };
    expect(() => appliedFixes([fix], { ...exported, applied: [gap] })).toThrow(/leaves a gap of 2.00 mm/);
  });
});
