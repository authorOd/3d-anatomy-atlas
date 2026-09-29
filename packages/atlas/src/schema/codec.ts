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
import { STATE_LIMITS, StateFormatError, ViewStateSchema, parseViewState, type ViewState } from './state.js';

/**
 * Link-safe encoding of the view state: `<codec>.<base64url payload>`.
 *  - `z1` — UTF-8 JSON compressed with raw DEFLATE (CompressionStream);
 *  - `j1` — UTF-8 JSON without compression (fallback when CompressionStream is unavailable).
 * The codec prefix is independent from the state schema version (`v` inside the JSON).
 */
export const STATE_CODECS = ['z1', 'j1'] as const;
export type StateCodec = (typeof STATE_CODECS)[number];

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(text: string): Uint8Array {
  if (!BASE64URL.test(text) || text.length % 4 === 1) {
    throw new StateFormatError('STATE_MALFORMED', 'State is not valid base64url');
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new StateFormatError('STATE_MALFORMED', 'State is not valid base64url');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

let deflateRawSupport: boolean | undefined;

/** Streams with the `deflate-raw` format (older engines have the streams but not this format). */
function hasCompressionStreams(): boolean {
  if (deflateRawSupport === undefined) {
    try {
      new CompressionStream('deflate-raw');
      new DecompressionStream('deflate-raw');
      deflateRawSupport = true;
    } catch {
      deflateRawSupport = false;
    }
  }
  return deflateRawSupport;
}

async function collect(readable: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await reader.read();
    } catch {
      throw new StateFormatError('STATE_MALFORMED', 'State payload is corrupted');
    }
    if (step.done) break;
    total += step.value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new StateFormatError('STATE_TOO_LARGE', `Decoded state exceeds ${limit} bytes`);
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function transform(data: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number) {
  const writer = stream.writable.getWriter();
  // Errors surface on the readable side; the writer promises must not become unhandled rejections.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined);
  writer.close().catch(() => undefined);
  return collect(stream.readable as ReadableStream<Uint8Array>, limit);
}

/** Produces a canonical JSON representation: fixed key order, empty optional fields omitted. */
export function canonicalizeState(state: ViewState): ViewState {
  const out: ViewState = {
    v: state.v,
    data: {
      model: state.data.model,
      version: state.data.version,
      ...(state.data.hash ? { hash: state.data.hash } : {}),
    },
    scene: [...state.scene],
  };
  if (state.hidden?.length) out.hidden = [...state.hidden];
  if (state.isolate) out.isolate = [...state.isolate];
  if (state.selected?.length) out.selected = [...state.selected];
  if (state.surroundings) {
    const { level, extra, transparency } = state.surroundings;
    const opacity = transparency === undefined ? 0 : Math.round(transparency * 1000) / 1000;
    const surroundings = {
      ...(level !== undefined ? { level } : {}),
      ...(extra?.length ? { extra: [...extra] } : {}),
      ...(opacity > 0 ? { transparency: opacity } : {}),
    };
    if (Object.keys(surroundings).length) out.surroundings = surroundings;
  }
  if (state.camera) {
    const r = (v: number) => Math.round(v * 10000) / 10000;
    out.camera = {
      position: [r(state.camera.position[0]), r(state.camera.position[1]), r(state.camera.position[2])],
      target: [r(state.camera.target[0]), r(state.camera.target[1]), r(state.camera.target[2])],
      ...(state.camera.fov !== undefined ? { fov: Math.round(state.camera.fov * 100) / 100 } : {}),
    };
  }
  if (state.lang) out.lang = state.lang;
  if (state.latin) out.latin = true;
  return out;
}

export interface EncodeOptions {
  /** Defaults to true when CompressionStream is available. */
  compress?: boolean;
}

/** Encodes a state for a URL. Throws `STATE_TOO_LARGE` instead of truncating. */
export async function encodeState(state: ViewState, options: EncodeOptions = {}): Promise<string> {
  const checked = ViewStateSchema.safeParse(state);
  if (!checked.success) {
    throw new StateFormatError('STATE_INVALID', `Cannot encode invalid state: ${checked.error.issues[0]?.message}`);
  }
  const json = JSON.stringify(canonicalizeState(checked.data));
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > STATE_LIMITS.maxDecodedBytes) {
    throw new StateFormatError('STATE_TOO_LARGE', 'State is too large to be shared as a link');
  }
  const compress = (options.compress ?? true) && hasCompressionStreams();
  const payload = compress
    ? `z1.${bytesToBase64Url(await transform(bytes, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER))}`
    : `j1.${bytesToBase64Url(bytes)}`;
  if (payload.length > STATE_LIMITS.maxEncodedLength) {
    throw new StateFormatError(
      'STATE_TOO_LARGE',
      `Encoded state has ${payload.length} characters (limit ${STATE_LIMITS.maxEncodedLength})`,
    );
  }
  return payload;
}

/** Decodes and validates an untrusted encoded state (size limits are enforced before parsing). */
export async function decodeState(encoded: unknown): Promise<ViewState> {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new StateFormatError('STATE_MALFORMED', 'State is empty');
  }
  if (encoded.length > STATE_LIMITS.maxEncodedLength) {
    throw new StateFormatError('STATE_TOO_LARGE', 'Encoded state is too long');
  }
  const dot = encoded.indexOf('.');
  const codec = dot > 0 ? encoded.slice(0, dot) : '';
  const body = encoded.slice(dot + 1);
  if (!(STATE_CODECS as readonly string[]).includes(codec)) {
    throw new StateFormatError('STATE_UNSUPPORTED_VERSION', `Unknown state codec "${codec.slice(0, 8)}"`);
  }
  const raw = base64UrlToBytes(body);
  let jsonBytes: Uint8Array;
  if (codec === 'z1') {
    if (!hasCompressionStreams()) {
      throw new StateFormatError('STATE_UNSUPPORTED_VERSION', 'This browser cannot decompress the state');
    }
    jsonBytes = await transform(raw, new DecompressionStream('deflate-raw'), STATE_LIMITS.maxDecodedBytes);
  } else {
    if (raw.byteLength > STATE_LIMITS.maxDecodedBytes) {
      throw new StateFormatError('STATE_TOO_LARGE', 'Decoded state is too large');
    }
    jsonBytes = raw;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  } catch {
    throw new StateFormatError('STATE_MALFORMED', 'State is not valid JSON');
  }
  return parseViewState(parsed);
}
