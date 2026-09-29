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
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STATE_LIMITS,
  STATE_MIGRATIONS,
  bytesToBase64Url,
  canonicalizeState,
  decodeState,
  encodeState,
  parseViewState,
  type ViewState,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { REPO } from './helpers.js';

const base: ViewState = {
  v: 2,
  data: { model: 'fixture', version: '1.0.0', hash: '0123456789abcdef' },
  scene: ['cardiovascular.heart', 'integument.skin_of_trunk', 'respiratory'],
  hidden: ['=respiratory.lung_l'],
  selected: ['cardiovascular.heart.left_ventricle'],
  surroundings: { level: 2, extra: ['skeletal.sternum'], transparency: 0.7 },
  camera: { position: [0.1, 1.3, 0.7], target: [0, 1.28, 0.04], fov: 35 },
  lang: 'uk',
  latin: true,
};

const encodeJson = (value: unknown) => `j1.${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))}`;

describe('view state codec', () => {
  it('round-trips through the compressed and the plain codec', async () => {
    for (const compress of [true, false]) {
      const encoded = await encodeState(base, { compress });
      expect(encoded.startsWith(compress ? 'z1.' : 'j1.')).toBe(true);
      expect(encoded).toMatch(/^[a-z0-9]+\.[A-Za-z0-9_-]+$/);
      expect(await decodeState(encoded)).toEqual(canonicalizeState(base));
    }
  });

  it('migrates links of schema v1: the translucent mode becomes its level with the transparency', () => {
    const v1 = { ...base, v: 1, surroundings: { anchor: 'cardiovascular.heart', level: 2, extra: ['skeletal.sternum'], opacity: 0.3 } };
    const migrated = parseViewState(v1);
    expect(migrated.v).toBe(2);
    expect(migrated.surroundings).toEqual({ level: 2, extra: ['skeletal.sternum'], transparency: 0.7 });
    // Without an opacity the mode had the default one.
    expect(parseViewState({ ...v1, surroundings: { level: 1 } }).surroundings).toEqual({ level: 1, transparency: 0.78 });
    // Without the mode: an automatic level and opaque structures.
    const { surroundings: _surroundings, ...opaque } = v1;
    expect(parseViewState(opaque).surroundings).toBeUndefined();
    // v1 levels start at 1; the transparency of v2 is never 0 in a link.
    expect(() => parseViewState({ ...v1, surroundings: { level: 0 } })).toThrow(expect.objectContaining({ code: 'STATE_INVALID' }));
    expect(() => parseViewState({ ...base, surroundings: { transparency: 0 } })).toThrow(expect.objectContaining({ code: 'STATE_INVALID' }));
  });

  it('keeps level 0 (only the selection) and drops a transparency that rounds to nothing', () => {
    expect(canonicalizeState({ ...base, surroundings: { level: 0 } }).surroundings).toEqual({ level: 0 });
    expect(canonicalizeState({ ...base, surroundings: { transparency: 0.0004 } }).surroundings).toBeUndefined();
    expect(canonicalizeState({ ...base, surroundings: { level: 1, transparency: 0.12345 } }).surroundings).toEqual({ level: 1, transparency: 0.123 });
  });

  it('keeps Latin names alongside only when they are on', () => {
    expect(canonicalizeState(base).latin).toBe(true);
    expect('latin' in canonicalizeState({ ...base, latin: false })).toBe(false);
    // Older links used Latin as the names language; they stay valid.
    expect(parseViewState({ ...base, lang: 'la', latin: undefined }).lang).toBe('la');
  });

  it('is stable: encoding a decoded state yields the same link', async () => {
    const once = await encodeState(base);
    const twice = await encodeState(await decodeState(once));
    expect(twice).toBe(once);
  });

  it('keeps saved example states valid (schema changes must migrate them)', async () => {
    const dir = join(REPO, 'test/fixtures/states');
    const examples = JSON.parse(readFileSync(join(dir, 'examples.json'), 'utf8')) as { name: string; state: unknown }[];
    expect(examples.length).toBeGreaterThan(0);
    for (const { name, state } of examples) {
      expect(() => parseViewState(state), name).not.toThrow();
    }
  });

  it('rejects a state from a newer schema instead of guessing', () => {
    expect(() => parseViewState({ ...base, v: 3 })).toThrow(expect.objectContaining({ code: 'STATE_UNSUPPORTED_VERSION' }));
  });

  it('applies migrations in order and validates the result', () => {
    const legacy = { v: 0, dataset: 'fixture@1.0.0', visible: ['cardiovascular.heart'] };
    const migrations = {
      ...STATE_MIGRATIONS,
      0: (s: Record<string, unknown>) => {
        const [model, version] = String(s.dataset).split('@');
        return { v: 1, data: { model, version }, scene: s.visible };
      },
    };
    const state = parseViewState(legacy, migrations);
    expect(state.scene).toEqual(['cardiovascular.heart']);
    expect(() => parseViewState({ v: 0 }, { 0: (s) => s })).toThrow(expect.objectContaining({ code: 'STATE_INVALID' }));
    expect(() => parseViewState({ v: 0 })).toThrow(expect.objectContaining({ code: 'STATE_UNSUPPORTED_VERSION' }));
  });

  it('never accepts a data URL or other unknown fields from a link', async () => {
    const hostile = { ...base, dataUrl: 'https://evil.example/data/' };
    await expect(decodeState(encodeJson(hostile))).rejects.toMatchObject({ code: 'STATE_INVALID' });
    const hostileData = { ...base, data: { ...base.data, url: 'https://evil.example/' } };
    await expect(decodeState(encodeJson(hostileData))).rejects.toMatchObject({ code: 'STATE_INVALID' });
  });

  it('rejects markup and path tricks in IDs', async () => {
    for (const id of ['<img src=x onerror=alert(1)>', '../manifest', 'Heart', 'a..b', '']) {
      await expect(decodeState(encodeJson({ ...base, selected: [id] }))).rejects.toMatchObject({ code: 'STATE_INVALID' });
    }
  });

  it('enforces size, decompression and nesting limits before parsing', async () => {
    await expect(decodeState(`z1.${'A'.repeat(STATE_LIMITS.maxEncodedLength + 10)}`)).rejects.toMatchObject({ code: 'STATE_TOO_LARGE' });
    // A small payload that inflates far beyond the limit (decompression bomb).
    const bomb = deflateRawSync(Buffer.alloc(STATE_LIMITS.maxDecodedBytes * 8, 0x20));
    const encodedBomb = `z1.${bytesToBase64Url(new Uint8Array(bomb))}`;
    expect(encodedBomb.length).toBeLessThan(STATE_LIMITS.maxEncodedLength);
    await expect(decodeState(encodedBomb)).rejects.toMatchObject({ code: 'STATE_TOO_LARGE' });
    let nested: unknown = 'x';
    for (let i = 0; i < 20; i++) nested = [nested];
    await expect(decodeState(encodeJson({ ...base, camera: nested }))).rejects.toMatchObject({ code: 'STATE_MALFORMED' });
  });

  it('reports malformed input with a clear code', async () => {
    await expect(decodeState('')).rejects.toMatchObject({ code: 'STATE_MALFORMED' });
    await expect(decodeState('x9.abc')).rejects.toMatchObject({ code: 'STATE_UNSUPPORTED_VERSION' });
    await expect(decodeState('j1.%%%')).rejects.toMatchObject({ code: 'STATE_MALFORMED' });
    await expect(decodeState(`j1.${bytesToBase64Url(new TextEncoder().encode('{not json'))}`)).rejects.toMatchObject({ code: 'STATE_MALFORMED' });
    await expect(decodeState('z1.AAAA')).rejects.toMatchObject({ code: 'STATE_MALFORMED' });
  });

  it('refuses to encode a state that would exceed the link limit instead of truncating it', async () => {
    const many = Array.from({ length: 3900 }, (_, i) => `system${i}.structure_with_a_rather_long_name_${i}`);
    const big: ViewState = { ...base, scene: many, hidden: many.slice(0, 3000), selected: many.slice(0, 3000) };
    await expect(encodeState(big)).rejects.toMatchObject({ code: 'STATE_TOO_LARGE' });
  });
});
