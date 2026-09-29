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
import { z } from 'zod';
import { REVIEW_STATUSES, ReviewSchema } from './manifest.js';
import { LangSchema, ModelIdSchema, SemverSchema, StructureIdSchema, safeText } from './primitives.js';

/**
 * Where a name comes from:
 * - `source`: imported with provenance from the source dataset;
 * - `draft`: a translation draft that has not been verified (never shown as a verified name);
 * - `editorial`: written and maintained by the atlas editors.
 */
export const NAME_ORIGINS = ['source', 'draft', 'editorial'] as const;
export type NameOrigin = (typeof NAME_ORIGINS)[number];

export const DictionaryEntrySchema = z
  .object({
    name: safeText(300),
    synonyms: z.array(safeText(300)).max(32).optional(),
    status: z.enum(REVIEW_STATUSES),
    origin: z.enum(NAME_ORIGINS),
    source: safeText(300).optional(),
    review: ReviewSchema.optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.status === 'reviewed' && e.review?.status !== 'reviewed') {
      ctx.addIssue({ code: 'custom', message: 'A reviewed name needs a review record (reviewer, date, scope)' });
    }
    if (e.origin === 'draft' && e.status === 'reviewed') {
      ctx.addIssue({ code: 'custom', message: 'A draft cannot be marked as reviewed; change its origin to editorial' });
    }
  });
export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

export const DictionarySchema = z
  .object({
    schemaVersion: z.literal(1),
    lang: LangSchema,
    model: ModelIdSchema,
    version: SemverSchema,
    entries: z.record(StructureIdSchema, DictionaryEntrySchema),
    /** Structures that explicitly have no name in this language. */
    missing: z.array(StructureIdSchema).max(30000),
  })
  .strict();
export type Dictionary = z.infer<typeof DictionarySchema>;
