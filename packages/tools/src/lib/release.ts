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
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  MANIFEST_SCHEMA_VERSION,
  ManifestSchema,
  canonicalJson,
  type AssetEntry,
  type ChunkEntry,
  type Dictionary,
  type DictionaryEntry,
  type FileRef,
  type IssueEntry,
  type Lang,
  type LocalizedText,
  type Manifest,
  type MaterialEntry,
  type Review,
  type StructureEntry,
  type SystemEntry,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import type { CoverageCorrection } from './geometry-fixes.js';
import { bounds, triangleCount, type MeshData } from './geometry.js';
import { writeChunkGlb } from './glb-writer.js';
import { ensureDir, log, sha256, writeBytes, writeJson } from './io.js';
import { chunkContent } from './reuse.js';

export interface ReleaseNode {
  id: string;
  parent: string | null;
  system: string;
  kind: StructureEntry['kind'];
  side?: StructureEntry['side'];
  optional?: boolean;
  asset?: string;
  gap?: StructureEntry['gap'];
  review: Review;
  issues?: string[];
  sourceObject?: string;
  geometry?: { standard: MeshData; economy: MeshData };
  /** Chunk grouping hint: nodes with the same label are packed together when possible. */
}

export interface ReleaseInput {
  outDir: string;
  model: string;
  version: string;
  channel: Manifest['channel'];
  title: LocalizedText;
  generator: { name: string; version: string };
  generatedAt: string;
  source?: Manifest['source'];
  systems: SystemEntry[];
  nodes: ReleaseNode[];
  palette: MaterialEntry[];
  assets: Omit<AssetEntry, 'included'>[];
  /** Assets whose records are always listed as included (e.g. terminology), even without geometry. */
  nonGeometryAssets: string[];
  aliases: Record<string, string>;
  issues: IssueEntry[];
  names: Record<Lang, Map<string, DictionaryEntry>>;
  notices: Manifest['notices'];
  chunking: { targetTriangles: number; maxTriangles: number };
  coverageNotes: string[];
  excludedSummary: { reason: string; count: number }[];
  /** Declared corrections of the source geometry, listed in the coverage report. */
  corrections?: CoverageCorrection[];
  /**
   * A previous release: a chunk file whose decoded content is the same as the new one is copied
   * byte for byte, so unchanged chunks keep their files (and checksums) across versions.
   */
  previous?: string;
}

export interface ReleaseSummary {
  structures: number;
  meshes: number;
  chunks: number;
  triangles: { standard: number; economy: number };
  bytes: { standard: number; economy: number; metadata: number };
}

interface PlannedChunk {
  id: string;
  system: string;
  nodes: ReleaseNode[];
  triangles: number;
}

/**
 * Packs geometry into disjoint chunks per system. A subtree small enough for one chunk stays
 * together (an organ does not need the whole system's file); larger subtrees are split along
 * the hierarchy and neighbouring small pieces are packed in depth-first order.
 */
export function planChunks(input: ReleaseInput): PlannedChunk[] {
  const children = new Map<string, ReleaseNode[]>();
  for (const node of input.nodes) {
    if (node.parent) {
      const list = children.get(node.parent) ?? [];
      list.push(node);
      children.set(node.parent, list);
    }
  }
  const trisOf = (n: ReleaseNode) => (n.geometry ? triangleCount(n.geometry.standard) : 0);
  const subtreeTris = new Map<string, number>();
  const total = (n: ReleaseNode): number => {
    const cached = subtreeTris.get(n.id);
    if (cached !== undefined) return cached;
    let sum = trisOf(n);
    for (const c of children.get(n.id) ?? []) sum += total(c);
    subtreeTris.set(n.id, sum);
    return sum;
  };
  const collect = (n: ReleaseNode, out: ReleaseNode[]) => {
    if (n.geometry) out.push(n);
    for (const c of children.get(n.id) ?? []) collect(c, out);
  };
  const pieces = (n: ReleaseNode): { label: string; nodes: ReleaseNode[]; tris: number }[] => {
    if (total(n) === 0) return [];
    if (total(n) <= input.chunking.maxTriangles) {
      const list: ReleaseNode[] = [];
      collect(n, list);
      return [{ label: n.id, nodes: list, tris: total(n) }];
    }
    const out: { label: string; nodes: ReleaseNode[]; tris: number }[] = [];
    if (n.geometry) out.push({ label: n.id, nodes: [n], tris: trisOf(n) });
    for (const c of children.get(n.id) ?? []) out.push(...pieces(c));
    return out;
  };

  const parentOf = new Map(input.nodes.map((n) => [n.id, n.parent]));
  const ancestors = (id: string) => {
    const out: string[] = [];
    for (let cur: string | null | undefined = id; cur; cur = parentOf.get(cur)) out.push(cur);
    return out;
  };
  /** Lowest common ancestor of the piece labels; names the chunk after what it contains. */
  const commonAncestor = (labels: string[]) => {
    let common = ancestors(labels[0]!);
    for (const label of labels.slice(1)) {
      const set = new Set(ancestors(label));
      common = common.filter((a) => set.has(a));
    }
    return common[0]!;
  };

  const chunks: PlannedChunk[] = [];
  for (const system of [...input.systems].sort((a, b) => a.loadPriority - b.loadPriority)) {
    const root = input.nodes.find((n) => n.id === system.id);
    if (!root) continue;
    const used = new Map<string, number>();
    let current: { labels: string[]; nodes: ReleaseNode[]; tris: number } | null = null;
    const slug = (id: string) => (id === system.id ? 'root' : id.slice(system.id.length + 1).replace(/\./g, '_'));
    const flush = () => {
      if (!current || current.nodes.length === 0) return;
      const lca = commonAncestor(current.labels);
      let base = slug(lca);
      if (lca === system.id && current.labels.length > 1) {
        base = `${slug(current.labels[0]!).slice(0, 40)}--${slug(current.labels[current.labels.length - 1]!).slice(0, 40)}`;
      }
      const short = base.length > 90 ? base.slice(0, 90) : base;
      const n = (used.get(short) ?? 0) + 1;
      used.set(short, n);
      chunks.push({ id: `${system.id}.${short}${n > 1 ? `.${n}` : ''}`, system: system.id, nodes: current.nodes, triangles: current.tris });
      current = null;
    };
    for (const piece of pieces(root)) {
      if (current && current.tris + piece.tris > input.chunking.targetTriangles) flush();
      if (!current) current = { labels: [], nodes: [], tris: 0 };
      current.labels.push(piece.label);
      current.nodes.push(...piece.nodes);
      current.tris += piece.tris;
    }
    flush();
  }
  return chunks;
}

function canonicalHash(manifest: Omit<Manifest, 'contentHash'>): string {
  return sha256(canonicalJson(manifest));
}

export async function writeRelease(input: ReleaseInput): Promise<ReleaseSummary> {
  rmSync(input.outDir, { recursive: true, force: true });
  ensureDir(input.outDir);
  const files: { path: string; bytes: Buffer }[] = [];
  const put = (path: string, bytes: Buffer) => {
    files.push({ path, bytes });
    return { path, bytes: bytes.byteLength, sha256: sha256(bytes) } satisfies FileRef;
  };

  // 1. Chunks and mesh indices.
  const planned = planChunks(input);
  const meshIndexOf = new Map<string, number>();
  let meshCount = 0;
  for (const chunk of planned) for (const node of chunk.nodes) meshIndexOf.set(node.id, meshCount++);

  const chunkEntries: ChunkEntry[] = [];
  const summary: ReleaseSummary = {
    structures: input.nodes.length,
    meshes: meshCount,
    chunks: planned.length,
    triangles: { standard: 0, economy: 0 },
    bytes: { standard: 0, economy: 0, metadata: 0 },
  };
  const systemPriority = new Map(input.systems.map((s) => [s.id, s.loadPriority]));
  let reused = 0;
  let bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const [ci, chunk] of planned.entries()) {
    const meshStart = meshIndexOf.get(chunk.nodes[0]!.id)!;
    const fileRefs = {} as ChunkEntry['files'];
    for (const quality of ['standard', 'economy'] as const) {
      const written = await writeChunkGlb(
        chunk.id,
        chunk.nodes.map((n) => ({ meshIndex: meshIndexOf.get(n.id)!, mesh: n.geometry![quality] })),
        { chunk: chunk.id, meshStart, meshCount: chunk.nodes.length, quality },
      );
      const path = `${quality}/${chunk.system}/${chunk.id.slice(chunk.system.length + 1)}.glb`;
      let bytes: Uint8Array = written.bytes;
      const previous = input.previous ? join(input.previous, path) : null;
      if (previous && existsSync(previous)) {
        const old = readFileSync(previous);
        if ((await chunkContent(old)) === (await chunkContent(written.bytes))) {
          bytes = old;
          reused++;
        }
      }
      const buffer = writeBytes(join(input.outDir, path), bytes);
      const ref = put(path, buffer);
      fileRefs[quality] = { ...ref, triangles: written.triangles, vertices: written.vertices };
      summary.triangles[quality] += written.triangles;
      summary.bytes[quality] += ref.bytes;
    }
    for (const n of chunk.nodes) {
      const b = bounds(n.geometry!.standard.positions);
      bboxMin = [Math.min(bboxMin[0], b.min[0]), Math.min(bboxMin[1], b.min[1]), Math.min(bboxMin[2], b.min[2])];
      bboxMax = [Math.max(bboxMax[0], b.max[0]), Math.max(bboxMax[1], b.max[1]), Math.max(bboxMax[2], b.max[2])];
    }
    chunkEntries.push({
      id: chunk.id,
      system: chunk.system,
      meshStart,
      meshCount: chunk.nodes.length,
      priority: (systemPriority.get(chunk.system) ?? 50) * 10 + Math.min(9, Math.floor((ci / Math.max(planned.length, 1)) * 10)),
      files: fileRefs,
    });
    if ((ci + 1) % 25 === 0) log(`  chunks written: ${ci + 1}/${planned.length}`);
  }

  if (input.previous) log(`  chunk files kept from ${input.previous}: ${reused} of ${planned.length * 2}`);

  // 2. Dictionaries.
  const dictionaries: Manifest['dictionaries'] = {};
  const languages: Lang[] = ['uk', 'la', 'en'];
  for (const lang of languages) {
    const entries: Record<string, DictionaryEntry> = {};
    const missing: string[] = [];
    for (const node of input.nodes) {
      const entry = input.names[lang].get(node.id);
      if (entry) entries[node.id] = entry;
      else missing.push(node.id);
    }
    const dict: Dictionary = { schemaVersion: 1, lang, model: input.model, version: input.version, entries, missing };
    const buffer = writeJson(join(input.outDir, `names/${lang}.json`), dict, true);
    dictionaries[lang] = put(`names/${lang}.json`, buffer);
    summary.bytes.metadata += buffer.byteLength;
  }

  // 3. Structures and assets.
  const usedAssets = new Set<string>(input.nonGeometryAssets);
  const structures: StructureEntry[] = input.nodes.map((n) => {
    const mesh = meshIndexOf.get(n.id);
    if (mesh !== undefined && n.asset) usedAssets.add(n.asset);
    const entry: StructureEntry = {
      id: n.id,
      parent: n.parent,
      system: n.system,
      kind: n.kind,
      review: n.review,
    };
    if (n.side) entry.side = n.side;
    if (mesh !== undefined) entry.meshes = [mesh];
    if (n.optional) entry.optional = true;
    if (mesh !== undefined && n.asset) entry.asset = n.asset;
    if (n.gap) entry.gap = n.gap;
    if (n.issues?.length) entry.issues = n.issues;
    if (n.sourceObject) entry.source = { object: n.sourceObject };
    return entry;
  });
  const assets: AssetEntry[] = input.assets.map((a) => ({ ...a, included: usedAssets.has(a.id) }));

  // 4. Reports.
  const coverage = buildCoverage(input, structures, chunkEntries, summary, assets);
  const coverageRef = put('reports/coverage.json', writeJson(join(input.outDir, 'reports/coverage.json'), coverage));
  writeBytes(join(input.outDir, 'reports/COVERAGE.md'), coverageMarkdown(coverage));
  files.push({ path: 'reports/COVERAGE.md', bytes: Buffer.from(coverageMarkdown(coverage)) });
  const attributionText = attributionMarkdown(input, assets);
  const attributionRef = put('ATTRIBUTION.md', writeBytes(join(input.outDir, 'ATTRIBUTION.md'), attributionText));
  const licensesText = licensesMarkdown(assets);
  const licensesRef = put('LICENSES.md', writeBytes(join(input.outDir, 'LICENSES.md'), licensesText));

  // 5. Manifest.
  const manifestBody: Omit<Manifest, 'contentHash'> = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    model: input.model,
    version: input.version,
    channel: input.channel,
    title: input.title,
    generatedAt: input.generatedAt,
    generator: input.generator,
    coordinates: { up: '+Y', front: '+Z', units: 'm', origin: 'floor-between-heels' },
    bounds: { min: bboxMin.map(round6) as never, max: bboxMax.map(round6) as never },
    ...(input.source ? { source: input.source } : {}),
    languages,
    dictionaries,
    systems: input.systems,
    structures,
    meshCount,
    chunks: chunkEntries,
    materials: input.palette,
    aliases: input.aliases,
    issues: input.issues,
    assets,
    notices: input.notices,
    reports: { coverage: coverageRef, attribution: attributionRef, licenses: licensesRef },
  };
  const manifest = { ...manifestBody, contentHash: canonicalHash(manifestBody) } as Manifest;
  const checked = ManifestSchema.safeParse(manifest);
  if (!checked.success) {
    throw new Error(`Generated manifest is invalid:\n${checked.error.issues.slice(0, 20).map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  const manifestBuffer = writeJson(join(input.outDir, 'manifest.json'), manifest, true);
  files.push({ path: 'manifest.json', bytes: manifestBuffer });
  summary.bytes.metadata += manifestBuffer.byteLength;

  // 6. Checksums of every file of the release.
  const sums = files
    .map((f) => `${sha256(f.bytes)}  ${f.path}`)
    .sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1))
    .join('\n');
  writeBytes(join(input.outDir, 'SHA256SUMS'), `${sums}\n`);
  log(`release written to ${relative(process.cwd(), input.outDir) || input.outDir}`);
  return summary;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export interface CoverageReport {
  model: string;
  version: string;
  channel: string;
  systems: {
    id: string;
    structures: number;
    withGeometry: number;
    gaps: number;
    trianglesStandard: number;
    trianglesEconomy: number;
  }[];
  totals: {
    structures: number;
    withGeometry: number;
    gaps: number;
    groupsWithoutGeometry: number;
    chunks: number;
    triangles: { standard: number; economy: number };
    bytes: ReleaseSummary['bytes'];
  };
  /** `machine`: drafts prepared with machine assistance (a subset of `drafts`). */
  names: Record<Lang, { present: number; reviewed: number; drafts: number; machine: number; missing: number }>;
  review: { anatomyReviewed: number; anatomyUnreviewed: number; needsCorrection: number };
  gaps: { id: string; reason: string; asset?: string }[];
  excludedAssets: { id: string; title: string; license: string; reason: string }[];
  excludedSource: { reason: string; count: number }[];
  notes: string[];
  corrections?: CoverageCorrection[];
}

function buildCoverage(
  input: ReleaseInput,
  structures: StructureEntry[],
  chunks: ChunkEntry[],
  summary: ReleaseSummary,
  assets: AssetEntry[],
): CoverageReport {
  const tris = new Map<number, { standard: number; economy: number }>();
  const entryById = new Map(structures.map((s) => [s.id, s]));
  for (const node of input.nodes) {
    const entry = entryById.get(node.id);
    if (entry?.meshes?.length && node.geometry) {
      tris.set(entry.meshes[0]!, {
        standard: triangleCount(node.geometry.standard),
        economy: triangleCount(node.geometry.economy),
      });
    }
  }
  const systems = input.systems.map((system) => {
    const list = structures.filter((s) => s.system === system.id);
    let standard = 0;
    let economy = 0;
    for (const s of list) {
      for (const m of s.meshes ?? []) {
        standard += tris.get(m)?.standard ?? 0;
        economy += tris.get(m)?.economy ?? 0;
      }
    }
    return {
      id: system.id,
      structures: list.length,
      withGeometry: list.filter((s) => (s.meshes?.length ?? 0) > 0).length,
      gaps: list.filter((s) => s.gap).length,
      trianglesStandard: standard,
      trianglesEconomy: economy,
    };
  });
  const names = {} as CoverageReport['names'];
  for (const lang of ['uk', 'la', 'en'] as const) {
    const map = input.names[lang];
    let reviewed = 0;
    let drafts = 0;
    let machine = 0;
    for (const e of map.values()) {
      if (e.status === 'reviewed') reviewed++;
      if (e.origin === 'draft') drafts++;
      if (e.origin === 'draft' && e.source?.includes('machine-assisted')) machine++;
    }
    names[lang] = { present: map.size, reviewed, drafts, machine, missing: structures.length - map.size };
  }
  const withGeometryBelow = geometryBelow(structures);
  const groupsWithoutGeometry = structures.filter((s) => s.kind !== 'structure' && !withGeometryBelow.has(s.id)).length;
  return {
    model: input.model,
    version: input.version,
    channel: input.channel,
    systems,
    totals: {
      structures: structures.length,
      withGeometry: structures.filter((s) => (s.meshes?.length ?? 0) > 0).length,
      gaps: structures.filter((s) => s.gap).length,
      groupsWithoutGeometry,
      chunks: chunks.length,
      triangles: summary.triangles,
      bytes: summary.bytes,
    },
    names,
    review: {
      anatomyReviewed: structures.filter((s) => s.review.status === 'reviewed').length,
      anatomyUnreviewed: structures.filter((s) => s.review.status === 'unreviewed').length,
      needsCorrection: structures.filter((s) => s.review.status === 'needs-correction').length,
    },
    gaps: structures.filter((s) => s.gap).map((s) => ({ id: s.id, reason: s.gap!.reason, ...(s.gap!.asset ? { asset: s.gap!.asset } : {}) })),
    excludedAssets: assets
      .filter((a) => !a.included)
      .map((a) => ({ id: a.id, title: a.title, license: a.license.id, reason: a.permissionBasis })),
    excludedSource: input.excludedSummary,
    notes: input.coverageNotes,
    ...(input.corrections?.length ? { corrections: input.corrections } : {}),
  };
}

/** IDs of structures that have geometry in their subtree (excluding their own). */
function geometryBelow(structures: StructureEntry[]): Set<string> {
  const byId = new Map(structures.map((s) => [s.id, s]));
  const out = new Set<string>();
  for (const s of structures) {
    if (!(s.meshes?.length ?? 0)) continue;
    let parent = s.parent;
    while (parent && !out.has(parent)) {
      out.add(parent);
      parent = byId.get(parent)?.parent ?? null;
    }
  }
  return out;
}

function coverageMarkdown(c: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`# Coverage report — ${c.model} ${c.version} (${c.channel})`, '');
  lines.push(
    'The dataset is a general-coverage adult male model built from the pinned source snapshot.',
    'Presence of an organ does not imply that all of its internal components are modelled.',
    '',
  );
  lines.push('## Systems', '', '| System | Structures | With geometry | Gaps | Triangles (standard) | Triangles (economy) |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const s of c.systems) {
    lines.push(`| ${s.id} | ${s.structures} | ${s.withGeometry} | ${s.gaps} | ${s.trianglesStandard.toLocaleString('en')} | ${s.trianglesEconomy.toLocaleString('en')} |`);
  }
  lines.push('', '## Totals', '');
  lines.push(`- Structures: ${c.totals.structures} (with geometry: ${c.totals.withGeometry}, declared gaps: ${c.totals.gaps})`);
  lines.push(`- Chunks: ${c.totals.chunks}`);
  lines.push(`- Triangles: standard ${c.totals.triangles.standard.toLocaleString('en')}, economy ${c.totals.triangles.economy.toLocaleString('en')}`);
  lines.push(`- Size: standard ${(c.totals.bytes.standard / 1e6).toFixed(1)} MB, economy ${(c.totals.bytes.economy / 1e6).toFixed(1)} MB, metadata ${(c.totals.bytes.metadata / 1e6).toFixed(2)} MB`);
  lines.push(
    '',
    '## Names',
    '',
    '| Language | Present | Reviewed | Drafts | of them machine-assisted | Missing |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const lang of ['uk', 'la', 'en'] as const) {
    const n = c.names[lang];
    lines.push(`| ${lang} | ${n.present} | ${n.reviewed} | ${n.drafts} | ${n.machine} | ${n.missing} |`);
  }
  lines.push(
    '',
    'Unreviewed Ukrainian names (translation drafts) are shown marked as drafts; a site can show reviewed ones only',
    '(`uk-names="reviewed"`). Machine-assisted drafts were prepared with an AI language model and checked for format',
    'only. Where there is no Ukrainian name, the English name is shown and labelled as English.',
  );
  lines.push('', '## Anatomical review', '');
  lines.push(`- Reviewed: ${c.review.anatomyReviewed}; unreviewed: ${c.review.anatomyUnreviewed}; needs correction: ${c.review.needsCorrection}.`);
  lines.push('- No independent anatomical review of the source data has been performed for this release.');
  lines.push('', '## Excluded assets', '');
  if (c.excludedAssets.length === 0) lines.push('None.');
  for (const a of c.excludedAssets) lines.push(`- **${a.title}** (${a.license}): ${a.reason}`);
  lines.push('', '## Declared gaps', '', `${c.gaps.length} structures are listed without geometry:`, '');
  const byAsset = new Map<string, string[]>();
  for (const g of c.gaps) {
    const k = g.asset ?? g.reason;
    byAsset.set(k, [...(byAsset.get(k) ?? []), g.id]);
  }
  for (const [k, ids] of byAsset) lines.push(`- ${k}: ${ids.length} (${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ', …' : ''})`);
  lines.push('', '## Not imported from the source', '');
  for (const e of c.excludedSource) lines.push(`- ${e.reason}: ${e.count}`);
  if (c.corrections?.length) {
    lines.push(
      '',
      '## Geometry corrections',
      '',
      'The source geometry is changed only in these declared places (`sources/geometry-fixes.json`); the card of each',
      'structure shows a note, and the validation checks the seams.',
      '',
    );
    const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;
    for (const k of c.corrections) {
      const gap = k.gapBefore !== undefined && k.gapAfter !== undefined ? ` Largest gap: ${mm(k.gapBefore)} before, ${mm(k.gapAfter)} after.` : '';
      const moved = k.maxDisplacement !== undefined ? ` Largest displacement: ${mm(k.maxDisplacement)}.` : '';
      lines.push(`- **${k.id}** (${k.kind}; ${k.structures.join(', ')}): ${k.reason}${gap}${moved}`);
    }
  }
  if (c.notes.length) {
    lines.push('', '## Notes', '');
    for (const n of c.notes) lines.push(`- ${n}`);
  }
  return `${lines.join('\n')}\n`;
}

function attributionMarkdown(input: ReleaseInput, assets: AssetEntry[]): string {
  const lines = [`# Attribution — ${input.model} ${input.version}`, ''];
  lines.push('This data release contains material from the following sources. Their licences are kept; the atlas code licence does not apply to them.', '');
  for (const a of assets.filter((x) => x.included)) {
    lines.push(`## ${a.title}`, '', a.attribution, '', `- Licence: [${a.license.name}](${a.license.url})`, `- Source: [${a.source.name}](${a.source.url}), ${a.source.version}`, `- Changes: ${a.changes}`, `- Licence audit: ${a.audit.status}`, '');
  }
  return `${lines.join('\n')}\n`;
}

function licensesMarkdown(assets: AssetEntry[]): string {
  const lines = ['# Licences of the data', ''];
  lines.push('| Asset | Licence | Commercial use | Included | Audit |', '| --- | --- | --- | --- | --- |');
  for (const a of assets) {
    lines.push(`| ${a.title} | [${a.license.id}](${a.license.url}) | ${a.commercialUse} | ${a.included ? 'yes' : 'no'} | ${a.audit.status} |`);
  }
  lines.push('', 'Full licence texts are published at the linked URLs. Assets with non-commercial or unverified terms are never included in the standard data set.', '');
  return `${lines.join('\n')}\n`;
}
