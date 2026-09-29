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
import { LangSchema, ModelIdSchema, SemverSchema, StructureIdSchema, StructureRefSchema, Vec3Schema } from './primitives.js';

/** Current version of the shareable view state schema. */
export const STATE_SCHEMA_VERSION = 2;

/** Hard limits applied before a state from a link is used. */
export const STATE_LIMITS = {
  /** Maximum length of the encoded state string (URL fragment payload). */
  maxEncodedLength: 32_768,
  /** Maximum size of the decoded JSON in bytes (protects against decompression bombs). */
  maxDecodedBytes: 256 * 1024,
  /** Maximum number of IDs in a single list. */
  maxIdsPerList: 4_000,
  /** Maximum number of IDs across all lists. */
  maxTotalIds: 10_000,
  /** Maximum JSON nesting depth. */
  maxDepth: 6,
} as const;

const IdListSchema = z.array(StructureIdSchema).max(STATE_LIMITS.maxIdsPerList);
const RefListSchema = z.array(StructureRefSchema).max(STATE_LIMITS.maxIdsPerList);

/**
 * Transparency of everything that is not selected: 0 = opaque (off) … 0.95. The default is used
 * when the transparency is turned on without a value (for example, for a structure that others
 * cover).
 */
export const TRANSPARENCY_RANGE = { min: 0, max: 0.95, default: 0.78 } as const;
/** Opacity range of the translucent surroundings in schema v1 (1 − transparency). */
export const GHOST_OPACITY_RANGE = { min: 0.05, max: 0.8, default: 0.22 } as const;
/** Upper bound of a surroundings level (hierarchies are far shallower). */
export const MAX_SURROUNDINGS_LEVEL = 32;

/** Fields shared by every schema version. */
const commonFields = {
  /** Exact dataset the state was made with. */
  data: z
    .object({
      model: ModelIdSchema,
      version: SemverSchema,
      /** Prefix of the manifest content hash. */
      hash: z.string().regex(/^[0-9a-f]{12,64}$/).optional(),
    })
    .strict(),
  /** Structures placed on the scene (logical parents expand to their descendants). */
  scene: RefListSchema,
  /** Narrows the scene. */
  hidden: RefListSchema.optional(),
  /** Restricts the allowed set; absent means no isolation. */
  isolate: RefListSchema.optional(),
  /** Selection order (the last is the most recent); never makes hidden structures visible. */
  selected: IdListSchema.optional(),
  camera: z
    .object({
      position: Vec3Schema,
      target: Vec3Schema,
      fov: z.number().min(10).max(100).optional(),
    })
    .strict()
    .optional(),
  /** Term language; quality is a local viewing option and is never part of shared state. */
  lang: LangSchema.optional(),
  /** Latin names are shown next to the names in `lang` (canonical form: `true` or absent). */
  latin: z.boolean().optional(),
};

type IdCounts = {
  scene: unknown[];
  hidden?: unknown[];
  isolate?: unknown[];
  selected?: unknown[];
  surroundings?: { extra?: unknown[]; anchor?: string };
};

function limitIds(state: IdCounts, ctx: z.RefinementCtx) {
  const total =
    state.scene.length +
    (state.hidden?.length ?? 0) +
    (state.isolate?.length ?? 0) +
    (state.selected?.length ?? 0) +
    (state.surroundings?.extra?.length ?? 0) +
    (state.surroundings?.anchor ? 1 : 0);
  if (total > STATE_LIMITS.maxTotalIds) {
    ctx.addIssue({ code: 'custom', message: `State lists too many IDs (${total} > ${STATE_LIMITS.maxTotalIds})` });
  }
}

/**
 * Schema v1: what the migration to v2 reads. Its `surroundings` was a translucent mode with a
 * level (from 1), the structures added in it, the opacity of the translucent structures and an
 * optional `anchor`.
 */
export const ViewStateV1Schema = z
  .object({
    v: z.literal(1),
    ...commonFields,
    surroundings: z
      .object({
        anchor: StructureIdSchema.optional(),
        level: z.number().int().min(1).max(MAX_SURROUNDINGS_LEVEL),
        extra: RefListSchema.optional(),
        opacity: z.number().min(GHOST_OPACITY_RANGE.min).max(GHOST_OPACITY_RANGE.max).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(limitIds);

/** Current schema (v2). */
export const ViewStateSchema = z
  .object({
    v: z.literal(2),
    ...commonFields,
    /**
     * Surroundings of the selection. `level`: 0 = only the selection, 1 = the nearest groups of
     * every selected structure … last = the whole body; absent = automatic (everything placed on
     * the scene is shown). `extra`: structures shown with the eye while the level limits the view.
     * `transparency`: of everything not selected; absent = opaque.
     */
    surroundings: z
      .object({
        level: z.number().int().min(0).max(MAX_SURROUNDINGS_LEVEL).optional(),
        extra: RefListSchema.optional(),
        transparency: z.number().gt(TRANSPARENCY_RANGE.min).max(TRANSPARENCY_RANGE.max).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(limitIds);

export type ViewState = z.infer<typeof ViewStateSchema>;
export type ViewStateV1 = z.infer<typeof ViewStateV1Schema>;

export class StateFormatError extends Error {
  readonly code:
    | 'STATE_TOO_LARGE'
    | 'STATE_MALFORMED'
    | 'STATE_UNSUPPORTED_VERSION'
    | 'STATE_INVALID';
  constructor(code: StateFormatError['code'], message: string) {
    super(message);
    this.name = 'StateFormatError';
    this.code = code;
  }
}

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

function invalidState(error: z.ZodError): StateFormatError {
  const first = error.issues[0];
  const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
  return new StateFormatError('STATE_INVALID', `Invalid state${where}: ${first?.message ?? 'unknown error'}`);
}

/**
 * Migrations from older schema versions, keyed by the version they upgrade *from*. Every entry
 * comes with saved example states in the test suite.
 *
 * v1 → v2: the translucent surroundings mode becomes its level with the transparency
 * (1 − opacity; the default opacity when absent); the anchor of older links is dropped. A state
 * without the mode keeps the automatic level and opaque structures.
 */
export const STATE_MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  1: (input: Record<string, unknown>) => {
    const parsed = ViewStateV1Schema.safeParse(input);
    if (!parsed.success) throw invalidState(parsed.error);
    const { surroundings, ...rest } = parsed.data;
    const out: Record<string, unknown> = { ...rest, v: 2 };
    if (surroundings) {
      const { level, extra, opacity = GHOST_OPACITY_RANGE.default } = surroundings;
      out.surroundings = { level, ...(extra ? { extra } : {}), transparency: Math.round((1 - opacity) * 1000) / 1000 };
    }
    return out;
  },
});

function depthOf(value: unknown, depth = 0): number {
  if (depth > STATE_LIMITS.maxDepth) return depth;
  if (Array.isArray(value)) {
    let max = depth;
    for (const item of value) max = Math.max(max, depthOf(item, depth + 1));
    return max;
  }
  if (value !== null && typeof value === 'object') {
    let max = depth;
    for (const item of Object.values(value)) max = Math.max(max, depthOf(item, depth + 1));
    return max;
  }
  return depth;
}

/**
 * Validates an untrusted state object (from a link, JSON import or API call),
 * applies migrations and returns a state in the current schema version.
 */
export function parseViewState(input: unknown, migrations = STATE_MIGRATIONS): ViewState {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new StateFormatError('STATE_MALFORMED', 'State must be an object');
  }
  if (depthOf(input) > STATE_LIMITS.maxDepth) {
    throw new StateFormatError('STATE_MALFORMED', 'State is nested too deeply');
  }
  let current = input as Record<string, unknown>;
  const declared = current.v;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) {
    throw new StateFormatError('STATE_MALFORMED', 'State has no schema version');
  }
  let version: number = declared;
  if (version > STATE_SCHEMA_VERSION) {
    throw new StateFormatError(
      'STATE_UNSUPPORTED_VERSION',
      `State schema v${version} is newer than supported v${STATE_SCHEMA_VERSION}`,
    );
  }
  while (version < STATE_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new StateFormatError('STATE_UNSUPPORTED_VERSION', `No migration from state schema v${version}`);
    }
    current = migrate(current);
    const next: unknown = current.v;
    if (typeof next !== 'number' || next <= version) {
      throw new StateFormatError('STATE_INVALID', `Migration from v${version} did not advance the version`);
    }
    version = next;
  }
  const result = ViewStateSchema.safeParse(current);
  if (!result.success) throw invalidState(result.error);
  return result.data;
}
