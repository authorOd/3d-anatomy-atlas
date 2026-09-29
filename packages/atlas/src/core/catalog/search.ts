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
import type { Lang, ReviewStatus } from '../../schema/index.js';
import type { NameResolver } from './names.js';
import type { StructureIndex } from './structure-index.js';

/**
 * Normalises text for matching: case, diacritics (including Ukrainian й/ї and Latin æ/œ),
 * apostrophes and punctuation. Keyboard layout correction is intentionally not attempted.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ґ/g, 'г')
    .replace(/ё/g, 'е')
    .replace(/['’ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

interface IndexedText {
  norm: string;
  words: string[];
  original: string;
  lang: Lang;
  kind: 'name' | 'synonym';
  status: ReviewStatus;
}

interface Entry {
  structure: number;
  texts: IndexedText[];
}

export interface SearchResult {
  id: string;
  score: number;
  /** The name or synonym that matched (may differ from the display name). */
  matched: { text: string; lang: Lang; kind: 'name' | 'synonym'; status: ReviewStatus };
}

export interface SearchOptions {
  lang: Lang;
  limit?: number;
}

/**
 * Search over all names and synonyms in all languages at once. It depends only on the
 * dictionaries, so it works before any geometry is downloaded.
 */
export class SearchIndex {
  private readonly entries: Entry[] = [];

  constructor(
    private readonly index: StructureIndex,
    names: NameResolver,
  ) {
    for (const node of index.structures) {
      const texts: IndexedText[] = [];
      for (const { lang, entry } of names.variants(node.id)) {
        const add = (original: string, kind: 'name' | 'synonym') => {
          const norm = normalizeSearchText(original);
          if (norm) texts.push({ norm, words: norm.split(' '), original, lang, kind, status: entry.status });
        };
        add(entry.name, 'name');
        for (const synonym of entry.synonyms ?? []) add(synonym, 'synonym');
      }
      if (texts.length > 0) this.entries.push({ structure: node.index, texts });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  search(query: string, options: SearchOptions): SearchResult[] {
    const q = normalizeSearchText(query);
    if (!q) return [];
    const terms = q.split(' ');
    const limit = options.limit ?? 50;
    const results: SearchResult[] = [];
    for (const entry of this.entries) {
      let best = 0;
      let bestText: IndexedText | undefined;
      for (const t of entry.texts) {
        let score = scoreText(t, q, terms);
        if (score === 0) continue;
        if (t.lang === options.lang) score += 6;
        if (t.kind === 'name') score += 3;
        if (score > best) {
          best = score;
          bestText = t;
        }
      }
      if (!bestText) continue;
      const node = this.index.structures[entry.structure]!;
      // Among equally good matches: structures with geometry first, systems hidden by default
      // (muscle attachments) last, then shallow nodes and shorter names first.
      if (this.index.hasGeometry(node)) best += 2;
      if (this.index.inHiddenSystem(node)) best -= 1.5;
      best -= Math.min(node.depth, 10) * 0.05;
      best -= Math.min(bestText.norm.length - q.length, 50) * 0.01;
      results.push({
        id: node.id,
        score: best,
        matched: { text: bestText.original, lang: bestText.lang, kind: bestText.kind, status: bestText.status },
      });
    }
    results.sort((a, b) => b.score - a.score || a.matched.text.length - b.matched.text.length || (a.id < b.id ? -1 : 1));
    return results.slice(0, limit);
  }
}

function scoreText(t: IndexedText, q: string, terms: string[]): number {
  if (t.norm === q) return 100;
  if (t.norm.startsWith(q)) return 85;
  const wordPrefix = terms.every((term) => t.words.some((w) => w.startsWith(term)));
  if (wordPrefix) return t.words[0]?.startsWith(terms[0]!) ? 72 : 65;
  if (t.norm.includes(q)) return 50;
  if (terms.every((term) => t.norm.includes(term))) return 35;
  return 0;
}
