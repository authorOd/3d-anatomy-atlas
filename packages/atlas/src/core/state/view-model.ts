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
import { type Lang, type ViewState } from '../../schema/index.js';
import type { IndexedStructure, SelectionLevel, StructureIndex } from '../catalog/structure-index.js';

export const MODE_HIDDEN = 0;
export const MODE_OPAQUE = 1;
export const MODE_GHOST = 2;
export type DisplayMode = typeof MODE_HIDDEN | typeof MODE_OPAQUE | typeof MODE_GHOST;

export interface DisplaySnapshot {
  /** Display mode per structure index. */
  modes: Uint8Array;
  /** Units highlighted as selected (only meaningful where visible). */
  selectedUnits: Set<number>;
  visibleCount: number;
  ghostCount: number;
  /** Units that should have geometry on the GPU (visible = opaque or ghost). */
  visibleUnits: Set<number>;
  /** Units shown on the scene (before hiding and isolation). */
  sceneUnits: Set<number>;
  /** Surroundings level the view corresponds to (see `ViewModel.levelShown`). */
  level: number | null;
}

export type SelectMode = 'replace' | 'add' | 'toggle' | 'remove';

/**
 * Logical scene state, independent of geometry and rendering. All sets are sets of *units*
 * (structures that own geometry). Precedence rules: isolation restricts the allowed set,
 * `hidden` narrows it further, and selection alone never makes hidden structures visible.
 *
 * What is shown:
 * - `scene`: structures placed on the scene (load all, the eye in the tree, a link, `showStructure`,
 *   and a tree row or a search result that was not shown). Deselecting never takes anything off
 *   the scene;
 * - `level`: `null` (automatic) shows all of the above; a number shows only the selection with
 *   that much of its surroundings (0 = the selection alone, 1 = the nearest groups … last = the
 *   whole body) plus `extra`, the structures shown with the eye meanwhile;
 * - `transparency` (0 = opaque): above 0 everything that is not selected is translucent.
 */
export class ViewModel {
  scene = new Set<number>();
  hidden = new Set<number>();
  isolate: Set<number> | null = null;
  /** Selection order: the last one is the most recent (primary). */
  selected: string[] = [];
  /** Surroundings level chosen by the user; null = automatic. */
  level: number | null = null;
  /** Structures shown with the eye while an explicit level limits the view. */
  extra = new Set<number>();
  /** Transparency of everything that is not selected: 0 = opaque. */
  transparency = 0;

  private ladderKey = '';
  private ladder: readonly SelectionLevel[] = [];

  constructor(readonly index: StructureIndex) {}

  clear(): void {
    this.scene.clear();
    this.hidden.clear();
    this.isolate = null;
    this.selected = [];
    this.level = null;
    this.extra.clear();
    this.transparency = 0;
  }

  /** Canonical IDs; unknown ones are reported back. */
  canonical(ids: Iterable<string>): { ids: string[]; unknown: string[] } {
    const out: string[] = [];
    const unknown: string[] = [];
    for (const id of ids) {
      const c = this.index.canonicalId(id);
      if (c === undefined) unknown.push(id);
      else if (!out.includes(c)) out.push(c);
    }
    return { ids: out, unknown };
  }

  /** Surroundings levels of the current selection (1 … whole body); empty without a selection. */
  levels(): readonly SelectionLevel[] {
    const key = this.selected.join('|');
    if (key !== this.ladderKey) {
      this.ladderKey = key;
      const nodes = this.selected.map((id) => this.index.get(id)).filter((n): n is IndexedStructure => n !== undefined);
      this.ladder = this.index.selectionLadder(nodes);
    }
    return this.ladder;
  }

  /** The explicit level in effect (clamped to the ladder); null when automatic or nothing is selected. */
  get explicitLevel(): number | null {
    if (this.level === null || this.selected.length === 0) return null;
    return Math.max(0, Math.min(this.level, this.levels().length));
  }

  /** Everything shown on the scene, before hiding and isolation (see the class comment). */
  sceneUnits(): Set<number> {
    const level = this.explicitLevel;
    if (level === null) {
      const out = new Set(this.scene);
      for (const u of this.extra) out.add(u);
      return out;
    }
    const out = new Set(this.extra);
    for (const u of this.index.expand(this.selected, 'default').units) out.add(u);
    if (level > 0) for (const u of this.levels()[level - 1]!.units) out.add(u);
    return out;
  }

  /**
   * The level a view corresponds to: the explicit one or, when automatic, the smallest level
   * whose surroundings hold every visible structure besides the selection (0 when only the
   * selection is visible). Null without a selection.
   */
  levelShown(visible: ReadonlySet<number>, selected: ReadonlySet<number> = this.index.expand(this.selected, 'all').units): number | null {
    if (this.selected.length === 0) return null;
    const explicit = this.explicitLevel;
    if (explicit !== null) return explicit;
    const others = [...visible].filter((u) => !selected.has(u));
    if (others.length === 0) return 0;
    const levels = this.levels();
    for (let k = 0; k < levels.length; k++) {
      const units = levels[k]!.units;
      if (others.every((u) => units.has(u))) return k + 1;
    }
    return levels.length;
  }

  isVisible(unit: number, sceneUnits: ReadonlySet<number> = this.sceneUnits()): boolean {
    return sceneUnits.has(unit) && (this.isolate === null || this.isolate.has(unit)) && !this.hidden.has(unit);
  }

  /**
   * Places units on the scene. With `extra`, while an explicit level limits the view, the ones it
   * does not show are shown anyway.
   */
  placeExplicitly(units: readonly number[], extra: boolean): void {
    if (extra && this.explicitLevel !== null) {
      const shown = this.sceneUnits();
      for (const u of units) if (!shown.has(u)) this.extra.add(u);
    }
    for (const u of units) this.scene.add(u);
  }

  /**
   * Changes the selection. A structure and its ancestors or descendants are never selected
   * together: selecting one deselects the others (when a list contains both, the later wins).
   * The scene does not change.
   */
  select(ids: string[], mode: SelectMode): boolean {
    const before = [...this.selected];
    const { ids: canonical } = this.canonical(ids);
    if (mode === 'replace') {
      this.selected = [];
      for (const id of canonical) this.addSelected(id);
    } else if (mode === 'add') for (const id of canonical) this.addSelected(id);
    else if (mode === 'remove') this.selected = this.selected.filter((s) => !canonical.includes(s));
    else {
      for (const id of canonical) {
        if (this.selected.includes(id)) this.selected = this.selected.filter((s) => s !== id);
        else this.addSelected(id);
      }
    }
    return before.join('|') !== this.selected.join('|');
  }

  /** Appends `id` as the most recent selection, dropping it and its ancestors and descendants. */
  private addSelected(id: string) {
    const node = this.index.get(id);
    this.selected = this.selected.filter((s) => {
      if (s === id) return false;
      const other = this.index.get(s);
      return !node || !other || (!this.index.contains(node, other) && !this.index.contains(other, node));
    });
    this.selected.push(id);
  }

  get primary(): string | null {
    return this.selected.length > 0 ? this.selected[this.selected.length - 1]! : null;
  }

  /** Back to the automatic level: everything placed is shown again (the extra structures stay). */
  automaticLevel(): void {
    for (const u of this.extra) this.scene.add(u);
    this.extra.clear();
    this.level = null;
  }

  display(): DisplaySnapshot {
    const modes = new Uint8Array(this.index.structures.length);
    const selectedUnits = this.index.expand(this.selected, 'all').units;
    const sceneUnits = this.sceneUnits();
    const translucent = this.transparency > 0;
    const visibleUnits = new Set<number>();
    let ghostCount = 0;
    for (const u of sceneUnits) {
      if (!this.isVisible(u, sceneUnits)) continue;
      visibleUnits.add(u);
      const opaque = !translucent || selectedUnits.has(u);
      modes[u] = opaque ? MODE_OPAQUE : MODE_GHOST;
      if (!opaque) ghostCount++;
    }
    const level = this.levelShown(visibleUnits, selectedUnits);
    return { modes, selectedUnits, visibleCount: visibleUnits.size, ghostCount, visibleUnits, sceneUnits, level };
  }

  /** Serialises the logical state; lists are compressed to logical parents where possible. */
  toState(data: ViewState['data'], extra: { camera?: ViewState['camera']; lang?: Lang; latin?: boolean }): ViewState {
    const state: ViewState = { v: 2, data, scene: this.index.compress(this.scene, 'default') };
    // What an explicit level does not show counts too: it comes back with another level.
    const known = new Set([...this.scene, ...this.sceneUnits()]);
    const hidden = new Set([...this.hidden].filter((u) => known.has(u)));
    if (hidden.size) state.hidden = this.index.compress(hidden, 'all');
    if (this.isolate) state.isolate = this.index.compress(new Set([...this.isolate].filter((u) => known.has(u))), 'all');
    if (this.selected.length) state.selected = [...this.selected];
    const surroundings = {
      ...(this.level !== null ? { level: this.level } : {}),
      ...(this.extra.size ? { extra: this.index.compress(this.extra, 'default') } : {}),
      ...(this.transparency > 0 ? { transparency: this.transparency } : {}),
    };
    if (Object.keys(surroundings).length) state.surroundings = surroundings;
    if (extra.camera) state.camera = extra.camera;
    if (extra.lang) state.lang = extra.lang;
    if (extra.latin) state.latin = true;
    return state;
  }

  /** Applies a validated state. Returns references that do not exist in this dataset. */
  applyState(state: ViewState): { unknown: string[] } {
    const unknown: string[] = [];
    const take = (refs: string[] | undefined, mode: 'default' | 'all') => {
      const result = this.index.expand(refs ?? [], mode);
      unknown.push(...result.unknown);
      return result.units;
    };
    this.scene = take(state.scene, 'default');
    this.hidden = take(state.hidden, 'all');
    this.isolate = state.isolate ? take(state.isolate, 'all') : null;
    const selected = this.canonical(state.selected ?? []);
    unknown.push(...selected.unknown);
    // Older links may select a parent together with its parts: the later reference wins.
    this.selected = [];
    for (const id of selected.ids) this.addSelected(id);
    this.level = state.surroundings?.level ?? null;
    this.extra = take(state.surroundings?.extra, 'default');
    this.transparency = Math.round((state.surroundings?.transparency ?? 0) * 1000) / 1000;
    return { unknown: [...new Set(unknown)] };
  }
}
