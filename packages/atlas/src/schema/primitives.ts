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

/** Languages supported for structure names. UI strings live in separate dictionaries. */
export const LANGS = ['uk', 'la', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LangSchema = z.enum(LANGS);

/**
 * Stable structure ID: lower-case ASCII segments separated by dots,
 * e.g. `cardiovascular.heart`, `skeletal.humerus_r`.
 * IDs are assigned once by the data pipeline and never regenerated from translations.
 */
export const STRUCTURE_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9][a-z0-9_]*)*$/;
export const MAX_ID_LENGTH = 160;
export const StructureIdSchema = z.string().min(1).max(MAX_ID_LENGTH).regex(STRUCTURE_ID_PATTERN);
export type StructureId = string;

/**
 * Reference used in state lists: `id` means the structure with its descendants,
 * `=id` means only the structure's own geometry (used when a parent is partly hidden).
 */
export const STRUCTURE_REF_PATTERN = /^=?[a-z][a-z0-9_]*(?:\.[a-z0-9][a-z0-9_]*)*$/;
export const StructureRefSchema = z.string().min(1).max(MAX_ID_LENGTH + 1).regex(STRUCTURE_REF_PATTERN);

export function isStructureId(value: unknown): value is StructureId {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && STRUCTURE_ID_PATTERN.test(value);
}

/** Semantic version without build metadata (keeps versions URL-path safe). */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const SemverSchema = z.string().max(64).regex(SEMVER_PATTERN);

export function isSemver(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SEMVER_PATTERN.test(value);
}

export const MODEL_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const ModelIdSchema = z.string().regex(MODEL_ID_PATTERN);

export const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const AssetIdSchema = z.string().regex(ASSET_ID_PATTERN);

export const CHUNK_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,119}$/;
export const ChunkIdSchema = z.string().regex(CHUNK_ID_PATTERN);

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const IsoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);

/**
 * Plain text shown in the UI (names, notes). Markup and control characters are rejected here,
 * and the UI additionally renders every value as text, never as HTML.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/;

export function isSafeText(value: string): boolean {
  return !UNSAFE_TEXT.test(value) && value.trim() === value && value.length > 0;
}

export const safeText = (max = 300) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(isSafeText, { message: 'Text must be trimmed and must not contain markup or control characters' });

export const LocalizedTextSchema = z
  .object({ uk: safeText(2000).optional(), en: safeText(2000).optional(), la: safeText(2000).optional() })
  .strict()
  .refine((t) => Boolean(t.uk ?? t.en ?? t.la), { message: 'At least one language is required' });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** External links shown in the UI (licences, sources). Only http(s) is allowed. */
export const HttpUrlSchema = z
  .string()
  .max(500)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }, { message: 'Expected an http(s) URL' });

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MAX_PATH_LENGTH = 240;

/**
 * Relative file path inside a dataset. Rejects absolute paths, URL schemes, `..`, `.`,
 * hidden segments, backslashes, query strings and fragments, so a path can never
 * leave the allowed data base.
 */
export function isSafeRelativePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  const segments = path.split('/');
  if (segments.length > 8) return false;
  return segments.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..');
}

export const SafePathSchema = z.string().refine(isSafeRelativePath, { message: 'Unsafe relative path' });

export const FileRefSchema = z
  .object({
    path: SafePathSchema,
    bytes: z.number().int().positive().max(512 * 1024 * 1024),
    sha256: Sha256Schema,
  })
  .strict();
export type FileRef = z.infer<typeof FileRefSchema>;

const finite = z.number().finite().min(-1000).max(1000);
export const Vec3Schema = z.tuple([finite, finite, finite]);
export type Vec3 = [number, number, number];

/**
 * JSON with object keys sorted recursively. Used for content hashes, so a hash does not
 * depend on key order or on the tool that produced the file.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
