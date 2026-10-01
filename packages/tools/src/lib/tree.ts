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
import type { ExportFile, ExportObject } from './export-data.js';
import { parseSourceName, slugify, suffixFor, type IdRegistry, type ParsedName } from './ids.js';

export interface SystemConfig {
  collection: string;
  id: string;
  order: number;
  loadPriority: number;
  color: string;
  hiddenByDefault?: boolean;
  name?: { en?: string; uk?: string };
}

export interface LicenseRule {
  asset: string;
  system?: string;
  names?: string[];
  subtreeOf?: string[];
  underGroup?: string | string[];
}

export interface OptionalRule {
  system: string;
  childrenOf: string;
  reason?: string;
}

export type NodeKind = 'system' | 'group' | 'structure';

export interface SourceNode {
  key: string;
  kind: NodeKind;
  collection: string;
  system: SystemConfig;
  /** Name in the source file (null for synthetic groups). */
  sourceName: string | null;
  parsed: ParsedName;
  englishName: string;
  /** Base name used for term lookups (null when names must not be looked up, e.g. attachments). */
  termKey: string | null;
  /**
   * Muscle attachment patch (`origin` / `insertion`, optionally numbered) or the group of one
   * muscle's patches (`group`): translations are composed from the muscle's name.
   */
  attachmentOf?: { base: string; kind: 'origin' | 'insertion' | 'group'; index?: number };
  object?: ExportObject;
  /** Added with models from other sources (external_meshes.py): named by the atlas editors. */
  external?: boolean;
  parent: SourceNode | null;
  children: SourceNode[];
  /** Licence record of the geometry (after rules). */
  asset?: string;
  optional?: boolean;
  id: string;
}

export interface TreeResult {
  roots: SourceNode[];
  nodes: SourceNode[];
  prunedGroups: string[];
  skippedAnchors: string[];
  byCollectionName: Map<string, SourceNode>;
}

const attachmentLabel = (p: ParsedName) =>
  p.attachment ? `${p.attachment.kind}${p.attachment.index !== undefined ? ` ${p.attachment.index}` : ''}` : '';

/**
 * Builds the logical hierarchy of each system collection from the Blender parent chains:
 * the logical parent of a node is its nearest ancestor that belongs to the same collection
 * (a group label or a geometry object). Cross-collection parents (e.g. muscle attachment
 * patches parented to bones) are skipped; attachment patches are grouped per muscle.
 */
export function buildTree(
  exp: ExportFile,
  systems: SystemConfig[],
  licenceRules: LicenseRule[],
  defaultAsset: string,
  optionalRules: OptionalRule[],
  registry: IdRegistry,
): TreeResult {
  const roots: SourceNode[] = [];
  const nodes: SourceNode[] = [];
  const prunedGroups: string[] = [];
  const skippedAnchors: string[] = [];
  const byCollectionName = new Map<string, SourceNode>();

  for (const system of [...systems].sort((a, b) => a.order - b.order)) {
    const collection = system.collection;
    const local = new Map<string, SourceNode>();
    const parents = new Map<SourceNode, string[]>();
    const make = (kind: NodeKind, name: string | null, parsed: ParsedName, extra: Partial<SourceNode> = {}): SourceNode => ({
      key: `${collection}|${kind === 'structure' ? 'object' : name === null ? 'synthetic' : 'group'}|${name ?? parsed.base}`,
      kind,
      collection,
      system,
      sourceName: name,
      parsed,
      englishName: parsed.base,
      termKey: parsed.base,
      parent: null,
      children: [],
      id: '',
      ...extra,
    });

    for (const group of exp.groups.filter((g) => g.system === collection)) {
      const node = make('group', group.name, parseSourceName(group.name), group.external ? { external: true } : {});
      local.set(group.name, node);
      parents.set(node, group.parents);
    }
    for (const object of exp.objects.filter((o) => o.system === collection)) {
      // ".j" objects are label anchors (lines/points), not anatomy.
      if (object.name.endsWith('.j')) {
        skippedAnchors.push(object.name);
        continue;
      }
      const parsed = parseSourceName(object.name);
      const node = make('structure', object.name, parsed, { object, ...(object.external ? { external: true } : {}) });
      if (object.external?.en) {
        node.englishName = object.external.en;
        node.termKey = object.external.en;
      }
      if (parsed.attachment) {
        node.englishName = `${parsed.base} (${attachmentLabel(parsed)})`;
        node.termKey = null;
        node.attachmentOf = {
          base: parsed.base,
          kind: parsed.attachment.kind,
          ...(parsed.attachment.index !== undefined ? { index: parsed.attachment.index } : {}),
        };
      }
      if (local.has(object.name)) throw new Error(`Name used by a group and an object: ${object.name}`);
      local.set(object.name, node);
      parents.set(node, object.parents);
    }

    // Logical parents within the collection.
    const localRoots: SourceNode[] = [];
    for (const node of local.values()) {
      const chain = parents.get(node) ?? [];
      const parentName = chain.find((n) => local.has(n));
      if (parentName) {
        const parent = local.get(parentName)!;
        node.parent = parent;
        parent.children.push(node);
      } else {
        localRoots.push(node);
      }
    }

    // Muscle attachment patches without a same-collection parent are grouped per muscle.
    const attachmentGroups = new Map<string, SourceNode>();
    for (const node of [...localRoots]) {
      if (!node.parsed.attachment) continue;
      let group = attachmentGroups.get(node.parsed.base);
      if (!group) {
        group = make('group', null, { base: node.parsed.base });
        group.englishName = `${node.parsed.base} (attachments)`;
        group.termKey = null;
        group.attachmentOf = { base: node.parsed.base, kind: 'group' };
        attachmentGroups.set(node.parsed.base, group);
        localRoots.push(group);
      }
      node.parent = group;
      group.children.push(node);
      localRoots.splice(localRoots.indexOf(node), 1);
    }

    // System root: the collection's single root label, or the root named like the system.
    let root: SourceNode;
    const title = collection.replace(/^\d+:\s*/, '').toLowerCase();
    const named = localRoots.find((r) => r.kind === 'group' && r.parsed.base.toLowerCase() === title);
    if (localRoots.length === 1 && localRoots[0]!.kind === 'group') root = localRoots[0]!;
    else if (named) root = named;
    else {
      root = make('group', null, { base: system.name?.en ?? collection.replace(/^\d+:\s*/, '') });
      root.key = `${collection}|system`;
      root.termKey = root.parsed.base;
    }
    root.kind = 'system';
    if (system.name?.en) root.englishName = system.name.en;
    for (const r of localRoots) {
      if (r === root) continue;
      r.parent = root;
      root.children.push(r);
    }

    // Licence rules (last matching rule wins).
    const chainOf = (node: SourceNode) => parents.get(node) ?? [];
    for (const node of local.values()) {
      if (!node.object) continue;
      let asset = defaultAsset;
      for (const rule of licenceRules) {
        if (rule.system && rule.system !== collection) continue;
        const chain = chainOf(node);
        const groups = Array.isArray(rule.underGroup) ? rule.underGroup : rule.underGroup ? [rule.underGroup] : [];
        const hit =
          rule.names?.includes(node.sourceName!) ||
          rule.subtreeOf?.some((n) => n === node.sourceName || chain.includes(n)) ||
          groups.some((g) => chain.includes(g));
        if (hit) asset = rule.asset;
      }
      // A model from another source names its own licence record.
      node.asset = node.object.external?.asset ?? asset;
    }

    for (const rule of optionalRules.filter((r) => r.system === collection)) {
      const target = local.get(rule.childrenOf);
      if (!target) throw new Error(`Optional rule target not found: ${rule.childrenOf}`);
      for (const child of target.children) child.optional = true;
    }

    // Drop label groups without any geometry below them (they only carry text labels).
    const hasObjects = (node: SourceNode): boolean => Boolean(node.object) || node.children.some(hasObjects);
    const prune = (node: SourceNode) => {
      node.children = node.children.filter((child) => {
        if (hasObjects(child)) return true;
        if (child.sourceName) prunedGroups.push(`${collection}: ${child.sourceName}`);
        return false;
      });
      node.children.sort(compareNodes);
      node.children.forEach(prune);
    };
    prune(root);

    // Stable IDs in deterministic depth-first order.
    const assign = (node: SourceNode) => {
      node.id =
        node.kind === 'system'
          ? registry.assign(node.key, system.id)
          : registry.assign(node.key, `${system.id}.${slugify(node.parsed.base) || 'unnamed'}${suffixFor(node.parsed)}`);
      nodes.push(node);
      if (node.sourceName) byCollectionName.set(`${collection}|${node.sourceName}`, node);
      node.children.forEach(assign);
    };
    assign(root);
    byCollectionName.set(`${collection}|*`, root);
    roots.push(root);
  }
  return { roots, nodes, prunedGroups, skippedAnchors, byCollectionName };
}

function compareNodes(a: SourceNode, b: SourceNode): number {
  const an = a.parsed.base.toLowerCase();
  const bn = b.parsed.base.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  const order = (n: SourceNode) => `${n.parsed.attachment?.kind ?? ''}${n.parsed.attachment?.index ?? ''}${n.parsed.side ?? ''}`;
  const ao = order(a);
  const bo = order(b);
  return ao < bo ? -1 : ao > bo ? 1 : 0;
}

export function walk(node: SourceNode, visit: (n: SourceNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}
