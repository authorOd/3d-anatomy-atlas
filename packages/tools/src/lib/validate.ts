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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DictionarySchema,
  ManifestSchema,
  canonicalJson,
  isSafeRelativePath,
  type FileRef,
  type Manifest,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import type { CoverageCorrection } from './geometry-fixes.js';
import { readChunkGlb } from './glb-writer.js';
import { sha256 } from './io.js';
import { distanceToSurface, openings } from './mesh-checks.js';

export interface OrientationCheck {
  /** Structure that must lie in front of (greater Z than) `behind`. */
  front?: string;
  behind?: string;
  /** Structure that must lie on the patient's left (+X) of `right`. */
  left?: string;
  right?: string;
  /** Structure that must lie above `below`. */
  above?: string;
  below?: string;
}

/** A structure must have exactly `count` openings with a radius of at least `minRadius` (m). */
export interface OpeningCheck {
  id: string;
  count: number;
  minRadius: number;
}

/**
 * The seam of a declared geometry correction (from the coverage report) must lie within
 * `maxGap` (m) of every listed structure, at both quality levels.
 */
export interface JunctionCheck {
  fix: string;
  structures: string[];
  maxGap: number;
}

export interface ValidationOptions {
  /** Requirements of a publishable release (approved licence audit). */
  release?: boolean;
  /** Expected body height range in metres (skipped when absent). */
  heightRange?: [number, number];
  orientation?: OrientationCheck[];
  openings?: OpeningCheck[];
  junctions?: JunctionCheck[];
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  stats: { files: number; chunks: number; triangles: { standard: number; economy: number } };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Technical validation of a data release: schema and referential integrity, files and
 * checksums, GLB validity and the ID ↔ mesh mapping, scale and orientation, quality levels,
 * dictionaries and licence consistency. It never marks anatomy as reviewed.
 */
export async function validateRelease(dir: string, options: ValidationOptions = {}): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: ValidationReport['stats'] = { files: 0, chunks: 0, triangles: { standard: 0, economy: 0 } };
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return { errors: [`manifest.json missing in ${dir}`], warnings, stats };

  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 50)) errors.push(`manifest: ${issue.path.join('.')}: ${issue.message}`);
    return { errors, warnings, stats };
  }
  const m = parsed.data;
  const { contentHash, ...body } = raw;
  if (sha256(canonicalJson(body)) !== contentHash) errors.push('manifest: contentHash does not match the manifest content');
  if (options.release && m.channel !== 'release') errors.push(`channel is "${m.channel}", a publishable release needs "release"`);

  // Files and checksums.
  const sumsPath = join(dir, 'SHA256SUMS');
  const listed = new Map<string, string>();
  if (!existsSync(sumsPath)) errors.push('SHA256SUMS missing');
  else {
    for (const line of readFileSync(sumsPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) {
        errors.push(`SHA256SUMS: malformed line "${line.slice(0, 80)}"`);
        continue;
      }
      listed.set(match[2]!, match[1]!);
    }
  }
  const present = listFiles(dir).filter((f) => f !== 'SHA256SUMS');
  stats.files = present.length;
  for (const file of present) {
    if (!isSafeRelativePath(file)) errors.push(`unsafe file name: ${file}`);
    const expected = listed.get(file);
    if (!expected) errors.push(`file not listed in SHA256SUMS: ${file}`);
    else if (sha256(readFileSync(join(dir, file))) !== expected) errors.push(`checksum mismatch: ${file}`);
  }
  for (const file of listed.keys()) if (!present.includes(file)) errors.push(`listed file missing: ${file}`);

  const checkRef = (ref: FileRef, what: string): Buffer | null => {
    const p = join(dir, ref.path);
    if (!existsSync(p)) {
      errors.push(`${what}: missing file ${ref.path}`);
      return null;
    }
    const bytes = readFileSync(p);
    if (bytes.byteLength !== ref.bytes) errors.push(`${what}: size mismatch for ${ref.path}`);
    if (sha256(bytes) !== ref.sha256) errors.push(`${what}: checksum mismatch for ${ref.path}`);
    return bytes;
  };

  // Dictionaries.
  const ids = new Set(m.structures.map((s) => s.id));
  for (const [lang, ref] of Object.entries(m.dictionaries)) {
    const bytes = checkRef(ref!, `dictionary ${lang}`);
    if (!bytes) continue;
    const dict = DictionarySchema.safeParse(JSON.parse(bytes.toString('utf8')));
    if (!dict.success) {
      errors.push(`dictionary ${lang}: ${dict.error.issues[0]?.path.join('.')}: ${dict.error.issues[0]?.message}`);
      continue;
    }
    if (dict.data.version !== m.version || dict.data.model !== m.model || dict.data.lang !== lang) {
      errors.push(`dictionary ${lang}: version/model/lang mismatch`);
    }
    const covered = new Set([...Object.keys(dict.data.entries), ...dict.data.missing]);
    for (const id of Object.keys(dict.data.entries)) if (!ids.has(id)) errors.push(`dictionary ${lang}: unknown id ${id}`);
    for (const id of ids) if (!covered.has(id)) errors.push(`dictionary ${lang}: ${id} is neither named nor listed as missing`);
  }
  for (const [name, ref] of Object.entries(m.reports)) checkRef(ref, `report ${name}`);

  // Chunks: GLB validity, mesh mapping, quality levels.
  const owner = new Map<number, string>();
  for (const s of m.structures) for (const mesh of s.meshes ?? []) owner.set(mesh, s.id);
  // Triangles (world coordinates) of the structures that geometric checks look at.
  const checked = new Set([...(options.openings ?? []).map((c) => c.id), ...(options.junctions ?? []).flatMap((c) => c.structures)]);
  const soups = { standard: new Map<string, number[]>(), economy: new Map<string, number[]>() };
  const centroids = new Map<number, { sum: [number, number, number]; n: number }>();
  const eps = 1e-3;
  for (const chunk of m.chunks) {
    stats.chunks++;
    const triangles: Record<string, number> = {};
    for (const quality of ['standard', 'economy'] as const) {
      const ref = chunk.files[quality];
      const bytes = checkRef(ref, `chunk ${chunk.id} (${quality})`);
      if (!bytes) continue;
      let decoded;
      try {
        decoded = await readChunkGlb(new Uint8Array(bytes));
      } catch (error) {
        errors.push(`chunk ${chunk.id} (${quality}): invalid GLB: ${(error as Error).message}`);
        continue;
      }
      const { nodes, prims } = decoded;
      if (nodes.length !== 1 || prims.length !== 1) {
        errors.push(`chunk ${chunk.id} (${quality}): expected one node with one primitive`);
        continue;
      }
      const node = nodes[0]!;
      const prim = prims[0]!;
      const position = prim.getAttribute('POSITION');
      const normal = prim.getAttribute('NORMAL');
      const id = prim.getAttribute('_ID');
      const index = prim.getIndices();
      if (!position || !normal || !id || !index) {
        errors.push(`chunk ${chunk.id} (${quality}): missing POSITION, NORMAL, _ID or indices`);
        continue;
      }
      const matrix = node.getWorldMatrix();
      const vertexCount = position.getCount();
      const triCount = index.getCount() / 3;
      triangles[quality] = triCount;
      stats.triangles[quality] += triCount;
      if (triCount !== ref.triangles) errors.push(`chunk ${chunk.id} (${quality}): ${triCount} triangles, manifest says ${ref.triangles}`);
      if (vertexCount !== ref.vertices) errors.push(`chunk ${chunk.id} (${quality}): vertex count mismatch`);
      const seen = new Set<number>();
      const el: number[] = [];
      const p: number[] = [];
      const world = (v: number): [number, number, number] => {
        position.getElement(v, p);
        const [x, y, z] = [p[0]!, p[1]!, p[2]!];
        return [
          matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
          matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
          matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
        ];
      };
      for (let v = 0; v < vertexCount; v++) {
        id.getElement(v, el);
        const mesh = Math.round(el[0]!);
        if (mesh < chunk.meshStart || mesh >= chunk.meshStart + chunk.meshCount) {
          errors.push(`chunk ${chunk.id} (${quality}): vertex references mesh ${mesh} outside the chunk`);
          break;
        }
        if (Math.round(el[1]!) >= m.materials.length) {
          errors.push(`chunk ${chunk.id} (${quality}): palette index out of range`);
          break;
        }
        seen.add(mesh);
        const w = world(v);
        for (let c = 0; c < 3; c++) {
          if (w[c]! < m.bounds.min[c]! - eps || w[c]! > m.bounds.max[c]! + eps) {
            errors.push(`chunk ${chunk.id} (${quality}): geometry outside the declared bounds`);
            v = vertexCount;
            break;
          }
        }
        if (quality === 'standard') {
          const acc = centroids.get(mesh) ?? { sum: [0, 0, 0], n: 0 };
          acc.sum[0] += w[0];
          acc.sum[1] += w[1];
          acc.sum[2] += w[2];
          acc.n++;
          centroids.set(mesh, acc);
        }
      }
      for (let mesh = chunk.meshStart; mesh < chunk.meshStart + chunk.meshCount; mesh++) {
        if (!seen.has(mesh)) errors.push(`chunk ${chunk.id} (${quality}): mesh ${mesh} (${owner.get(mesh)}) has no geometry — simplification must not remove structures`);
      }
      // Meshes must be contiguous in the index buffer (the viewer derives ranges from it).
      const idx = index.getArray()!;
      if (checked.size) {
        for (let t = 0; t < triCount; t++) {
          id.getElement(idx[t * 3]!, el);
          const structure = owner.get(Math.round(el[0]!));
          if (!structure || !checked.has(structure)) continue;
          let soup = soups[quality].get(structure);
          if (!soup) soups[quality].set(structure, (soup = []));
          for (let k = 0; k < 3; k++) soup.push(...world(idx[t * 3 + k]!));
        }
      }
      const finished = new Set<number>();
      let current = -1;
      for (let t = 0; t < triCount; t++) {
        id.getElement(idx[t * 3]!, el);
        const mesh = Math.round(el[0]!);
        if (mesh !== current) {
          if (finished.has(mesh)) {
            errors.push(`chunk ${chunk.id} (${quality}): triangles of mesh ${mesh} are not contiguous`);
            break;
          }
          if (current >= 0) finished.add(current);
          current = mesh;
        }
      }
    }
    if (triangles.standard !== undefined && triangles.economy !== undefined && triangles.economy > triangles.standard) {
      errors.push(`chunk ${chunk.id}: economy level has more triangles than standard`);
    }
  }

  // Scale and orientation.
  const height = m.bounds.max[1] - m.bounds.min[1];
  if (options.heightRange && (height < options.heightRange[0] || height > options.heightRange[1])) {
    errors.push(`scale: model height ${height.toFixed(3)} m outside ${options.heightRange.join('–')} m (units must be metres)`);
  }
  if (Math.abs(m.bounds.min[1]) > 0.02) errors.push(`origin: lowest point is at y=${m.bounds.min[1].toFixed(3)} m, expected the floor at 0`);
  const centroid = (id: string): [number, number, number] | null => {
    const s = m.structures.find((x) => x.id === id);
    if (!s?.meshes?.length) return null;
    const acc = centroids.get(s.meshes[0]!);
    return acc ? [acc.sum[0] / acc.n, acc.sum[1] / acc.n, acc.sum[2] / acc.n] : null;
  };
  for (const check of options.orientation ?? []) {
    const pairs: [string | undefined, string | undefined, number, string][] = [
      [check.front, check.behind, 2, 'in front of'],
      [check.left, check.right, 0, 'to the left (+X) of'],
      [check.above, check.below, 1, 'above'],
    ];
    for (const [a, b, axis, text] of pairs) {
      if (!a || !b) continue;
      const ca = centroid(a);
      const cb = centroid(b);
      if (!ca || !cb) warnings.push(`orientation: cannot check ${a} / ${b} (missing geometry)`);
      else if (!(ca[axis]! > cb[axis]!)) errors.push(`orientation: ${a} is expected ${text} ${b}`);
    }
  }

  // Declared geometry corrections: openings that must stay closed and seams without gaps.
  const known = new Set(m.structures.map((x) => x.id));
  for (const id of checked) if (!known.has(id)) errors.push(`geometry checks: unknown structure ${id}`);
  for (const check of options.openings ?? []) {
    for (const quality of ['standard', 'economy'] as const) {
      const soup = soups[quality].get(check.id);
      if (!soup) {
        errors.push(`openings: ${check.id} has no geometry (${quality})`);
        continue;
      }
      const found = openings(soup).filter((o) => o.radius >= check.minRadius).length;
      if (found !== check.count) {
        errors.push(`openings: ${check.id} (${quality}) has ${found} openings of ${check.minRadius * 1000} mm or more, expected ${check.count}`);
      }
    }
  }
  if (options.junctions?.length) {
    let corrections: CoverageCorrection[] = [];
    const coveragePath = join(dir, m.reports.coverage.path);
    if (existsSync(coveragePath)) corrections = (JSON.parse(readFileSync(coveragePath, 'utf8')) as { corrections?: CoverageCorrection[] }).corrections ?? [];
    for (const check of options.junctions) {
      const seam = corrections.find((c) => c.id === check.fix)?.seam;
      if (!seam?.length) {
        errors.push(`junction ${check.fix}: no seam in the coverage report`);
        continue;
      }
      for (const id of check.structures) {
        for (const quality of ['standard', 'economy'] as const) {
          const soup = soups[quality].get(id);
          if (!soup) {
            errors.push(`junction ${check.fix}: ${id} has no geometry (${quality})`);
            continue;
          }
          let gap = 0;
          for (const point of seam) gap = Math.max(gap, distanceToSurface(point, soup));
          if (gap > check.maxGap) {
            errors.push(`junction ${check.fix}: ${id} (${quality}) is up to ${(gap * 1000).toFixed(2)} mm from the seam, ${check.maxGap * 1000} mm allowed`);
          }
        }
      }
    }
  }

  const included = m.assets.filter((a) => a.included);
  if (options.release) {
    for (const a of included) if (a.audit.status !== 'approved') errors.push(`licence: asset ${a.id} is not approved`);
  } else {
    for (const a of included) if (a.audit.status !== 'approved') warnings.push(`licence audit pending: ${a.id}`);
  }
  return { errors, warnings, stats };
}
