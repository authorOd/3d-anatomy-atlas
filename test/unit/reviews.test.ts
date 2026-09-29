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
import { describe, expect, it } from 'vitest';
import type { DictionaryEntry, Lang, Review } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { DictionarySchema } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { NameResolver } from '@authorod/svitylo-3d-anatomy-atlas/core';
import { applyReviews, parseReviewsFile } from '@svitylo-atlas/tools/src/lib/reviews.js';

const reviewer = { reviewer: 'Dr. Example', date: '2026-10-01', scope: 'term' };

function targets() {
  const nodes: { id: string; review: Review }[] = [
    { id: 'cardiovascular.heart', review: { status: 'unreviewed' } },
    { id: 'skeletal.femur_l', review: { status: 'unreviewed' } },
  ];
  const names: Record<Lang, Map<string, DictionaryEntry>> = {
    uk: new Map([['cardiovascular.heart', { name: 'Серце', status: 'unreviewed', origin: 'draft', source: 'Atlas Ukrainian drafts' }]]),
    la: new Map([['cardiovascular.heart', { name: 'Cor', status: 'unreviewed', origin: 'source' }]]),
    en: new Map([['cardiovascular.heart', { name: 'Heart', status: 'unreviewed', origin: 'source' }]]),
  };
  return { nodes, names };
}

describe('human review records', () => {
  it('turns a confirmed Ukrainian draft into a reviewed editorial name that the atlas shows', () => {
    const t = targets();
    const file = parseReviewsFile({
      names: { uk: { 'cardiovascular.heart': { review: { status: 'reviewed', ...reviewer } } } },
      structures: { 'skeletal.femur_l': { status: 'needs-correction', notes: 'Proximal end is truncated.' } },
    });
    expect(applyReviews(file, t)).toEqual({ structures: 1, names: 1 });
    const uk = t.names.uk.get('cardiovascular.heart')!;
    expect(uk).toMatchObject({ name: 'Серце', status: 'reviewed', origin: 'editorial' });
    expect(t.nodes[1]!.review.status).toBe('needs-correction');

    // The dictionary entry is valid and the resolver now prefers the Ukrainian name.
    const dictionary = DictionarySchema.parse({
      schemaVersion: 1,
      lang: 'uk',
      model: 'fixture',
      version: '1.0.0',
      entries: Object.fromEntries(t.names.uk),
      missing: [],
    });
    const resolver = new NameResolver({ uk: dictionary });
    expect(resolver.label('cardiovascular.heart', 'uk')).toBe('Серце');
  });

  it('a corrected name replaces the draft and keeps the review record', () => {
    const t = targets();
    applyReviews(
      parseReviewsFile({ names: { uk: { 'cardiovascular.heart': { name: 'Серце (cor)', review: { status: 'reviewed', ...reviewer } } } } }),
      t,
    );
    expect(t.names.uk.get('cardiovascular.heart')).toMatchObject({ name: 'Серце (cor)', origin: 'editorial', review: { reviewer: 'Dr. Example' } });
  });

  it('rejects unknown IDs, incomplete reviews and markup', () => {
    expect(() => applyReviews(parseReviewsFile({ structures: { 'nope.nope': { status: 'reviewed', ...reviewer } } }), targets())).toThrow(/unknown structure nope\.nope/);
    expect(() => parseReviewsFile({ structures: { 'cardiovascular.heart': { status: 'reviewed' } } })).toThrow(/requires reviewer, date and scope/);
    expect(() => parseReviewsFile({ structures: { 'cardiovascular.heart': { status: 'needs-correction' } } })).toThrow(/requires notes/);
    expect(() => parseReviewsFile({ names: { uk: { 'cardiovascular.heart': { name: '<b>Серце</b>', review: { status: 'reviewed', ...reviewer } } } } })).toThrow();
    expect(() => parseReviewsFile({ reviewz: {} })).toThrow(/unknown key/);
  });
});
