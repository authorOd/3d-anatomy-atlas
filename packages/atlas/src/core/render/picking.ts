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
import { Box3, Matrix4, Ray, Sphere, Vector3 } from 'three';
import { attributeReader, readComponent, type ChunkGeometry } from './chunk-geometry.js';

export interface PickHit {
  mesh: number;
  distance: number;
  point: Vector3;
}

const _inverse = new Matrix4();
const _localRay = new Ray();
const _box = new Box3();
const _sphere = new Sphere();
const _hitLocal = new Vector3();

/**
 * Visits every triangle hit of one chunk along a world-space ray (`tLocal` is the ray parameter
 * in chunk space). Meshes rejected by `pickable` are skipped before any triangle test, and
 * per-mesh bounds prune the rest, so ray queries stay cheap without a BVH.
 */
function intersectChunk(
  worldRay: Ray,
  chunk: ChunkGeometry,
  pickable: (mesh: number) => boolean,
  visit: (mesh: number, tLocal: number) => void,
): boolean {
  const { geometry, matrix } = chunk;
  if (geometry.boundingSphere) {
    _sphere.copy(geometry.boundingSphere).applyMatrix4(matrix);
    if (!worldRay.intersectsSphere(_sphere)) return false;
  }
  _inverse.copy(matrix).invert();
  _localRay.copy(worldRay).applyMatrix4(_inverse);
  const position = attributeReader(geometry.getAttribute('position') as never);
  const index = geometry.getIndex()!.array;
  const ox = _localRay.origin.x;
  const oy = _localRay.origin.y;
  const oz = _localRay.origin.z;
  const dx = _localRay.direction.x;
  const dy = _localRay.direction.y;
  const dz = _localRay.direction.z;
  for (let local = 0; local < chunk.meshCount; local++) {
    const mesh = chunk.meshStart + local;
    if (chunk.triCount[local] === 0 || !pickable(mesh)) continue;
    const b = local * 6;
    _box.min.set(chunk.bounds[b]!, chunk.bounds[b + 1]!, chunk.bounds[b + 2]!);
    _box.max.set(chunk.bounds[b + 3]!, chunk.bounds[b + 4]!, chunk.bounds[b + 5]!);
    if (!_localRay.intersectsBox(_box)) continue;
    const start = chunk.triStart[local]!;
    const end = start + chunk.triCount[local]!;
    for (let t = start; t < end; t++) {
      const ia = index[t * 3]!;
      const ib = index[t * 3 + 1]!;
      const ic = index[t * 3 + 2]!;
      const ax = readComponent(position, ia, 0);
      const ay = readComponent(position, ia, 1);
      const az = readComponent(position, ia, 2);
      const e1x = readComponent(position, ib, 0) - ax;
      const e1y = readComponent(position, ib, 1) - ay;
      const e1z = readComponent(position, ib, 2) - az;
      const e2x = readComponent(position, ic, 0) - ax;
      const e2y = readComponent(position, ic, 1) - ay;
      const e2z = readComponent(position, ic, 2) - az;
      // Möller–Trumbore, double-sided.
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const tx = ox - ax;
      const ty = oy - ay;
      const tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (dist > 0) visit(mesh, dist);
    }
  }
  return true;
}

/** World distance from the ray origin of a hit given in chunk space (the last `intersectChunk`). */
function worldDistance(worldRay: Ray, matrix: ChunkGeometry['matrix'], tLocal: number, point = _hitLocal): number {
  _localRay.at(tLocal, point);
  point.applyMatrix4(matrix);
  return point.distanceTo(worldRay.origin);
}

/** Nearest triangle hit along a world-space ray among the `pickable` meshes. */
export function pickChunks(
  worldRay: Ray,
  chunks: Iterable<ChunkGeometry>,
  pickable: (mesh: number) => boolean,
): PickHit | null {
  let best: PickHit | null = null;
  for (const chunk of chunks) {
    let bestT = Infinity;
    let bestMesh = -1;
    intersectChunk(worldRay, chunk, pickable, (mesh, t) => {
      if (t < bestT) {
        bestT = t;
        bestMesh = mesh;
      }
    });
    if (bestMesh >= 0) {
      const point = new Vector3();
      const distance = worldDistance(worldRay, chunk.matrix, bestT, point);
      if (!best || distance < best.distance) best = { mesh: bestMesh, distance, point };
    }
  }
  return best;
}

/** Every surface crossing along a world-space ray (unsorted), as mesh and world distance. */
export function rayCrossings(
  worldRay: Ray,
  chunks: Iterable<ChunkGeometry>,
  pickable: (mesh: number) => boolean,
): { mesh: number; distance: number }[] {
  const out: { mesh: number; distance: number }[] = [];
  for (const chunk of chunks) {
    const local: { mesh: number; t: number }[] = [];
    if (!intersectChunk(worldRay, chunk, pickable, (mesh, t) => local.push({ mesh, t }))) continue;
    for (const hit of local) out.push({ mesh: hit.mesh, distance: worldDistance(worldRay, chunk.matrix, hit.t) });
  }
  return out;
}

export function meshBounds(meshes: Iterable<number>, chunkOf: (mesh: number) => ChunkGeometry | undefined): Box3 {
  const out = new Box3();
  const corner = new Vector3();
  for (const mesh of meshes) {
    const chunk = chunkOf(mesh);
    if (!chunk) continue;
    const local = mesh - chunk.meshStart;
    if (chunk.triCount[local] === 0) continue;
    const b = local * 6;
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? chunk.bounds[b + 3]! : chunk.bounds[b]!,
          i & 2 ? chunk.bounds[b + 4]! : chunk.bounds[b + 1]!,
          i & 4 ? chunk.bounds[b + 5]! : chunk.bounds[b + 2]!,
        )
        .applyMatrix4(chunk.matrix);
      out.expandByPoint(corner);
    }
  }
  return out;
}
