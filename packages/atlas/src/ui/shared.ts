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
import { AtlasCatalog } from '../core/catalog/catalog.js';
import type { NamePolicy } from '../core/catalog/names.js';

/**
 * Metadata (manifest, dictionaries, search) is immutable, so every atlas on a page that uses the
 * same data folder shares one catalogue: a note with ten embeds downloads and parses it once.
 * A failed load is forgotten, so "retry" requests it again.
 */
const catalogs = new Map<string, Promise<AtlasCatalog>>();

export function sharedCatalog(dataUrl: string, names: NamePolicy): Promise<AtlasCatalog> {
  const key = `${new URL(dataUrl, document.baseURI).href}|${names.ukrainian}`;
  let promise = catalogs.get(key);
  if (!promise) {
    promise = AtlasCatalog.load({ dataUrl, names });
    promise.catch(() => catalogs.delete(key));
    catalogs.set(key, promise);
  }
  return promise;
}

/** An embed that can give up its WebGL context and return to its placeholder. */
export interface ActiveEmbed {
  /** Returns false when the embed is in use and must stay active (e.g. expanded). */
  deactivateEmbed(): boolean;
}

/**
 * Browsers allow only a limited number of WebGL contexts per page. Active embeds are kept in
 * least-recently-used order; activating one more than the limit returns the oldest one to its
 * placeholder (its view is kept and restored when it is shown again).
 */
const active = new Map<ActiveEmbed, number>();
let clock = 0;
export const embedLimits = { maxActive: 4 };

export function touchEmbed(embed: ActiveEmbed): void {
  if (active.has(embed)) active.set(embed, ++clock);
}

export function registerEmbed(embed: ActiveEmbed): void {
  active.set(embed, ++clock);
  const limit = Math.max(1, Math.floor(embedLimits.maxActive));
  const candidates = [...active.entries()].filter(([e]) => e !== embed).sort((a, b) => a[1] - b[1]);
  for (const [oldest] of candidates) {
    if (active.size <= limit) break;
    if (oldest.deactivateEmbed()) active.delete(oldest);
  }
}

export function unregisterEmbed(embed: ActiveEmbed): void {
  active.delete(embed);
}

export function activeEmbedCount(): number {
  return active.size;
}
