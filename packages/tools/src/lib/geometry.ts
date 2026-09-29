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
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

/** Indexed triangle mesh with one palette index per vertex. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Palette index per vertex. */
  materials: Uint8Array;
  indices: Uint32Array;
}

export async function geometryReady(): Promise<void> {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
}

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}

/**
 * Duplicates vertices shared by triangles with different materials, so material becomes a
 * vertex attribute. Degenerate triangles are dropped.
 */
export function splitByMaterial(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  triangleMaterial: (triangle: number) => number,
): MeshData {
  const remap = new Map<number, number>();
  const outPos: number[] = [];
  const outNrm: number[] = [];
  const outMat: number[] = [];
  const outIdx: number[] = [];
  const triangles = indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    if (a === b || b === c || a === c) continue;
    const material = triangleMaterial(t);
    for (const v of [a, b, c]) {
      const key = v * 256 + material;
      let nv = remap.get(key);
      if (nv === undefined) {
        nv = outMat.length;
        remap.set(key, nv);
        outPos.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
        outNrm.push(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!);
        outMat.push(material);
      }
      outIdx.push(nv);
    }
  }
  return {
    positions: Float32Array.from(outPos),
    normals: Float32Array.from(outNrm),
    materials: Uint8Array.from(outMat),
    indices: Uint32Array.from(outIdx),
  };
}

export function bounds(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c]!;
      if (v < min[c]!) min[c] = v;
      if (v > max[c]!) max[c] = v;
    }
  }
  return { min, max };
}

export function extent(positions: Float32Array): number {
  const b = bounds(positions);
  return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
}

export interface SimplifyOptions {
  /** Maximum geometric deviation in metres. */
  maxError: number;
  /** Maximum deviation relative to the mesh extent (protects small structures). */
  maxRelativeError: number;
  /** Lower bound of the triangle ratio the simplifier aims for (error usually stops it first). */
  ratio: number;
  /** Meshes at or below this triangle count are kept as they are. */
  keepBelow: number;
  /** A simplified mesh never has fewer triangles than this (selectable structures must survive). */
  minTriangles: number;
}

export interface SimplifyResult {
  mesh: MeshData;
  error: number;
}

/**
 * Error-bounded simplification that keeps borders locked (adjacent skin/muscle patches stay
 * watertight against each other) and never removes a structure: if the result would drop
 * below `minTriangles`, the original mesh is used.
 */
export function simplify(mesh: MeshData, options: SimplifyOptions): SimplifyResult {
  const tris = triangleCount(mesh);
  if (tris <= options.keepBelow) return { mesh, error: 0 };
  const size = Math.max(extent(mesh.positions), 1e-6);
  const maxError = Math.min(options.maxError, options.maxRelativeError * size);
  const target = Math.max(options.minTriangles, Math.floor(tris * options.ratio)) * 3;
  const [indices, relativeError] = MeshoptSimplifier.simplify(
    mesh.indices,
    mesh.positions,
    3,
    target,
    maxError / size,
    ['LockBorder'],
  );
  if (indices.length / 3 < Math.min(options.minTriangles, tris)) return { mesh, error: 0 };
  return { mesh: compact({ ...mesh, indices }), error: relativeError * size };
}

/**
 * Removes unused vertices and optimises triangle order (vertex cache) and vertex order
 * (fetch locality, better compression). `reorderMesh` rewrites the index copy in place.
 */
export function compact(mesh: MeshData): MeshData {
  const indices = mesh.indices.slice();
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const positions = new Float32Array(unique * 3);
  const normals = new Float32Array(unique * 3);
  const materials = new Uint8Array(unique);
  for (let v = 0; v < remap.length; v++) {
    const nv = remap[v]!;
    if (nv === 0xffffffff) continue;
    positions[nv * 3] = mesh.positions[v * 3]!;
    positions[nv * 3 + 1] = mesh.positions[v * 3 + 1]!;
    positions[nv * 3 + 2] = mesh.positions[v * 3 + 2]!;
    normals[nv * 3] = mesh.normals[v * 3]!;
    normals[nv * 3 + 1] = mesh.normals[v * 3 + 1]!;
    normals[nv * 3 + 2] = mesh.normals[v * 3 + 2]!;
    materials[nv] = mesh.materials[v]!;
  }
  return { positions, normals, materials, indices };
}
