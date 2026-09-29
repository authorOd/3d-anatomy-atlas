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

import type { AnatomyEmbedSpec, EmbedLang } from './block.js';

export interface RenderOptions {
  /** `data-url` of the embeds (the site's data folder); omitted: the atlas default. */
  dataUrl?: string;
  /** Names language when a block does not set one. */
  lang?: EmbedLang;
  /** Class of the wrapping <figure> (default `svitylo-anatomy-embed`). */
  className?: string;
  /** Extra attributes of <svitylo-anatomy> after the standard ones, e.g. `{ 'wire:ignore': true }`. */
  attributes?: Record<string, string | true>;
}

export const EMBED_CLASS = 'svitylo-anatomy-embed';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and double-quoted attributes (the same table as the PHP side). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Attributes of <svitylo-anatomy> for a spec, in a fixed order. `true` is a boolean attribute. */
export function embedAttributes(spec: AnatomyEmbedSpec, options: RenderOptions = {}): [string, string | true][] {
  const attrs: [string, string | true][] = [['layout', 'embed']];
  const add = (name: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') attrs.push([name, String(value)]);
  };
  add('data-url', options.dataUrl);
  add('structure', spec.structure);
  add('system', spec.system);
  add('surroundings', spec.surroundings);
  add('view', spec.view);
  add('state', spec.state);
  add('label', spec.label);
  add('height', spec.height);
  add('lang', spec.lang ?? options.lang);
  if (spec.latin) attrs.push(['latin', true]);
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    if (/^[a-z][a-z0-9:._-]*$/i.test(name) && !attrs.some(([n]) => n === name)) attrs.push([name, value === true ? true : String(value)]);
  }
  return attrs;
}

/**
 * HTML of an embed: `<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" …>
 * </svitylo-anatomy><figcaption>…</figcaption></figure>` (no trailing newline). The PHP package
 * produces exactly the same string for the same spec.
 */
export function renderAnatomyEmbed(spec: AnatomyEmbedSpec, options: RenderOptions = {}): string {
  const attrs = embedAttributes(spec, options)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`))
    .join('');
  const caption = spec.caption ? `<figcaption>${escapeHtml(spec.caption)}</figcaption>` : '';
  return `<figure class="${escapeHtml(options.className ?? EMBED_CLASS)}"><svitylo-anatomy${attrs}></svitylo-anatomy>${caption}</figure>`;
}
