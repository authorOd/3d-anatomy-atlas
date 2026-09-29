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
import type { Dictionary, DictionaryEntry, Lang, NameOrigin, ReviewStatus } from '../../schema/index.js';

export interface DisplayName {
  text: string;
  /** Language of the shown text; differs from `requested` when a fallback is used. */
  lang: Lang;
  requested: Lang;
  fallback: boolean;
  status: ReviewStatus;
  origin: NameOrigin;
}

export interface NameVariant {
  lang: Lang;
  entry: DictionaryEntry;
}

export interface NamePolicy {
  /**
   * `any` (default): unreviewed Ukrainian names (translation drafts) are shown; `DisplayName`
   * carries their status and origin so the UI can mark them.
   * `reviewed`: a Ukrainian name is shown only when its translation was reviewed; otherwise the
   * English name is shown and labelled as English.
   */
  ukrainian: 'reviewed' | 'any';
}

/** A missing name falls back to English (complete for every structure), Latin last. */
const FALLBACK_ORDER: Record<Lang, Lang[]> = {
  uk: ['uk', 'en', 'la'],
  la: ['la', 'en'],
  en: ['en', 'la'],
};

/** Resolves display names with an explicit language fallback, never inventing names. */
export class NameResolver {
  private readonly dictionaries: Partial<Record<Lang, Dictionary>>;
  readonly policy: NamePolicy;

  constructor(dictionaries: Partial<Record<Lang, Dictionary>>, policy: Partial<NamePolicy> = {}) {
    this.dictionaries = dictionaries;
    this.policy = { ukrainian: policy.ukrainian ?? 'any' };
  }

  entry(id: string, lang: Lang): DictionaryEntry | undefined {
    return this.dictionaries[lang]?.entries[id];
  }

  /** Every available name of a structure, in uk, la, en order. */
  variants(id: string): NameVariant[] {
    const out: NameVariant[] = [];
    for (const lang of ['uk', 'la', 'en'] as const) {
      const entry = this.entry(id, lang);
      if (entry) out.push({ lang, entry });
    }
    return out;
  }

  private acceptable(lang: Lang, entry: DictionaryEntry, allowFlagged: boolean): boolean {
    if (!allowFlagged && entry.status === 'needs-correction') return false;
    if (lang === 'uk' && this.policy.ukrainian === 'reviewed') return entry.status === 'reviewed';
    return true;
  }

  display(id: string, requested: Lang): DisplayName | null {
    for (const allowFlagged of [false, true]) {
      for (const lang of FALLBACK_ORDER[requested]) {
        const entry = this.entry(id, lang);
        if (entry && this.acceptable(lang, entry, allowFlagged)) {
          return {
            text: entry.name,
            lang,
            requested,
            fallback: lang !== requested,
            status: entry.status,
            origin: entry.origin,
          };
        }
      }
    }
    return null;
  }

  /** Display text with the ID as a last resort (marked by `null` name in `display`). */
  label(id: string, lang: Lang): string {
    return this.display(id, lang)?.text ?? id;
  }
}
