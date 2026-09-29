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
import {
  LANGS,
  ReviewSchema,
  safeText,
  type DictionaryEntry,
  type Lang,
  type Review,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';

/**
 * Human review records (packages/data/sources/reviews.json). Only people edit this file; the
 * pipeline copies the records into the manifest and dictionaries and never marks anything as
 * reviewed by itself. Keys are stable structure IDs, so records survive rebuilds.
 */
export interface NameReview {
  /** Corrected or confirmed name; omitted = the current dictionary name is confirmed. */
  name?: string;
  synonyms?: string[];
  review: Review;
}

export interface ReviewsFile {
  /** Anatomical review of a structure (geometry, position, hierarchy). */
  structures: Record<string, Review>;
  /** Terminology review per language. */
  names: Partial<Record<Lang, Record<string, NameReview>>>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseReview(value: unknown, where: string): Review {
  const result = ReviewSchema.safeParse(value);
  if (!result.success) throw new Error(`${where}: ${result.error.issues.map((i) => i.message).join('; ')}`);
  if (result.data.status === 'needs-correction' && !result.data.notes) throw new Error(`${where}: \`needs-correction\` requires notes`);
  return result.data;
}

/** Validates the review file (strict: unknown keys are errors). */
export function parseReviewsFile(raw: unknown): ReviewsFile {
  if (!isRecord(raw)) throw new Error('reviews.json must be an object');
  for (const key of Object.keys(raw)) {
    if (!['$comment', 'structures', 'names'].includes(key)) throw new Error(`reviews.json: unknown key ${key}`);
  }
  const section = (key: string): Record<string, unknown> => {
    const value = raw[key] ?? {};
    if (!isRecord(value)) throw new Error(`reviews.${key} must be an object`);
    return value;
  };
  const file: ReviewsFile = { structures: {}, names: {} };
  for (const [id, value] of Object.entries(section('structures'))) file.structures[id] = parseReview(value, `reviews.structures.${id}`);
  for (const [lang, entries] of Object.entries(section('names'))) {
    if (!(LANGS as readonly string[]).includes(lang)) throw new Error(`reviews.names: unknown language ${lang}`);
    if (!isRecord(entries)) throw new Error(`reviews.names.${lang} must be an object`);
    const out: Record<string, NameReview> = {};
    for (const [id, value] of Object.entries(entries)) {
      const where = `reviews.names.${lang}.${id}`;
      if (!isRecord(value)) throw new Error(`${where} must be an object`);
      for (const key of Object.keys(value)) if (!['name', 'synonyms', 'review'].includes(key)) throw new Error(`${where}: unknown key ${key}`);
      const record: NameReview = { review: parseReview(value.review, where) };
      if (value.name !== undefined) record.name = safeText(300).parse(value.name);
      if (value.synonyms !== undefined) {
        if (!Array.isArray(value.synonyms) || value.synonyms.length > 32) throw new Error(`${where}: synonyms must be a list (≤ 32)`);
        record.synonyms = value.synonyms.map((v) => safeText(300).parse(v));
      }
      out[id] = record;
    }
    file.names[lang as Lang] = out;
  }
  return file;
}

export interface ReviewTargets {
  /** Structures of the release (the review record is replaced in place). */
  nodes: { id: string; review: Review }[];
  names: Record<Lang, Map<string, DictionaryEntry>>;
}

/** Applies review records; unknown IDs are errors so typos never go unnoticed. */
export function applyReviews(file: ReviewsFile, targets: ReviewTargets): { structures: number; names: number } {
  const byId = new Map(targets.nodes.map((n) => [n.id, n]));
  const errors: string[] = [];
  let structures = 0;
  let names = 0;

  for (const [id, review] of Object.entries(file.structures)) {
    const node = byId.get(id);
    if (!node) errors.push(`reviews.structures: unknown structure ${id}`);
    else {
      node.review = review;
      structures++;
    }
  }
  for (const lang of LANGS) {
    for (const [id, record] of Object.entries(file.names[lang] ?? {})) {
      if (!byId.has(id)) {
        errors.push(`reviews.names.${lang}: unknown structure ${id}`);
        continue;
      }
      const current = targets.names[lang].get(id);
      const name = record.name ?? current?.name;
      if (!name) {
        errors.push(`reviews.names.${lang}: ${id} has no name to confirm; give "name"`);
        continue;
      }
      const synonyms = record.synonyms ?? current?.synonyms;
      // A corrected name, or a draft confirmed by a reviewer, becomes an editorial name.
      let origin = current?.origin ?? 'editorial';
      if (record.name !== undefined && record.name !== current?.name) origin = 'editorial';
      else if (origin === 'draft' && record.review.status === 'reviewed') origin = 'editorial';
      targets.names[lang].set(id, {
        name,
        ...(synonyms?.length ? { synonyms } : {}),
        status: record.review.status,
        origin,
        source: current?.source ?? 'Atlas editors',
        review: record.review,
      });
      names++;
    }
  }
  if (errors.length) throw new Error(`Invalid review records:\n  ${errors.join('\n  ')}`);
  return { structures, names };
}
