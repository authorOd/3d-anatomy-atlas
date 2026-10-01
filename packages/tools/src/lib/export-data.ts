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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppliedFix } from './geometry-fixes.js';
import { readJson } from './io.js';

/** Object record written by `blender/export_zanatomy.py`. */
export interface ExportObject {
  name: string;
  type: 'MESH' | 'CURVE';
  system: string;
  parents: string[];
  materials: (string | null)[];
  vertices: number;
  triangles: number;
  file: string;
  offset: number;
  bboxBlender: [number, number, number, number, number, number];
  /** A model from another open source (external_meshes.py): its licence asset, credit and names. */
  external?: ExternalInfo;
}

export interface ExternalInfo {
  asset: string;
  /** Where the geometry comes from, for the name records and the card. */
  source: string;
  /** English name when it differs from the object name (e.g. a plural of a TA2 term). */
  en?: string;
  /** Latin name when TA2.csv has no entry for it. */
  la?: string;
}

export interface ExportGroup {
  name: string;
  type: string;
  system: string;
  parents: string[];
  /** A group label added with models from other sources. */
  external?: boolean;
}

export interface ExportFile {
  blender: string;
  subsurfMax: number;
  objects: ExportObject[];
  groups: ExportGroup[];
  skipped: { name: string; system: string; reason: string }[];
  materials: Record<string, { viewport: number[]; principled: number[] | null }>;
  /** Declared geometry corrections: their geometric part and what each fix did. */
  fixes?: { definitions: object[]; applied: AppliedFix[] };
}

export interface RawGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleSlots: Uint16Array;
}

export function readExport(dir: string): ExportFile {
  return readJson<ExportFile>(join(dir, 'export.json'));
}

/**
 * Converts Blender coordinates (Z up, body facing -Y) to atlas coordinates
 * (+Y up, body facing +Z, patient's left at +X) and applies the origin offset.
 */
export function blenderToAtlas(x: number, y: number, z: number, offset: [number, number, number]): [number, number, number] {
  return [x + offset[0], z + offset[1], -y + offset[2]];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export class ExportGeometryReader {
  private cache = new Map<string, Buffer>();

  constructor(
    private readonly dir: string,
    private readonly offset: [number, number, number],
  ) {}

  private file(name: string): Buffer {
    let buf = this.cache.get(name);
    if (!buf) {
      buf = readFileSync(join(this.dir, name));
      this.cache.set(name, buf);
    }
    return buf;
  }

  read(object: ExportObject): RawGeometry {
    const buf = this.file(object.file);
    const n = object.vertices;
    const t = object.triangles;
    let o = object.offset;
    // The export writes little-endian data padded to 4 bytes; typed-array views are used
    // directly when the platform is little-endian and the offset is aligned.
    const view = <T extends Float32Array | Uint32Array | Uint16Array>(
      Ctor: { new (buffer: ArrayBufferLike, byteOffset: number, length: number): T; BYTES_PER_ELEMENT: number },
      count: number,
      read: (offset: number) => number,
    ): T => {
      const at = buf.byteOffset + o;
      let out: T;
      if (LITTLE_ENDIAN && at % Ctor.BYTES_PER_ELEMENT === 0) {
        out = new Ctor(buf.buffer, at, count).slice() as T;
      } else {
        out = new Ctor(new ArrayBuffer(count * Ctor.BYTES_PER_ELEMENT), 0, count);
        for (let i = 0; i < count; i++) out[i] = read(o + i * Ctor.BYTES_PER_ELEMENT);
      }
      o += count * Ctor.BYTES_PER_ELEMENT;
      return out;
    };
    const src = view(Float32Array, n * 3, (at) => buf.readFloatLE(at));
    const nrm = view(Float32Array, n * 3, (at) => buf.readFloatLE(at));
    const indices = view(Uint32Array, t * 3, (at) => buf.readUInt32LE(at));
    const triangleSlots = view(Uint16Array, t, (at) => buf.readUInt16LE(at));

    const positions = new Float32Array(n * 3);
    const normals = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = blenderToAtlas(src[i * 3]!, src[i * 3 + 1]!, src[i * 3 + 2]!, this.offset);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const [nx, ny, nz] = blenderToAtlas(nrm[i * 3]!, nrm[i * 3 + 1]!, nrm[i * 3 + 2]!, [0, 0, 0]);
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
    }
    for (let i = 0; i < indices.length; i++) {
      if (indices[i]! >= n) throw new Error(`Index out of range in ${object.name}`);
    }
    return { positions, normals, indices, triangleSlots };
  }
}
