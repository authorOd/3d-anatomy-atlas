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

import type MarkdownIt from 'markdown-it';
import { parseAnatomyBlock, stateFromShareLink, type ParseOptions } from './block.js';
import { renderAnatomyEmbed, type RenderOptions } from './html.js';

export interface AnatomyMarkdownItOptions extends RenderOptions, ParseOptions {}

type Token = ReturnType<MarkdownIt['parse']>[number];

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * URL of a paragraph that holds nothing but one link: plain text, an autolink, linkify, or a link
 * whose text is its own address (as the PHP renderer reads it). A link with other text is kept.
 */
function loneUrl(inline: Token): string | null {
  const children = (inline.children ?? []).filter((t) => !(t.type === 'text' && t.content.trim() === '') && t.type !== 'softbreak');
  if (children.length === 1 && children[0]!.type === 'text') return children[0]!.content.trim();
  if (children.length === 3 && children[0]!.type === 'link_open' && children[1]!.type === 'text' && children[2]!.type === 'link_close') {
    const open = children[0]!;
    const href = open.attrGet('href');
    if (!href) return null;
    return open.markup === 'autolink' || open.markup === 'linkify' || decode(children[1]!.content) === decode(href) ? href : null;
  }
  return null;
}

/**
 * markdown-it plugin: ```anatomy blocks and paragraphs holding only an atlas share link (from
 * `shareUrls`) become embeds. Invalid blocks are rendered as ordinary code blocks.
 *
 *     const md = new MarkdownIt({ linkify: true }).use(anatomyPlugin, {
 *       dataUrl: '/anatomy-data/1.1.0/',
 *       shareUrls: ['https://svitylo.com/atlas'],
 *     });
 */
export function anatomyPlugin(md: MarkdownIt, options: AnatomyMarkdownItOptions = {}): void {
  const fallback = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx]!;
    if (token.info.trim().split(/\s+/)[0] === 'anatomy') {
      const { spec } = parseAnatomyBlock(token.content);
      if (spec) return `${renderAnatomyEmbed(spec, options)}\n`;
    }
    return fallback ? fallback(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
  };

  const shareUrls = options.shareUrls;
  if (!shareUrls?.length) return;
  md.core.ruler.push('svitylo_anatomy_links', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      const [open, inline, close] = [tokens[i]!, tokens[i + 1]!, tokens[i + 2]!];
      if (open.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close') continue;
      const url = loneUrl(inline);
      const token = url ? stateFromShareLink(url, shareUrls) : null;
      if (!token) continue;
      const html = new state.Token('html_block', '', 0);
      html.content = `${renderAnatomyEmbed({ state: token }, options)}\n`;
      html.block = true;
      html.map = open.map;
      tokens.splice(i, 3, html);
    }
  });
}

export default anatomyPlugin;
