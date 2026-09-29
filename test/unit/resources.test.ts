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
import { describe, expect, it } from 'vitest';
import { ResourceManager, type ChunkSource } from '@authorod/svitylo-3d-anatomy-atlas/core';

const payload = (i: number) => new Uint8Array(1000 + i).fill(i % 251);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function source(i: number, overrides: Partial<ChunkSource> = {}): ChunkSource {
  const bytes = payload(i);
  return {
    chunk: i,
    id: `chunk-${i}`,
    quality: 'standard',
    url: `https://data.test/c${i}.glb`,
    bytes: bytes.byteLength,
    sha256: sha(bytes),
    priority: i,
    meshStart: i,
    meshCount: 1,
    ...overrides,
  };
}

interface Harness {
  manager: ResourceManager<{ chunk: number; size: number }>;
  requests: string[];
  released: number[];
  resolvers: Map<string, () => void>;
}

/** Manager with a controllable fetch: every request waits until `release(url)` or `auto`. */
function harness(options: { auto?: boolean; fail?: Set<string>; concurrency?: number; budget?: number; corrupt?: Set<string> } = {}): Harness {
  const requests: string[] = [];
  const released: number[] = [];
  const resolvers = new Map<string, () => void>();
  const fetchImpl = ((url: string, init?: RequestInit) => {
    requests.push(url);
    return new Promise<Response>((resolve, reject) => {
      const i = Number(/c(\d+)\.glb/.exec(url)![1]);
      const finish = () => {
        if (options.fail?.has(url)) resolve(new Response('no', { status: 503 }));
        else {
          const body = payload(i);
          if (options.corrupt?.has(url)) body[0] = 255;
          resolve(new Response(body, { status: 200 }));
        }
      };
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      if (options.auto !== false) queueMicrotask(finish);
      else resolvers.set(url, finish);
    });
  }) as unknown as typeof fetch;
  const manager = new ResourceManager<{ chunk: number; size: number }>({
    fetch: fetchImpl,
    concurrency: options.concurrency ?? 4,
    budgetBytes: options.budget,
    parse: async (_buffer, s) => ({ chunk: s.chunk, size: 100 }),
    sizeOf: (v) => v.size,
    release: (v) => released.push(v.chunk),
  });
  return { manager, requests, released, resolvers };
}

/** Waits until no request of the current view is pending (bounded). */
async function settleManager(manager: ResourceManager<unknown>) {
  for (let i = 0; i < 200 && !manager.isSettled(); i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 5));
}

describe('resource manager', () => {
  it('requests every file once and reuses loaded chunks without new requests', async () => {
    const h = harness();
    h.manager.setDemand([source(1), source(2)]);
    h.manager.setDemand([source(1), source(2), source(1)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.requests).toEqual(['https://data.test/c1.glb', 'https://data.test/c2.glb']);
    h.manager.setDemand([source(2)]);
    h.manager.setDemand([source(1), source(2)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.requests).toHaveLength(2);
    expect(h.manager.get(1, 'standard')).toBeDefined();
    expect(h.manager.progress('standard').phase).toBe('complete');
  });

  it('limits parallel requests and loads by priority (outer layer first)', async () => {
    const h = harness({ auto: false, concurrency: 2 });
    h.manager.setDemand([source(5), source(3), source(0, { priority: 99 }), source(1)]);
    expect(h.requests).toEqual(['https://data.test/c1.glb', 'https://data.test/c3.glb']);
    h.resolvers.get('https://data.test/c1.glb')!();
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2]).toBe('https://data.test/c5.glb');
  });

  it('aborts requests that the new view no longer needs, without reporting errors', async () => {
    const h = harness({ auto: false });
    const errors: unknown[] = [];
    h.manager.setDemand([source(1), source(2)]);
    h.manager.setDemand([source(2)]);
    h.resolvers.get('https://data.test/c2.glb')!();
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.manager.stateOf(1, 'standard')).toBe('absent');
    expect(h.manager.get(2, 'standard')).toBeDefined();
    expect(errors).toEqual([]);
  });

  it('cancels as a separate phase, not as a data error', async () => {
    const h = harness({ auto: false });
    h.manager.setDemand([source(1), source(2)]);
    const cancelled = h.manager.cancel();
    expect(cancelled.map((c) => c.chunk).sort()).toEqual([1, 2]);
    expect(h.manager.progress('standard').phase).toBe('cancelled');
    expect(h.manager.stats().failedChunks).toBe(0);
  });

  it('retries only failed files; ready files are not requested again', async () => {
    const fail = new Set(['https://data.test/c2.glb']);
    const h = harness({ fail });
    h.manager.setDemand([source(1), source(2), source(3)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.manager.progress('standard')).toMatchObject({ phase: 'error', failedFiles: 1, loadedFiles: 2 });
    fail.clear();
    expect(h.manager.retryFailed()).toBe(1);
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.requests.filter((u) => u.endsWith('c1.glb'))).toHaveLength(1);
    expect(h.requests.filter((u) => u.endsWith('c2.glb'))).toHaveLength(2);
    expect(h.manager.progress('standard').phase).toBe('complete');
  });

  it('rejects files whose checksum does not match the manifest', async () => {
    const h = harness({ corrupt: new Set(['https://data.test/c1.glb']) });
    h.manager.setDemand([source(1)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    expect(h.manager.failed()[0]?.error.code).toBe('FILE_INTEGRITY');
  });

  it('keeps decoded chunks within the budget, never evicting what the view needs', async () => {
    const h = harness({ budget: 250 });
    h.manager.setDemand([source(1), source(2)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    h.manager.setDemand([source(3), source(4)]);
    await settleManager(h.manager as ResourceManager<unknown>);
    // 4 chunks × 100 bytes exceed 250: the two chunks outside the view are released (LRU).
    expect(h.released.sort()).toEqual([1, 2]);
    expect(h.manager.get(3, 'standard')).toBeDefined();
    expect(h.manager.get(4, 'standard')).toBeDefined();
    h.manager.dispose();
    expect(h.released.sort()).toEqual([1, 2, 3, 4]);
    expect(h.manager.stats().readyChunks).toBe(0);
  });
});
