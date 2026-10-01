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
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

let io: NodeIO | null = null;

async function reader(): Promise<NodeIO> {
  if (!io) {
    await MeshoptDecoder.ready;
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  }
  return io;
}

/**
 * Hash of what a viewer reads from a chunk GLB: nodes (name, matrix, extras), primitives (mode,
 * material) with every attribute and the indices, decoded. The compressed encoding is left out:
 * the meshopt encoder output depends on the last bits of the source normals, which vary between
 * platforms although the quantised attributes are the same.
 */
export async function chunkContent(bytes: Uint8Array): Promise<string> {
  const doc = await (await reader()).readBinary(bytes);
  const hash = createHash('sha256');
  const text = (value: unknown) => hash.update(`${JSON.stringify(value)}\n`);
  const root = doc.getRoot();
  for (const node of root.listNodes()) text(['node', node.getName(), node.getMatrix(), node.getExtras()]);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      text(['primitive', prim.getMode(), prim.getMaterial()?.getName() ?? null]);
      for (const semantic of [...prim.listSemantics()].sort()) {
        const accessor = prim.getAttribute(semantic)!;
        const array = accessor.getArray()!;
        text([semantic, accessor.getType(), accessor.getComponentType(), accessor.getNormalized(), array.length]);
        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
      const indices = prim.getIndices()?.getArray();
      text(['indices', indices?.length ?? null]);
      if (indices) hash.update(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength));
    }
  }
  return hash.digest('hex');
}
