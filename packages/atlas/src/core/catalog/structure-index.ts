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
import type { Manifest, Side, StructureEntry, StructureKind } from '../../schema/index.js';

export interface IndexedStructure {
  readonly id: string;
  /** Position in `manifest.structures`. */
  readonly index: number;
  readonly parent: IndexedStructure | null;
  readonly children: IndexedStructure[];
  readonly system: string;
  readonly kind: StructureKind;
  readonly side: Side | undefined;
  /** Mesh indices of the structure's own geometry. */
  readonly meshes: readonly number[];
  readonly optional: boolean;
  readonly depth: number;
  readonly entry: StructureEntry;
}

/**
 * How a logical parent expands to structures with geometry:
 * - `default`: alternative decompositions (`optional`) below the root are skipped —
 *   used when structures are placed on the scene;
 * - `all`: everything below the root — used for hiding, isolation and highlighting.
 */
export type ExpandMode = 'default' | 'all';

/** One level of the surroundings ladder: an ancestor group, or the whole body (`id: null`). */
export interface SurroundingsLevel {
  readonly id: string | null;
  readonly units: ReadonlySet<number>;
}

/** One level of the surroundings of a selection: a group of each structure, or the whole body (`groups: null`). */
export interface SelectionLevel {
  readonly groups: readonly string[] | null;
  readonly units: ReadonlySet<number>;
}

/**
 * Hierarchy and ID resolution for one dataset. Sets of structures are represented as
 * sets of *units*: indices of structures that own geometry.
 */
export class StructureIndex {
  readonly structures: IndexedStructure[] = [];
  readonly byId = new Map<string, IndexedStructure>();
  readonly aliases: ReadonlyMap<string, string>;
  /** System roots in display order. */
  readonly systems: IndexedStructure[] = [];
  /** mesh index -> owning structure index */
  readonly meshOwner: Int32Array;
  /** mesh index -> chunk index */
  readonly meshChunk: Int32Array;
  /** Structure indices that own geometry. */
  readonly units: readonly number[];

  private subtreeCache = new Map<string, readonly number[]>();
  private ladderCache = new Map<number, readonly SurroundingsLevel[]>();
  private bodyCache: ReadonlySet<number> | null = null;
  private readonly hiddenSystems: ReadonlySet<string>;

  constructor(manifest: Manifest) {
    this.aliases = new Map(Object.entries(manifest.aliases));
    this.hiddenSystems = new Set(manifest.systems.filter((s) => s.hiddenByDefault).map((s) => s.id));
    this.meshOwner = new Int32Array(manifest.meshCount).fill(-1);
    this.meshChunk = new Int32Array(manifest.meshCount).fill(-1);

    const draft = manifest.structures.map((entry, index) => ({
      id: entry.id,
      index,
      parent: null as IndexedStructure | null,
      children: [] as IndexedStructure[],
      system: entry.system,
      kind: entry.kind,
      side: entry.side,
      meshes: entry.meshes ?? [],
      optional: entry.optional === true,
      depth: 0,
      entry,
    }));
    for (const node of draft) this.byId.set(node.id, node);
    for (const node of draft) {
      if (node.entry.parent) {
        const parent = this.byId.get(node.entry.parent) as (typeof draft)[number] | undefined;
        if (parent) {
          node.parent = parent;
          parent.children.push(node);
        }
      }
      for (const mesh of node.meshes) this.meshOwner[mesh] = node.index;
    }
    const setDepth = (node: (typeof draft)[number], depth: number) => {
      node.depth = depth;
      for (const child of node.children) setDepth(child as (typeof draft)[number], depth + 1);
    };
    const order = new Map(manifest.systems.map((s) => [s.id, s.order]));
    for (const node of draft) {
      if (node.parent === null) {
        setDepth(node, 0);
        this.systems.push(node);
      }
    }
    this.systems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    this.structures.push(...draft);
    manifest.chunks.forEach((chunk, chunkIndex) => {
      for (let i = chunk.meshStart; i < chunk.meshStart + chunk.meshCount; i++) this.meshChunk[i] = chunkIndex;
    });
    this.units = draft.filter((n) => n.meshes.length > 0).map((n) => n.index);
  }

  /** Current ID for an ID or a renamed (aliased) ID. */
  canonicalId(id: string): string | undefined {
    if (this.byId.has(id)) return id;
    const target = this.aliases.get(id);
    return target && this.byId.has(target) ? target : undefined;
  }

  get(id: string): IndexedStructure | undefined {
    const canonical = this.canonicalId(id);
    return canonical === undefined ? undefined : this.byId.get(canonical);
  }

  hasGeometry(node: IndexedStructure, mode: ExpandMode = 'all'): boolean {
    return this.subtreeUnits(node, mode).length > 0;
  }

  /** Units (structure indices with geometry) of a subtree. Cached, because trees are immutable. */
  subtreeUnits(node: IndexedStructure, mode: ExpandMode): readonly number[] {
    const key = `${mode}:${node.index}`;
    const cached = this.subtreeCache.get(key);
    if (cached) return cached;
    const out: number[] = [];
    const walk = (n: IndexedStructure, isRoot: boolean) => {
      if (!isRoot && mode === 'default' && n.optional) return;
      if (n.meshes.length > 0) out.push(n.index);
      for (const child of n.children) walk(child, false);
    };
    walk(node, true);
    this.subtreeCache.set(key, out);
    return out;
  }

  /**
   * Expands references (`id` or `=id`) into units. Unknown references are returned separately
   * so callers can report them instead of silently dropping them.
   */
  expand(refs: Iterable<string>, mode: ExpandMode): { units: Set<number>; unknown: string[] } {
    const units = new Set<number>();
    const unknown: string[] = [];
    for (const ref of refs) {
      const own = ref.startsWith('=');
      const node = this.get(own ? ref.slice(1) : ref);
      if (!node) {
        unknown.push(ref);
        continue;
      }
      if (own) {
        if (node.meshes.length > 0) units.add(node.index);
      } else {
        for (const u of this.subtreeUnits(node, mode)) units.add(u);
      }
    }
    return { units, unknown };
  }

  /**
   * Inverse of `expand`: a short reference list (top-down) whose expansion equals `units`.
   * `expand(compress(S, m), m)` always equals `S`, which keeps `setState(getState())` stable.
   * In `default` mode every optional node starts its own region, because an ancestor's
   * reference does not cover it.
   */
  compress(units: ReadonlySet<number>, mode: ExpandMode): string[] {
    const out: string[] = [];
    if (units.size === 0) return out;
    const visit = (node: IndexedStructure) => {
      const sub = this.subtreeUnits(node, mode);
      let covered = 0;
      for (const u of sub) if (units.has(u)) covered++;
      if (covered === 0) return;
      if (covered === sub.length) {
        out.push(node.id);
        return;
      }
      if (node.meshes.length > 0 && units.has(node.index)) out.push(`=${node.id}`);
      for (const child of node.children) {
        if (mode === 'default' && child.optional) continue;
        visit(child);
      }
    };
    const roots = mode === 'default' ? this.regionRoots() : this.systems;
    for (const root of roots) visit(root);
    return out;
  }

  private regionRootsCache: IndexedStructure[] | null = null;

  /** System roots followed by every optional node, in hierarchy order. */
  private regionRoots(): IndexedStructure[] {
    if (this.regionRootsCache) return this.regionRootsCache;
    const out: IndexedStructure[] = [];
    const walk = (n: IndexedStructure) => {
      if (n.parent === null || n.optional) out.push(n);
      for (const child of n.children) walk(child);
    };
    for (const root of this.systems) walk(root);
    this.regionRootsCache = out;
    return out;
  }

  ancestors(node: IndexedStructure): IndexedStructure[] {
    const out: IndexedStructure[] = [];
    let cur = node.parent;
    while (cur) {
      out.push(cur);
      cur = cur.parent;
    }
    return out;
  }

  /** True when `ancestor` is `node` or one of its ancestors. */
  contains(ancestor: IndexedStructure, node: IndexedStructure): boolean {
    let cur: IndexedStructure | null = node;
    while (cur) {
      if (cur === ancestor) return true;
      cur = cur.parent;
    }
    return false;
  }

  /** Chunk indices that hold the geometry of the given units. */
  chunksFor(units: Iterable<number>): Set<number> {
    const out = new Set<number>();
    for (const u of units) {
      for (const mesh of this.structures[u]!.meshes) {
        const chunk = this.meshChunk[mesh]!;
        if (chunk >= 0) out.add(chunk);
      }
    }
    return out;
  }

  /** All units of the dataset in default expansion (what "load all" places on the scene). */
  allDefaultUnits(): Set<number> {
    const out = new Set<number>();
    for (const root of this.systems) for (const u of this.subtreeUnits(root, 'default')) out.add(u);
    return out;
  }

  /** True for structures of a system that is hidden by default (e.g. muscle attachments). */
  inHiddenSystem(node: IndexedStructure): boolean {
    return this.hiddenSystems.has(node.system);
  }

  /** The whole body as shown by default: every system except those hidden by default. */
  bodyUnits(): ReadonlySet<number> {
    if (this.bodyCache) return this.bodyCache;
    const out = new Set<number>();
    for (const root of this.systems) {
      if (this.hiddenSystems.has(root.id)) continue;
      for (const u of this.subtreeUnits(root, 'default')) out.add(u);
    }
    this.bodyCache = out;
    return out;
  }

  /**
   * Surroundings levels of a structure, nearest first: its parent group, the next ancestors up to
   * the system, then the whole body. Ancestors that add no structure to the previous level are
   * skipped, so every step changes what is shown.
   */
  surroundingsLadder(node: IndexedStructure): readonly SurroundingsLevel[] {
    const cached = this.ladderCache.get(node.index);
    if (cached) return cached;
    const levels: SurroundingsLevel[] = [];
    let size = this.subtreeUnits(node, 'default').length;
    for (const ancestor of this.ancestors(node)) {
      const units = this.subtreeUnits(ancestor, 'default');
      if (units.length <= size) continue;
      levels.push({ id: ancestor.id, units: new Set(units) });
      size = units.length;
    }
    const body = this.bodyUnits();
    const last = levels[levels.length - 1];
    if (!last || body.size > last.units.size || [...body].some((u) => !last.units.has(u))) levels.push({ id: null, units: body });
    this.ladderCache.set(node.index, levels);
    return levels;
  }

  /**
   * Surroundings levels of several structures: level k joins the k-th group of every structure's
   * own ladder (a structure with a shorter ladder keeps its top group), and the last level is the
   * whole body. Levels that add nothing to the previous one are skipped.
   */
  selectionLadder(nodes: readonly IndexedStructure[]): readonly SelectionLevel[] {
    if (nodes.length === 0) return [];
    const ladders = nodes.map((node) => this.surroundingsLadder(node).filter((level) => level.id !== null));
    const depth = Math.max(0, ...ladders.map((ladder) => ladder.length));
    const levels: SelectionLevel[] = [];
    for (let k = 0; k < depth; k++) {
      const groups: string[] = [];
      const units = new Set<number>();
      for (const ladder of ladders) {
        const step = ladder[Math.min(k, ladder.length - 1)];
        if (!step) continue;
        if (!groups.includes(step.id!)) groups.push(step.id!);
        for (const u of step.units) units.add(u);
      }
      const previous = levels[levels.length - 1];
      if (units.size === 0 || (previous && units.size <= previous.units.size)) continue;
      levels.push({ groups, units });
    }
    const body = this.bodyUnits();
    const last = levels[levels.length - 1];
    if (!last || [...body].some((u) => !last.units.has(u))) levels.push({ groups: null, units: body });
    return levels;
  }
}
