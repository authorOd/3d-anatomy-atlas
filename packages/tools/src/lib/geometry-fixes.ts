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
import { canonicalJson, type LocalizedText } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import type { Vec3 } from './mesh-checks.js';

export type GeometryFixKind = 'close-hole' | 'join-tube-end' | 'seal-opening' | 'warp-curves';

/** A declared correction of the source geometry (`sources/geometry-fixes.json`). */
export interface GeometryFixSource {
  id: string;
  kind: GeometryFixKind;
  object: string;
  reason: string;
  /** Structures whose card shows the note, as [collection, object] references. */
  targets: [collection: string, name: string][];
  note: LocalizedText;
  /** Largest gap allowed across the seam after the fix, in metres (default SEAM_TOLERANCE). */
  maxGap?: number;
}

/** A correction as applied and reported by the Blender export (Blender coordinates). */
export interface AppliedFix {
  id: string;
  kind: GeometryFixKind;
  object: string;
  gapBefore?: { mean: number; max: number };
  gapAfter?: { mean: number; max: number };
  /** warp-curves: the largest displacement of a control point, in metres. */
  maxDisplacement?: number;
  seam: Vec3[];
}

/** A correction as listed in the coverage report of a release (atlas coordinates). */
export interface CoverageCorrection {
  id: string;
  kind: GeometryFixKind;
  structures: string[];
  reason: string;
  /** Largest gap across the seam before and after the correction, in metres. */
  gapBefore?: number;
  gapAfter?: number;
  /** Largest displacement of a warped curve, in metres. */
  maxDisplacement?: number;
  /** Points where the corrected surfaces meet (joins, seals) or the closed opening was. */
  seam: Vec3[];
}

/** Largest gap a join or a seal may leave in the export (its own measurement). */
export const SEAM_TOLERANCE = 0.0002;

/** Fields that document a fix; they do not change the geometry (see geometry_fixes.py). */
const DOCUMENTATION = new Set(['reason', 'note', 'targets', 'maxGap']);

/** What the geometry depends on: every fix without its documentation fields. */
export function fixDefinitions(fixes: object[]): object[] {
  return fixes.map((fix) => Object.fromEntries(Object.entries(fix).filter(([key]) => !DOCUMENTATION.has(key))));
}

/**
 * Checks that the export applied exactly the declared fixes (their geometric part; reasons and
 * notes may change without a new export) and closed the seams it measures; returns the applied
 * fixes by ID.
 */
export function appliedFixes(
  declared: GeometryFixSource[],
  exported: { definitions: object[]; applied: AppliedFix[] } | undefined,
): Map<string, AppliedFix> {
  if (!exported || canonicalJson(fixDefinitions(declared)) !== canonicalJson(exported.definitions)) {
    throw new Error('The export was made with other geometry fixes than sources/geometry-fixes.json; run pnpm data:export');
  }
  const applied = new Map(exported.applied.map((f) => [f.id, f]));
  for (const fix of declared) {
    const done = applied.get(fix.id);
    if (!done) throw new Error(`Geometry fix ${fix.id} is missing from the export`);
    if (done.gapAfter && done.gapAfter.max > (fix.maxGap ?? SEAM_TOLERANCE)) {
      throw new Error(`Geometry fix ${fix.id} leaves a gap of ${(done.gapAfter.max * 1000).toFixed(2)} mm`);
    }
  }
  return applied;
}
