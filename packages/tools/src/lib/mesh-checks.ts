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
 * Geometric checks on triangle soups (nine numbers per triangle, world coordinates): the
 * openings of a surface and the distance from points to it. Used by the release validation for
 * the declared geometry corrections.
 */

export type Vec3 = [number, number, number];

export interface Opening {
  /** Vertices on the border of the opening. */
  vertices: number;
  centre: Vec3;
  /** Mean distance of the border from its centre. */
  radius: number;
}

/**
 * Openings (connected borders) of a surface. Positions closer than `weld` count as one vertex,
 * so vertices split for normals or materials do not open the surface.
 */
export function openings(triangles: ArrayLike<number>, weld = 1e-6): Opening[] {
  const ids = new Map<string, number>();
  const points: Vec3[] = [];
  const vertex = (o: number): number => {
    const x = triangles[o]!;
    const y = triangles[o + 1]!;
    const z = triangles[o + 2]!;
    const key = `${Math.round(x / weld)},${Math.round(y / weld)},${Math.round(z / weld)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = points.length;
      ids.set(key, id);
      points.push([x, y, z]);
    }
    return id;
  };
  const edges = new Map<string, [number, number, number]>();
  for (let o = 0; o + 8 < triangles.length; o += 9) {
    const v = [vertex(o), vertex(o + 3), vertex(o + 6)] as const;
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let k = 0; k < 3; k++) {
      const a = v[k]!;
      const b = v[(k + 1) % 3]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(key);
      if (edge) edge[2]++;
      else edges.set(key, [a, b, 1]);
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const [a, b, uses] of edges.values()) {
    if (uses !== 1) continue;
    let list = adjacency.get(a);
    if (!list) adjacency.set(a, (list = []));
    list.push(b);
    list = adjacency.get(b);
    if (!list) adjacency.set(b, (list = []));
    list.push(a);
  }
  const seen = new Set<number>();
  const out: Opening[] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const border: number[] = [];
    const stack = [start];
    while (stack.length) {
      const v = stack.pop()!;
      if (seen.has(v)) continue;
      seen.add(v);
      border.push(v);
      for (const u of adjacency.get(v)!) if (!seen.has(u)) stack.push(u);
    }
    const centre: Vec3 = [0, 0, 0];
    for (const v of border) {
      const [x, y, z] = points[v]!;
      centre[0] += x / border.length;
      centre[1] += y / border.length;
      centre[2] += z / border.length;
    }
    let radius = 0;
    for (const v of border) {
      const [x, y, z] = points[v]!;
      radius += Math.hypot(x - centre[0], y - centre[1], z - centre[2]) / border.length;
    }
    out.push({ vertices: border.length, centre, radius });
  }
  return out;
}

/** Distance from `p` to the triangle (a, b, c) given at offset `o` of a soup. */
function triangleDistance(p: Vec3, t: ArrayLike<number>, o: number): number {
  const ax = t[o]!, ay = t[o + 1]!, az = t[o + 2]!;
  const abx = t[o + 3]! - ax, aby = t[o + 4]! - ay, abz = t[o + 5]! - az;
  const acx = t[o + 6]! - ax, acy = t[o + 7]! - ay, acz = t[o + 8]! - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  // Closest point by the Voronoi regions of the triangle (Ericson, Real-Time Collision Detection).
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let u = 0;
  let v = 0;
  if (d1 <= 0 && d2 <= 0) {
    u = 0;
    v = 0;
  } else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      u = 1;
    } else if (d6 >= 0 && d5 <= d6) {
      v = 1;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      u = d1 / (d1 - d3);
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      v = d2 / (d2 - d6);
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      v = (d4 - d3) / (d4 - d3 + (d5 - d6));
      u = 1 - v;
    } else {
      const denominator = 1 / (va + vb + vc);
      u = vb * denominator;
      v = vc * denominator;
    }
  }
  const qx = ax + u * abx + v * acx;
  const qy = ay + u * aby + v * acy;
  const qz = az + u * abz + v * acz;
  return Math.hypot(p[0] - qx, p[1] - qy, p[2] - qz);
}

/** Distance from a point to the nearest triangle of a soup. */
export function distanceToSurface(p: Vec3, triangles: ArrayLike<number>): number {
  let best = Infinity;
  for (let o = 0; o + 8 < triangles.length; o += 9) {
    const d = triangleDistance(p, triangles, o);
    if (d < best) best = d;
  }
  return best;
}
