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
import { z } from 'zod';
import {
  AssetIdSchema,
  ChunkIdSchema,
  FileRefSchema,
  HexColorSchema,
  HttpUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LangSchema,
  LocalizedTextSchema,
  ModelIdSchema,
  SemverSchema,
  Sha256Schema,
  StructureIdSchema,
  Vec3Schema,
  safeText,
} from './primitives.js';

/** Schema versions of the data format this code understands. */
export const MANIFEST_SCHEMA_VERSION = 1;
export const SUPPORTED_MANIFEST_SCHEMA_VERSIONS: readonly number[] = [1];

export const REVIEW_STATUSES = ['unreviewed', 'reviewed', 'needs-correction'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Review record. Anatomical and translation reviews are tracked separately.
 * `reviewed` always carries who reviewed, when and what scope was checked;
 * technical validation never produces `reviewed`.
 */
export const ReviewSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES),
    reviewer: safeText(160).optional(),
    date: IsoDateSchema.optional(),
    scope: safeText(500).optional(),
    notes: safeText(2000).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.status === 'reviewed' && (!r.reviewer || !r.date || !r.scope)) {
      ctx.addIssue({ code: 'custom', message: '`reviewed` requires reviewer, date and scope' });
    }
  });
export type Review = z.infer<typeof ReviewSchema>;

export const SIDES = ['left', 'right', 'median', 'bilateral'] as const;
export type Side = (typeof SIDES)[number];

export const STRUCTURE_KINDS = ['system', 'group', 'structure'] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export const GAP_REASONS = ['licence', 'missing', 'excluded'] as const;

export const StructureSchema = z
  .object({
    id: StructureIdSchema,
    /** Logical parent; `null` only for system roots. */
    parent: StructureIdSchema.nullable(),
    system: StructureIdSchema,
    kind: z.enum(STRUCTURE_KINDS),
    side: z.enum(SIDES).optional(),
    /** Indices into the dataset mesh table (see chunks). Logical groups may have none. */
    meshes: z.array(z.number().int().nonnegative()).max(64).optional(),
    /**
     * Alternative decomposition of an ancestor's geometry (e.g. liver segments).
     * It is not added when an ancestor is shown and appears only when requested explicitly.
     */
    optional: z.boolean().optional(),
    /** Licence registry entry of the geometry. */
    asset: AssetIdSchema.optional(),
    /** Declared gap: the structure is known but its geometry is not part of this release. */
    gap: z
      .object({
        reason: z.enum(GAP_REASONS),
        asset: AssetIdSchema.optional(),
        note: LocalizedTextSchema.optional(),
      })
      .strict()
      .optional(),
    /** Anatomical review of geometry and hierarchy (not of translations). */
    review: ReviewSchema,
    issues: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(32).optional(),
    source: z.object({ object: safeText(200) }).strict().optional(),
  })
  .strict();
export type StructureEntry = z.infer<typeof StructureSchema>;

export const SystemSchema = z
  .object({
    /** Also the ID of the system root structure. */
    id: StructureIdSchema,
    order: z.number().int().min(0).max(1000),
    color: HexColorSchema,
    /** Lower values load first during "load all" (0 = outer layer). */
    loadPriority: z.number().int().min(0).max(100),
    /** Loaded by "load all" but initially hidden (e.g. overlay layers). */
    hiddenByDefault: z.boolean().optional(),
  })
  .strict();
export type SystemEntry = z.infer<typeof SystemSchema>;

export const QUALITIES = ['standard', 'economy'] as const;
export type Quality = (typeof QUALITIES)[number];

export const ChunkFileSchema = FileRefSchema.extend({
  triangles: z.number().int().nonnegative(),
  vertices: z.number().int().nonnegative(),
}).strict();
export type ChunkFile = z.infer<typeof ChunkFileSchema>;

/**
 * A chunk is a disjoint set of meshes stored in one GLB per quality level. Every mesh
 * belongs to exactly one chunk, so geometry shared by a system and an organ view is
 * downloaded and placed on the scene only once.
 */
export const ChunkSchema = z
  .object({
    id: ChunkIdSchema,
    system: StructureIdSchema,
    meshStart: z.number().int().nonnegative(),
    meshCount: z.number().int().positive().max(65535),
    priority: z.number().int().min(0).max(1000),
    files: z.object({ standard: ChunkFileSchema, economy: ChunkFileSchema }).strict(),
  })
  .strict();
export type ChunkEntry = z.infer<typeof ChunkSchema>;

export const MATERIAL_KINDS = [
  'bone',
  'cartilage',
  'tooth',
  'ligament',
  'muscle',
  'tendon',
  'fascia',
  'artery',
  'vein',
  'nerve',
  'brain',
  'organ',
  'gland',
  'lymph',
  'mucosa',
  'skin',
  'hair',
  'fluid',
  'eye',
  'insertion',
  'other',
] as const;

export const MaterialSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    kind: z.enum(MATERIAL_KINDS),
    color: HexColorSchema,
  })
  .strict();
export type MaterialEntry = z.infer<typeof MaterialSchema>;

export const IssueSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    kind: z.enum(['geometry', 'naming', 'hierarchy', 'coverage', 'other']),
    status: z.enum(['open', 'resolved']),
    text: LocalizedTextSchema,
  })
  .strict();
export type IssueEntry = z.infer<typeof IssueSchema>;

export const AUDIT_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** Provenance and licence record of an asset (or of a group of meshes with the same origin). */
export const AssetSchema = z
  .object({
    id: AssetIdSchema,
    title: safeText(300),
    authors: z.array(safeText(300)).min(1).max(50),
    source: z
      .object({
        name: safeText(300),
        url: HttpUrlSchema,
        version: safeText(300),
        date: IsoDateSchema.optional(),
      })
      .strict(),
    license: z.object({ id: safeText(80), name: safeText(200), url: HttpUrlSchema }).strict(),
    changes: safeText(4000),
    attribution: safeText(2000),
    permissionBasis: safeText(4000),
    commercialUse: z.enum(['allowed', 'not-allowed', 'unknown']),
    audit: z
      .object({
        status: z.enum(AUDIT_STATUSES),
        reviewer: safeText(160).optional(),
        date: IsoDateSchema.optional(),
        notes: safeText(4000).optional(),
      })
      .strict(),
    /** Whether geometry from this asset ships in this release. */
    included: z.boolean(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetSchema>;

export const RELEASE_CHANNELS = ['release', 'preview', 'fixture'] as const;

export const ManifestSchema = z
  .object({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    model: ModelIdSchema,
    version: SemverSchema,
    /** `preview` data has not passed the release audit; `fixture` is synthetic test data. */
    channel: z.enum(RELEASE_CHANNELS),
    /** SHA-256 of the canonical manifest without this field (computed by the pipeline). */
    contentHash: Sha256Schema,
    title: LocalizedTextSchema,
    generatedAt: IsoDateTimeSchema,
    generator: z.object({ name: safeText(100), version: safeText(60) }).strict(),
    coordinates: z
      .object({
        up: z.literal('+Y'),
        front: z.literal('+Z'),
        units: z.literal('m'),
        origin: z.literal('floor-between-heels'),
      })
      .strict(),
    bounds: z.object({ min: Vec3Schema, max: Vec3Schema }).strict(),
    source: z
      .object({
        name: safeText(200),
        repository: HttpUrlSchema,
        revision: z.string().regex(/^[0-9a-f]{7,64}$/),
        date: IsoDateTimeSchema.optional(),
        files: z.array(z.object({ path: safeText(300), sha256: Sha256Schema }).strict()).max(100),
      })
      .strict()
      .optional(),
    languages: z.array(LangSchema).min(1).max(3),
    dictionaries: z.partialRecord(LangSchema, FileRefSchema),
    systems: z.array(SystemSchema).min(1).max(64),
    structures: z.array(StructureSchema).min(1).max(30000),
    meshCount: z.number().int().nonnegative().max(65535),
    chunks: z.array(ChunkSchema).max(10000),
    materials: z.array(MaterialSchema).min(1).max(255),
    aliases: z.record(StructureIdSchema, StructureIdSchema),
    issues: z.array(IssueSchema).max(20000),
    assets: z.array(AssetSchema).min(1).max(500),
    notices: z.object({ review: LocalizedTextSchema, data: LocalizedTextSchema.optional() }).strict(),
    /** Human-readable release documents; SHA256SUMS next to the manifest covers every file. */
    reports: z
      .object({ coverage: FileRefSchema, attribution: FileRefSchema, licenses: FileRefSchema })
      .strict(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    for (const problem of checkManifestIntegrity(manifest)) {
      ctx.addIssue({ code: 'custom', message: problem });
    }
  });
export type Manifest = z.infer<typeof ManifestSchema>;

const MAX_REPORTED_PROBLEMS = 50;

/**
 * Referential integrity checks shared by the runtime loader and the pipeline validator:
 * unique IDs, existing parents, acyclic hierarchy, alias conflicts, mesh/chunk coverage,
 * issues and licence consistency.
 */
export function checkManifestIntegrity(m: z.input<typeof ManifestSchema> | Manifest): string[] {
  const problems: string[] = [];
  const report = (message: string) => {
    if (problems.length < MAX_REPORTED_PROBLEMS) problems.push(message);
  };

  const byId = new Map<string, (typeof m.structures)[number]>();
  for (const s of m.structures) {
    if (byId.has(s.id)) report(`Duplicate structure id: ${s.id}`);
    byId.set(s.id, s);
  }
  const systemIds = new Set(m.systems.map((s) => s.id));
  if (systemIds.size !== m.systems.length) report('Duplicate system id');
  for (const sys of m.systems) {
    const root = byId.get(sys.id);
    if (!root || root.kind !== 'system' || root.parent !== null) report(`System ${sys.id} has no root structure`);
  }
  const assetIds = new Set(m.assets.map((a) => a.id));
  if (assetIds.size !== m.assets.length) report('Duplicate asset id');
  const issueIds = new Set(m.issues.map((i) => i.id));

  const meshOwner = new Array<string | undefined>(m.meshCount);
  for (const s of m.structures) {
    if (!systemIds.has(s.system)) report(`Structure ${s.id} references unknown system ${s.system}`);
    if (s.parent === null) {
      if (s.kind !== 'system') report(`Structure ${s.id} has no parent`);
    } else {
      const parent = byId.get(s.parent);
      if (!parent) report(`Structure ${s.id} references missing parent ${s.parent}`);
      else if (parent.system !== s.system) report(`Structure ${s.id} and its parent belong to different systems`);
    }
    if (s.kind === 'system' && s.id !== s.system) report(`System root ${s.id} must equal its system id`);
    if (s.asset && !assetIds.has(s.asset)) report(`Structure ${s.id} references unknown asset ${s.asset}`);
    if (s.gap?.asset && !assetIds.has(s.gap.asset)) report(`Gap of ${s.id} references unknown asset`);
    if (s.gap && s.meshes && s.meshes.length > 0) report(`Structure ${s.id} declares a gap but has meshes`);
    for (const issue of s.issues ?? []) if (!issueIds.has(issue)) report(`Structure ${s.id} references unknown issue ${issue}`);
    for (const mesh of s.meshes ?? []) {
      if (mesh >= m.meshCount) report(`Structure ${s.id} references mesh ${mesh} outside mesh table`);
      else if (meshOwner[mesh] !== undefined) report(`Mesh ${mesh} is assigned to ${meshOwner[mesh]} and ${s.id}`);
      else meshOwner[mesh] = s.id;
    }
    if ((s.meshes?.length ?? 0) > 0 && !s.asset) report(`Structure ${s.id} has geometry without asset record`);
  }
  for (let i = 0; i < m.meshCount; i++) {
    if (meshOwner[i] === undefined) report(`Mesh ${i} is not assigned to a structure`);
  }

  // Acyclic hierarchy (walk up from every node with a visited set per walk).
  const depthCache = new Map<string, number>();
  for (const s of m.structures) {
    const trail: string[] = [];
    let cur: string | null = s.id;
    const seen = new Set<string>();
    while (cur !== null && !depthCache.has(cur)) {
      if (seen.has(cur)) {
        report(`Cycle in hierarchy at ${cur}`);
        break;
      }
      seen.add(cur);
      trail.push(cur);
      cur = byId.get(cur)?.parent ?? null;
      if (trail.length > 64) {
        report(`Hierarchy too deep at ${s.id}`);
        break;
      }
    }
    const base = cur === null ? 0 : (depthCache.get(cur) ?? 0);
    trail.reverse().forEach((id, i) => depthCache.set(id, base + i + 1));
  }

  // Aliases: old id -> current id; the old id must not be reused and chains are not allowed.
  for (const [from, to] of Object.entries(m.aliases)) {
    if (byId.has(from)) report(`Alias ${from} conflicts with an existing structure id`);
    if (!byId.has(to)) report(`Alias ${from} points to missing structure ${to}`);
    if (Object.prototype.hasOwnProperty.call(m.aliases, to)) report(`Alias chain ${from} -> ${to}`);
  }

  // Chunks cover the mesh table exactly once.
  const chunkIds = new Set<string>();
  const covered = new Uint8Array(m.meshCount);
  for (const c of m.chunks) {
    if (chunkIds.has(c.id)) report(`Duplicate chunk id ${c.id}`);
    chunkIds.add(c.id);
    if (!systemIds.has(c.system)) report(`Chunk ${c.id} references unknown system`);
    if (c.meshStart + c.meshCount > m.meshCount) {
      report(`Chunk ${c.id} exceeds mesh table`);
      continue;
    }
    for (let i = c.meshStart; i < c.meshStart + c.meshCount; i++) {
      if (covered[i]) report(`Mesh ${i} belongs to several chunks`);
      covered[i] = 1;
    }
    if (c.files.standard.path === c.files.economy.path) report(`Chunk ${c.id} uses one file for both qualities`);
  }
  for (let i = 0; i < m.meshCount; i++) if (!covered[i]) report(`Mesh ${i} is not stored in any chunk`);

  for (const lang of Object.keys(m.dictionaries)) {
    if (!m.languages.includes(lang as never)) report(`Dictionary ${lang} is not a declared language`);
  }

  for (const a of m.assets) {
    if (a.included && a.commercialUse !== 'allowed') report(`Asset ${a.id} is included without confirmed commercial use`);
    if (m.channel === 'release' && a.included && a.audit.status !== 'approved') {
      report(`Release data includes asset ${a.id} whose licence audit is not approved`);
    }
    if (a.audit.status === 'approved' && (!a.audit.reviewer || !a.audit.date)) {
      report(`Asset ${a.id} is approved without reviewer and date`);
    }
  }
  const assetsById = new Map(m.assets.map((a) => [a.id, a]));
  for (const s of m.structures) {
    if ((s.meshes?.length ?? 0) > 0 && s.asset) {
      const asset = assetsById.get(s.asset);
      if (asset && !asset.included) report(`Structure ${s.id} ships geometry of excluded asset ${s.asset}`);
    }
  }
  return problems;
}
