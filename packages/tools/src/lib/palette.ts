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
import type { MaterialEntry } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { slugify } from './ids.js';

export interface PaletteRule {
  match: string;
  kind: MaterialEntry['kind'];
  color: string;
  vary?: boolean;
}

export interface PaletteConfig {
  rules: PaletteRule[];
  fallback: { kind: MaterialEntry['kind']; color: string };
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Maps source material names to palette entries; the palette index is stored per vertex. */
export class Palette {
  readonly entries: MaterialEntry[] = [];
  private readonly byName = new Map<string, number>();
  private readonly compiled: { re: RegExp; rule: PaletteRule }[];

  constructor(private readonly config: PaletteConfig) {
    this.compiled = config.rules.map((rule) => ({ re: new RegExp(rule.match), rule }));
  }

  indexOf(materialName: string | null): number {
    const name = materialName ?? '';
    const cached = this.byName.get(name);
    if (cached !== undefined) return cached;
    const found = this.compiled.find((c) => c.re.test(name));
    const kind = found?.rule.kind ?? this.config.fallback.kind;
    let color = found?.rule.color ?? this.config.fallback.color;
    if (found?.rule.vary) {
      const numbered = /(\d+)\D*$/.exec(name);
      const variant = numbered ? Number(numbered[1]) : hash(name) % 7;
      const factor = 1 + ((variant % 7) - 3) * 0.035;
      const [r, g, b] = hexToRgb(color);
      color = rgbToHex([r * factor, g * factor, b * factor]);
    }
    const key = slugify(name).replace(/_/g, '-') || 'default';
    let index = this.entries.findIndex((e) => e.key === key);
    if (index < 0) {
      if (this.entries.length >= 255) throw new Error('Palette exceeds 255 entries');
      index = this.entries.length;
      this.entries.push({ key, kind, color });
    }
    this.byName.set(name, index);
    return index;
  }
}
