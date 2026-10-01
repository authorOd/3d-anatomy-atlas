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
/**
 * The ```anatomy block of a note: flat `key: value` lines describing one atlas embed.
 *
 *     ```anatomy
 *     structure: cardiovascular.heart
 *     surroundings: 2
 *     view: anterior
 *     label: Heart
 *     caption: The heart in its surroundings
 *     ```
 *
 * A share link of the atlas (`link: https://…#s=z1.…`, or the link alone on a line) carries an
 * exact view. Values are validated here, so a block can never inject markup or a data URL:
 * invalid blocks are reported and the caller keeps the plain code block.
 */

/** Same rules as the atlas state schema (checked by a test so the two never drift apart). */
export const STRUCTURE_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9][a-z0-9_]*)*$/;
export const MAX_ID_LENGTH = 160;
export const MAX_STATE_LENGTH = 32_768;
export const MAX_SURROUNDINGS_LEVEL = 32;
export const EMBED_VIEWS = ['anterior', 'posterior', 'left', 'right', 'superior', 'inferior'] as const;
export const EMBED_LANGS = ['uk', 'en', 'la'] as const;
export const EMBED_HEIGHT = { min: 160, max: 2000 } as const;
const STATE_PATTERN = /^(?:z1|j1)\.[A-Za-z0-9_-]+$/;

export type EmbedView = (typeof EMBED_VIEWS)[number];
export type EmbedLang = (typeof EMBED_LANGS)[number];

export interface AnatomyEmbedSpec {
  /** Structure shown when there is no state (and named on the placeholder via `label`). */
  structure?: string;
  /** System shown when there is neither a state nor a structure. */
  system?: string;
  /** Surroundings level around the structure (1 = nearest parent group). */
  surroundings?: number;
  view?: EmbedView;
  /** Encoded atlas state (`z1.…` / `j1.…`): the exact view; wins over the fields above. */
  state?: string;
  /** Name on the placeholder before anything is loaded. */
  label?: string;
  /** Caption under the embed. */
  caption?: string;
  /** Height in CSS pixels. */
  height?: number;
  lang?: EmbedLang;
  /** Show Latin names alongside. */
  latin?: boolean;
}

export interface ParseOptions {
  /**
   * Atlas pages whose share links become embeds when a link stands alone in a paragraph
   * (e.g. `https://svitylo.com/atlas`). Inside a block any link with `#s=` is accepted, because
   * only its state is used.
   */
  shareUrls?: readonly string[];
}

export interface ParseResult {
  spec: AnatomyEmbedSpec | null;
  /** Keys with invalid values (or `syntax`, `empty`); the block is not turned into an embed. */
  errors: string[];
  /** Ignored keys (unknown or repeated). */
  warnings: string[];
}

const TEXT_LIMITS = { label: 200, caption: 500 } as const;
// Control characters (except tab) are not allowed in texts.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

const unquote = (value: string) => {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  return v;
};

// A loop, not /\/+$/: on a long run of slashes that does not end the string the expression backtracks
// polynomially.
const withoutTrailingSlashes = (value: string) => {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
};

const isId = (value: string) => value.length <= MAX_ID_LENGTH && STRUCTURE_ID_PATTERN.test(value);
const isState = (value: string) => value.length <= MAX_STATE_LENGTH && STATE_PATTERN.test(value);

/** The state token of an atlas share link (`…#s=z1.…`), or null. Never uses the URL itself. */
export function stateFromShareLink(url: string, allowedPrefixes?: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (allowedPrefixes) {
    const page = `${parsed.origin}${parsed.pathname}`;
    const allowed = allowedPrefixes.some((prefix) => {
      const p = withoutTrailingSlashes(prefix);
      return page === p || page.startsWith(`${p}/`) || page === `${p}/`;
    });
    if (!allowed) return null;
  }
  const token = new URLSearchParams(parsed.hash.slice(1)).get('s');
  return token && isState(token) ? token : null;
}

export function parseAnatomyBlock(text: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec: AnatomyEmbedSpec = {};
  const seen = new Set<string>();
  const fail = (key: string) => {
    if (!errors.includes(key)) errors.push(key);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let key: string;
    let value: string;
    // The value starts with a non-space, so the spaces after the colon match in one way only:
    // with `\s*(.*)$` a long line with a line separator inside backtracks polynomially.
    const match = /^([a-z][a-z0-9-]*)\s*:\s*(\S.*)?$/i.exec(line);
    if (match && !/^https?$/i.test(match[1]!)) {
      key = match[1]!.toLowerCase();
      value = unquote(match[2] ?? '');
    } else if (/^https?:\/\//i.test(line)) {
      // A share link alone on a line.
      key = 'link';
      value = line;
    } else {
      fail('syntax');
      continue;
    }
    if (seen.has(key)) {
      warnings.push(key);
      continue;
    }
    seen.add(key);
    switch (key) {
      case 'structure':
      case 'system':
        if (isId(value)) spec[key] = value;
        else fail(key);
        break;
      case 'surroundings': {
        const level = /^\d+$/.test(value) ? Number(value) : NaN;
        if (level >= 1 && level <= MAX_SURROUNDINGS_LEVEL) spec.surroundings = level;
        else fail(key);
        break;
      }
      case 'view':
        if ((EMBED_VIEWS as readonly string[]).includes(value)) spec.view = value as EmbedView;
        else fail(key);
        break;
      case 'state':
        if (isState(value)) spec.state = value;
        else fail(key);
        break;
      case 'link': {
        const token = stateFromShareLink(value);
        if (token) spec.state = token;
        else fail(key);
        break;
      }
      case 'label':
      case 'caption':
        if (value && value.length <= TEXT_LIMITS[key] && !CONTROL.test(value)) spec[key] = value;
        else fail(key);
        break;
      case 'height': {
        const height = /^\d+$/.test(value) ? Number(value) : NaN;
        if (height >= EMBED_HEIGHT.min && height <= EMBED_HEIGHT.max) spec.height = height;
        else fail(key);
        break;
      }
      case 'lang':
        if ((EMBED_LANGS as readonly string[]).includes(value)) spec.lang = value as EmbedLang;
        else fail(key);
        break;
      case 'latin':
        if (/^(true|yes|on)$/i.test(value)) spec.latin = true;
        else if (!/^(false|no|off)$/i.test(value)) fail(key);
        break;
      default:
        warnings.push(key);
    }
  }
  if (errors.length === 0 && !spec.state && !spec.structure && !spec.system) errors.push('empty');
  return { spec: errors.length ? null : spec, errors, warnings };
}

/** Text of a block for a spec (the inverse of `parseAnatomyBlock`, in a fixed key order). */
export function formatAnatomyBlock(spec: AnatomyEmbedSpec): string {
  const lines: string[] = [];
  const add = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') lines.push(`${key}: ${value}`);
  };
  add('label', spec.label);
  add('structure', spec.structure);
  add('system', spec.system);
  add('surroundings', spec.surroundings);
  add('view', spec.view);
  add('state', spec.state);
  add('caption', spec.caption);
  add('height', spec.height);
  add('lang', spec.lang);
  if (spec.latin) lines.push('latin: true');
  return lines.join('\n');
}
