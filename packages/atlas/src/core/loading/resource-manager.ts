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
import type { Quality } from '../../schema/index.js';
import { AtlasError } from '../errors.js';
import type { LoadPhase, ProgressEvent } from '../events.js';
import { sha256Hex } from '../util/hash.js';

export interface ChunkSource {
  chunk: number;
  id: string;
  quality: Quality;
  url: string;
  bytes: number;
  sha256: string;
  priority: number;
  meshStart: number;
  meshCount: number;
}

export interface ResourceManagerOptions<T> {
  fetch?: typeof fetch;
  /** Parallel requests; the atlas never opens an unbounded number of requests. */
  concurrency?: number;
  /** Decoded bytes kept for chunks that are not needed by the current view. */
  budgetBytes?: number;
  parse: (buffer: ArrayBuffer, source: ChunkSource) => Promise<T>;
  sizeOf: (value: T) => number;
  release: (value: T, source: ChunkSource) => void;
  onLoaded?: (source: ChunkSource, value: T) => void;
  onError?: (source: ChunkSource, error: AtlasError) => void;
  onUpdate?: () => void;
  isFormatError?: (error: unknown) => boolean;
}

type EntryState = 'queued' | 'loading' | 'ready' | 'failed';

interface Entry<T> {
  key: string;
  source: ChunkSource;
  state: EntryState;
  loadedBytes: number;
  controller: AbortController | null;
  value: T | null;
  size: number;
  error: AtlasError | null;
  lastUsed: number;
}

export interface ResourceStats {
  /** Chunks whose geometry is decoded and kept in memory. */
  readyChunks: number;
  loadingChunks: number;
  queuedChunks: number;
  failedChunks: number;
  /** Estimated bytes of decoded geometry kept in memory. */
  decodedBytes: number;
  /** Bytes received from the network since creation (not counting HTTP cache hits separately). */
  receivedBytes: number;
  requests: number;
  budgetBytes: number;
  /** Time spent verifying and decoding files (main thread), for measurements. */
  decodeMs: number;
  decodedFiles: number;
}

export const chunkKey = (chunk: number, quality: Quality) => `${quality}:${chunk}`;

/**
 * Downloads, verifies, decodes and caches chunk files.
 * - Every file is requested at most once while it is cached (in-flight requests are shared).
 * - Requests that the current view no longer needs are aborted.
 * - Failed files are retried only on request; ready files are never re-downloaded by a retry.
 * - Decoded chunks that are not needed are evicted least-recently-used beyond the budget.
 */
export class ResourceManager<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private demand = new Set<string>();
  private active = 0;
  private cancelled = false;
  private disposed = false;
  private clock = 0;
  private receivedBytes = 0;
  private requests = 0;
  private decodeMs = 0;
  private decodedFiles = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly concurrency: number;
  readonly budgetBytes: number;

  constructor(private readonly options: ResourceManagerOptions<T>) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
    this.budgetBytes = options.budgetBytes ?? 384 * 1024 * 1024;
  }

  /** Sets the files needed by the current view. Missing ones are queued, unneeded requests aborted. */
  setDemand(sources: Iterable<ChunkSource>): void {
    if (this.disposed) return;
    const next = new Set<string>();
    let added = false;
    for (const source of sources) {
      const key = chunkKey(source.chunk, source.quality);
      next.add(key);
      const existing = this.entries.get(key);
      if (existing) {
        existing.lastUsed = ++this.clock;
        continue;
      }
      this.entries.set(key, {
        key,
        source,
        state: 'queued',
        loadedBytes: 0,
        controller: null,
        value: null,
        size: 0,
        error: null,
        lastUsed: ++this.clock,
      });
      added = true;
    }
    for (const [key, entry] of this.entries) {
      if (next.has(key)) continue;
      if (entry.state === 'queued' || entry.state === 'loading') this.drop(entry);
    }
    this.demand = next;
    if (added) this.cancelled = false;
    this.pump();
    this.enforceBudget();
    this.options.onUpdate?.();
  }

  get(chunk: number, quality: Quality): T | undefined {
    const entry = this.entries.get(chunkKey(chunk, quality));
    if (entry?.state !== 'ready' || entry.value === null) return undefined;
    entry.lastUsed = ++this.clock;
    return entry.value;
  }

  stateOf(chunk: number, quality: Quality): EntryState | 'absent' {
    return this.entries.get(chunkKey(chunk, quality))?.state ?? 'absent';
  }

  /** Aborts queued and running requests. Cancellation is not reported as a data error. */
  cancel(): ChunkSource[] {
    const cancelled: ChunkSource[] = [];
    for (const entry of [...this.entries.values()]) {
      if (entry.state === 'queued' || entry.state === 'loading') {
        cancelled.push(entry.source);
        this.drop(entry);
      }
    }
    if (cancelled.length > 0) this.cancelled = true;
    this.options.onUpdate?.();
    return cancelled;
  }

  /** Re-queues failed files of the current view only. */
  retryFailed(): number {
    let n = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === 'failed' && this.demand.has(entry.key)) {
        entry.state = 'queued';
        entry.error = null;
        entry.loadedBytes = 0;
        n++;
      }
    }
    if (n > 0) this.cancelled = false;
    this.pump();
    this.options.onUpdate?.();
    return n;
  }

  /** Releases one cached chunk (e.g. the other quality level after a switch). */
  release(chunk: number, quality: Quality): void {
    const entry = this.entries.get(chunkKey(chunk, quality));
    if (entry) this.drop(entry);
  }

  failed(): { source: ChunkSource; error: AtlasError }[] {
    return [...this.entries.values()]
      .filter((e) => e.state === 'failed' && this.demand.has(e.key))
      .map((e) => ({ source: e.source, error: e.error! }));
  }

  progress(quality: Quality): ProgressEvent {
    let totalFiles = 0;
    let loadedFiles = 0;
    let failedFiles = 0;
    let totalBytes = 0;
    let loadedBytes = 0;
    let pending = 0;
    for (const key of this.demand) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      totalFiles++;
      totalBytes += entry.source.bytes;
      if (entry.state === 'ready') {
        loadedFiles++;
        loadedBytes += entry.source.bytes;
      } else if (entry.state === 'failed') failedFiles++;
      else {
        pending++;
        loadedBytes += entry.loadedBytes;
      }
    }
    let phase: LoadPhase = 'idle';
    if (this.cancelled) phase = 'cancelled';
    else if (pending > 0) phase = 'loading';
    else if (failedFiles > 0) phase = 'error';
    else if (totalFiles > 0) phase = 'complete';
    return { phase, totalFiles, loadedFiles, failedFiles, totalBytes, loadedBytes, quality };
  }

  isSettled(): boolean {
    for (const key of this.demand) {
      const state = this.entries.get(key)?.state;
      if (state === 'queued' || state === 'loading') return false;
    }
    return true;
  }

  stats(): ResourceStats {
    let readyChunks = 0;
    let loadingChunks = 0;
    let queuedChunks = 0;
    let failedChunks = 0;
    let decodedBytes = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === 'ready') {
        readyChunks++;
        decodedBytes += entry.size;
      } else if (entry.state === 'loading') loadingChunks++;
      else if (entry.state === 'queued') queuedChunks++;
      else failedChunks++;
    }
    return {
      readyChunks,
      loadingChunks,
      queuedChunks,
      failedChunks,
      decodedBytes,
      receivedBytes: this.receivedBytes,
      requests: this.requests,
      budgetBytes: this.budgetBytes,
      decodeMs: Math.round(this.decodeMs * 10) / 10,
      decodedFiles: this.decodedFiles,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const entry of [...this.entries.values()]) this.drop(entry);
    this.entries.clear();
    this.demand.clear();
    this.disposed = true;
  }

  private drop(entry: Entry<T>) {
    entry.controller?.abort();
    entry.controller = null;
    if (entry.value !== null) {
      this.options.release(entry.value, entry.source);
      entry.value = null;
    }
    this.entries.delete(entry.key);
  }

  private pump() {
    if (this.disposed) return;
    while (this.active < this.concurrency) {
      let next: Entry<T> | null = null;
      for (const key of this.demand) {
        const entry = this.entries.get(key);
        if (entry?.state !== 'queued') continue;
        if (
          !next ||
          entry.source.priority < next.source.priority ||
          (entry.source.priority === next.source.priority && entry.source.chunk < next.source.chunk)
        ) {
          next = entry;
        }
      }
      if (!next) return;
      void this.run(next);
    }
  }

  private async run(entry: Entry<T>) {
    entry.state = 'loading';
    const controller = new AbortController();
    entry.controller = controller;
    this.active++;
    const { source } = entry;
    try {
      this.requests++;
      let response: Response;
      try {
        response = await this.fetchImpl(source.url, { signal: controller.signal, credentials: 'same-origin' });
      } catch (error) {
        if (controller.signal.aborted) return;
        throw new AtlasError('FILE_UNAVAILABLE', `File is unavailable (network error): ${source.id}`, {
          files: [source.id],
          recoverable: true,
        }, { cause: error });
      }
      if (!response.ok) {
        throw new AtlasError('FILE_UNAVAILABLE', `File is unavailable (HTTP ${response.status}): ${source.id}`, {
          files: [source.id],
          status: response.status,
          recoverable: response.status >= 500 || response.status === 408 || response.status === 429,
        });
      }
      const bytes = await this.readBody(response, entry, controller.signal);
      if (controller.signal.aborted) return;
      if (bytes.byteLength !== source.bytes) {
        throw new AtlasError('FILE_INTEGRITY', `File size does not match the manifest: ${source.id}`, {
          files: [source.id],
          recoverable: true,
        });
      }
      const digest = await sha256Hex(bytes);
      if (digest !== null && digest !== source.sha256) {
        throw new AtlasError('FILE_INTEGRITY', `Checksum does not match the manifest: ${source.id}`, {
          files: [source.id],
          recoverable: true,
        });
      }
      let value: T;
      const decodeStart = performance.now();
      try {
        value = await this.options.parse(bytes.buffer as ArrayBuffer, source);
        this.decodeMs += performance.now() - decodeStart;
        this.decodedFiles++;
      } catch (error) {
        if (error instanceof AtlasError) throw error;
        throw new AtlasError(
          'FORMAT_UNSUPPORTED',
          `File has an unsupported format: ${source.id} (${(error as Error).message})`,
          { files: [source.id], recoverable: false },
          { cause: error },
        );
      }
      if (controller.signal.aborted || this.disposed || this.entries.get(entry.key) !== entry) {
        this.options.release(value, source);
        return;
      }
      entry.state = 'ready';
      entry.value = value;
      entry.size = this.options.sizeOf(value);
      entry.loadedBytes = source.bytes;
      entry.controller = null;
      entry.lastUsed = ++this.clock;
      this.options.onLoaded?.(source, value);
      this.enforceBudget();
    } catch (error) {
      if (controller.signal.aborted || this.entries.get(entry.key) !== entry) return;
      entry.state = 'failed';
      entry.controller = null;
      entry.error =
        error instanceof AtlasError
          ? error
          : new AtlasError('FILE_UNAVAILABLE', `File could not be loaded: ${source.id}`, { files: [source.id] }, { cause: error });
      this.options.onError?.(source, entry.error);
    } finally {
      this.active--;
      if (!this.disposed) {
        this.pump();
        this.options.onUpdate?.();
      }
    }
  }

  private async readBody(response: Response, entry: Entry<T>, signal: AbortSignal): Promise<Uint8Array> {
    const limit = entry.source.bytes;
    if (!response.body) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      this.receivedBytes += buffer.byteLength;
      return buffer;
    }
    const reader = response.body.getReader();
    const out = new Uint8Array(limit);
    let received = 0;
    for (;;) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        return out.subarray(0, 0);
      }
      const { done, value } = await reader.read();
      if (done) break;
      this.receivedBytes += value.byteLength;
      if (received + value.byteLength > limit) {
        await reader.cancel().catch(() => undefined);
        throw new AtlasError('FILE_INTEGRITY', `File is larger than declared in the manifest: ${entry.source.id}`, {
          files: [entry.source.id],
          recoverable: true,
        });
      }
      out.set(value, received);
      received += value.byteLength;
      entry.loadedBytes = received;
      this.options.onUpdate?.();
    }
    return out.subarray(0, received);
  }

  private enforceBudget() {
    let total = 0;
    for (const entry of this.entries.values()) if (entry.state === 'ready') total += entry.size;
    if (total <= this.budgetBytes) return;
    const candidates = [...this.entries.values()]
      .filter((e) => e.state === 'ready' && !this.demand.has(e.key))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates) {
      if (total <= this.budgetBytes) break;
      total -= entry.size;
      this.drop(entry);
    }
  }
}
