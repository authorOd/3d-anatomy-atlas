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
import { STRUCTURE_ID_PATTERN } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { fileExists, readJson, writeJson } from './io.js';

export type Side = 'left' | 'right';

export interface ParsedName {
  /** Name without side/attachment suffix. */
  base: string;
  side?: Side;
  attachment?: { kind: 'origin' | 'insertion'; index?: number };
}

/**
 * Parses Z-Anatomy suffixes: `.l`/`.r` (side) and `.o[N]l`, `.e[N]r` (muscle origin/insertion
 * patches); group labels end with `.g`, sided ones (added with models from other sources) with
 * `.l.g`/`.r.g`.
 */
export function parseSourceName(name: string): ParsedName {
  const attachment = /^(.*)\.(o|e)(\d*)([lr])$/.exec(name);
  if (attachment) {
    const [, base, kind, index, side] = attachment;
    return {
      base: base!.trim(),
      side: side === 'l' ? 'left' : 'right',
      attachment: { kind: kind === 'o' ? 'origin' : 'insertion', ...(index ? { index: Number(index) } : {}) },
    };
  }
  const sided = /^(.*)\.([lr])$/.exec(name);
  if (sided) return { base: sided[1]!.trim(), side: sided[2] === 'l' ? 'left' : 'right' };
  const sidedGroup = /^(.*)\.([lr])\.g$/.exec(name);
  if (sidedGroup) return { base: sidedGroup[1]!.trim(), side: sidedGroup[2] === 'l' ? 'left' : 'right' };
  const group = /^(.*)\.g$/.exec(name);
  if (group) return { base: group[1]!.trim() };
  return { base: name.trim() };
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function suffixFor(parsed: ParsedName): string {
  let suffix = '';
  if (parsed.attachment) {
    suffix += parsed.attachment.kind === 'origin' ? '_origin' : '_insertion';
    if (parsed.attachment.index !== undefined) suffix += `_${parsed.attachment.index}`;
  }
  if (parsed.side) suffix += parsed.side === 'left' ? '_l' : '_r';
  return suffix;
}

interface RegistryFile {
  $comment?: string;
  ids: Record<string, string>;
  aliases?: Record<string, string>;
}

/**
 * Stable ID registry: source key -> structure ID. IDs are assigned once and reused on every
 * build, so renaming or re-translating a structure never changes its ID. Renames go through
 * `aliases` (old ID -> new ID).
 */
export class IdRegistry {
  private readonly ids: Map<string, string>;
  readonly aliases: Map<string, string>;
  private readonly used = new Map<string, string>();
  private readonly touched = new Set<string>();
  created = 0;

  constructor(private readonly path: string) {
    const file: RegistryFile = fileExists(path) ? readJson<RegistryFile>(path) : { ids: {} };
    this.ids = new Map(Object.entries(file.ids));
    this.aliases = new Map(Object.entries(file.aliases ?? {}));
    for (const [key, id] of this.ids) {
      if (this.used.has(id)) throw new Error(`ID registry assigns ${id} twice (${key}, ${this.used.get(id)})`);
      this.used.set(id, key);
    }
  }

  assign(key: string, proposed: string): string {
    const existing = this.ids.get(key);
    if (existing) {
      this.touched.add(key);
      return existing;
    }
    let id = proposed;
    for (let n = 2; this.used.has(id) || this.aliases.has(id); n++) id = `${proposed}_${n}`;
    if (!STRUCTURE_ID_PATTERN.test(id) || id.length > 160) throw new Error(`Generated invalid ID ${id} for ${key}`);
    this.ids.set(key, id);
    this.used.set(id, key);
    this.touched.add(key);
    this.created++;
    return id;
  }

  /** IDs of the registry that were not produced by this build (removed from the source). */
  unused(): string[] {
    return [...this.ids.entries()].filter(([key]) => !this.touched.has(key)).map(([, id]) => id);
  }

  save(): void {
    const sorted = Object.fromEntries([...this.ids.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    writeJson(this.path, {
      $comment:
        'Stable structure IDs (source key -> ID). Generated once, then maintained by hand: never regenerate IDs from names or translations. Renamed IDs are listed in aliases (old -> new).',
      ids: sorted,
      aliases: Object.fromEntries([...this.aliases.entries()].sort()),
    });
  }
}
