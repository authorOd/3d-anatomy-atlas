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
import { parseAnatomyBlock, type AnatomyEmbedSpec } from './block.js';
import { EMBED_CLASS, embedAttributes, type RenderOptions } from './html.js';

/** Builds the embed with DOM APIs (no HTML parsing): usable under a strict CSP and Trusted Types. */
export function createEmbedElement(spec: AnatomyEmbedSpec, options: RenderOptions = {}, doc: Document = document): HTMLElement {
  const figure = doc.createElement('figure');
  figure.className = options.className ?? EMBED_CLASS;
  const atlas = doc.createElement('svitylo-anatomy');
  for (const [name, value] of embedAttributes(spec, options)) atlas.setAttribute(name, value === true ? '' : value);
  figure.append(atlas);
  if (spec.caption) {
    const caption = doc.createElement('figcaption');
    caption.textContent = spec.caption;
    figure.append(caption);
  }
  return figure;
}

/**
 * Turns `<pre><code class="language-anatomy">` blocks (Markdown fences rendered by any engine,
 * the HTML of a rich text editor, sanitized HTML) into embeds. Invalid blocks stay code. Returns the number of
 * embeds created; running it again does nothing.
 */
export function upgradeAnatomyBlocks(root: ParentNode = document, options: RenderOptions = {}): number {
  let count = 0;
  for (const code of Array.from(root.querySelectorAll('pre > code.language-anatomy'))) {
    const pre = code.parentElement!;
    const { spec } = parseAnatomyBlock(code.textContent ?? '');
    if (!spec) continue;
    pre.replaceWith(createEmbedElement(spec, options, pre.ownerDocument));
    count++;
  }
  return count;
}
