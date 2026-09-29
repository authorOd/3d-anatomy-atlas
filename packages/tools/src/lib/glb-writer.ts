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
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import type { MeshData } from './geometry.js';

export interface ChunkMesh {
  meshIndex: number;
  mesh: MeshData;
}

export interface WrittenChunk {
  bytes: Uint8Array;
  triangles: number;
  vertices: number;
}

let io: NodeIO | null = null;

async function getIO(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  return io;
}

/**
 * Writes one chunk as glTF 2.0 binary: a single node with a single primitive holding every
 * mesh of the chunk. Meshes stay contiguous in the index buffer and every vertex carries
 * `_ID` = [mesh index, palette index] (UNSIGNED_SHORT VEC2), which keeps each structure
 * selectable after merging. Positions/normals are quantised (KHR_mesh_quantization) and the
 * buffers compressed with EXT_meshopt_compression.
 */
export async function writeChunkGlb(name: string, meshes: ChunkMesh[], extras: Record<string, unknown>): Promise<WrittenChunk> {
  let vertexCount = 0;
  let indexCount = 0;
  for (const { mesh } of meshes) {
    vertexCount += mesh.materials.length;
    indexCount += mesh.indices.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const ids = new Uint16Array(vertexCount * 2);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vo = 0;
  let io_ = 0;
  for (const { meshIndex, mesh } of meshes) {
    if (meshIndex > 65535) throw new Error('Mesh index exceeds 16 bits');
    positions.set(mesh.positions, vo * 3);
    normals.set(mesh.normals, vo * 3);
    const count = mesh.materials.length;
    for (let v = 0; v < count; v++) {
      ids[(vo + v) * 2] = meshIndex;
      ids[(vo + v) * 2 + 1] = mesh.materials[v]!;
    }
    for (let i = 0; i < mesh.indices.length; i++) indices[io_ + i] = mesh.indices[i]! + vo;
    vo += count;
    io_ += mesh.indices.length;
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor('position').setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor('normal').setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('_ID', doc.createAccessor('id').setType('VEC2').setArray(ids).setBuffer(buffer))
    .setIndices(doc.createAccessor('indices').setType('SCALAR').setArray(indices).setBuffer(buffer));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh).setExtras(extras);
  doc.createScene('chunk').addChild(node);
  doc.getRoot().getAsset().generator = 'svitylo-atlas-tools';

  await doc.transform(
    quantize({
      pattern: /^(POSITION|NORMAL)$/,
      quantizePosition: 16,
      quantizeNormal: 10,
      quantizationVolume: 'mesh',
      cleanup: false,
    }),
  );
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const bytes = await (await getIO()).writeBinary(doc);
  return { bytes, triangles: indexCount / 3, vertices: vertexCount };
}

/** Reads a chunk back (validation): returns decoded attributes. */
export async function readChunkGlb(bytes: Uint8Array) {
  const doc = await (await getIO()).readBinary(bytes);
  const root = doc.getRoot();
  const nodes = root.listNodes().filter((n) => n.getMesh());
  const prims = nodes.flatMap((n) => n.getMesh()!.listPrimitives());
  return { doc, nodes, prims };
}
