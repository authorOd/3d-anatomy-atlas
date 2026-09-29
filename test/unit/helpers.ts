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
import { join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AtlasCatalog, type CatalogOptions } from '@authorod/svitylo-3d-anatomy-atlas/core';

export const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const FIXTURES = join(REPO, 'test/fixtures/anatomy-data');

/** fetch() over the fixture folders (or another root): http://fixture.test/<version>/<path>. */
export function fixtureFetch(
  options: { fail?: (path: string) => number | 'network' | undefined; log?: string[]; root?: string } = {},
): typeof fetch {
  const root = options.root ?? FIXTURES;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const path = decodeURIComponent(url.pathname);
    options.log?.push(path);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const failure = options.fail?.(path);
    if (failure === 'network') throw new TypeError('Failed to fetch');
    if (typeof failure === 'number') return new Response('error', { status: failure });
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    try {
      const bytes = readFileSync(file);
      return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.byteLength) } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }) as typeof fetch;
}

export async function loadFixtureCatalog(version = '1.0.0', fetchImpl = fixtureFetch(), options: Partial<CatalogOptions> = {}) {
  return AtlasCatalog.load({ dataUrl: `http://fixture.test/${version}/`, fetch: fetchImpl, ...options });
}

/** Metadata and dictionaries of the data release shipped in packages/data (no geometry). */
export async function loadReleaseCatalog() {
  const { version } = JSON.parse(readFileSync(join(REPO, 'packages/data/package.json'), 'utf8')) as { version: string };
  const root = join(REPO, 'packages/data/releases');
  return AtlasCatalog.load({ dataUrl: `http://fixture.test/${version}/`, fetch: fixtureFetch({ root }) });
}

export function readFixtureManifest(version = '1.0.0') {
  return JSON.parse(readFileSync(join(FIXTURES, version, 'manifest.json'), 'utf8'));
}
