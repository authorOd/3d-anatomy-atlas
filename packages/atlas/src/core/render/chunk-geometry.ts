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
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Matrix4 } from 'three';
import type { Quality } from '../../schema/index.js';

type AnyAttribute = BufferAttribute | InterleavedBufferAttribute;

export interface AttributeReader {
  array: ArrayLike<number>;
  stride: number;
  offset: number;
  scale: number;
  signed: boolean;
}

/** Fast read access to (possibly interleaved, quantised) attribute data without per-call allocations. */
export function attributeReader(attr: AnyAttribute): AttributeReader {
  const interleaved = (attr as InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
  const array = interleaved ? (attr as InterleavedBufferAttribute).data.array : (attr as BufferAttribute).array;
  const stride = interleaved ? (attr as InterleavedBufferAttribute).data.stride : attr.itemSize;
  const offset = interleaved ? (attr as InterleavedBufferAttribute).offset : 0;
  let scale = 1;
  let signed = false;
  if (attr.normalized) {
    if (array instanceof Int16Array) {
      scale = 1 / 32767;
      signed = true;
    } else if (array instanceof Uint16Array) scale = 1 / 65535;
    else if (array instanceof Int8Array) {
      scale = 1 / 127;
      signed = true;
    } else if (array instanceof Uint8Array) scale = 1 / 255;
  }
  return { array, stride, offset, scale, signed };
}

export function readComponent(r: AttributeReader, vertex: number, component: number): number {
  const v = r.array[vertex * r.stride + r.offset + component]! * r.scale;
  return r.signed && v < -1 ? -1 : v;
}

/** Geometry of one chunk at one quality level, with per-mesh triangle ranges and bounds. */
export interface ChunkGeometry {
  chunk: number;
  quality: Quality;
  geometry: BufferGeometry;
  /** Node transform of the chunk (includes de-quantisation). */
  matrix: Matrix4;
  meshStart: number;
  meshCount: number;
  /** First triangle and triangle count per mesh (index = mesh - meshStart). */
  triStart: Uint32Array;
  triCount: Uint32Array;
  /** Local-space bounds per mesh: minX, minY, minZ, maxX, maxY, maxZ. */
  bounds: Float32Array;
  /** Estimated CPU/GPU bytes of the geometry buffers. */
  byteSize: number;
}

export class ChunkFormatError extends Error {}

/**
 * Validates the attribute layout written by the pipeline and derives per-mesh triangle
 * ranges (meshes are stored contiguously) and bounds.
 */
export function analyseChunkGeometry(
  geometry: BufferGeometry,
  info: { chunk: number; quality: Quality; meshStart: number; meshCount: number; matrix: Matrix4 },
): ChunkGeometry {
  const position = geometry.getAttribute('position') as AnyAttribute | undefined;
  const normal = geometry.getAttribute('normal') as AnyAttribute | undefined;
  const id = geometry.getAttribute('_id') as AnyAttribute | undefined;
  const index = geometry.getIndex();
  if (!position || !normal || !id || id.itemSize !== 2 || !index) {
    throw new ChunkFormatError('Chunk geometry lacks position, normal, _id or index data');
  }
  const pos = attributeReader(position);
  const ids = attributeReader(id);
  const vertexCount = position.count;
  const { meshStart, meshCount } = info;

  const bounds = new Float32Array(meshCount * 6);
  for (let m = 0; m < meshCount; m++) {
    bounds[m * 6] = bounds[m * 6 + 1] = bounds[m * 6 + 2] = Infinity;
    bounds[m * 6 + 3] = bounds[m * 6 + 4] = bounds[m * 6 + 5] = -Infinity;
  }
  for (let v = 0; v < vertexCount; v++) {
    const local = Math.round(readComponent(ids, v, 0)) - meshStart;
    if (local < 0 || local >= meshCount) throw new ChunkFormatError(`Vertex references mesh outside chunk (${local + meshStart})`);
    const o = local * 6;
    for (let c = 0; c < 3; c++) {
      const value = readComponent(pos, v, c);
      if (value < bounds[o + c]!) bounds[o + c] = value;
      if (value > bounds[o + 3 + c]!) bounds[o + 3 + c] = value;
    }
  }

  const triStart = new Uint32Array(meshCount);
  const triCount = new Uint32Array(meshCount);
  const seen = new Uint8Array(meshCount);
  const indexArray = index.array;
  const triangles = Math.floor(index.count / 3);
  let current = -1;
  for (let t = 0; t < triangles; t++) {
    const a = indexArray[t * 3]!;
    if (a >= vertexCount) throw new ChunkFormatError('Index out of range');
    const local = Math.round(readComponent(ids, a, 0)) - meshStart;
    if (local !== current) {
      if (seen[local]) throw new ChunkFormatError('Mesh triangles are not contiguous');
      seen[local] = 1;
      current = local;
      triStart[local] = t;
    }
    triCount[local]!++;
  }

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  if (!geometry.boundingBox) geometry.computeBoundingBox();

  const buffers = new Set<ArrayBufferLike>();
  let byteSize = index.array.byteLength;
  for (const attr of Object.values(geometry.attributes) as AnyAttribute[]) {
    const array = (attr as InterleavedBufferAttribute).isInterleavedBufferAttribute
      ? (attr as InterleavedBufferAttribute).data.array
      : (attr as BufferAttribute).array;
    if (!buffers.has(array.buffer)) {
      buffers.add(array.buffer);
      byteSize += array.byteLength;
    }
  }
  return { ...info, geometry, triStart, triCount, bounds, byteSize };
}
