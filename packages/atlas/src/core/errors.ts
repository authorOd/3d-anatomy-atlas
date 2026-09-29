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
/** Error codes reported by the atlas. They are stable and safe to switch on in integrations. */
export type AtlasErrorCode =
  | 'WEBGL2_UNAVAILABLE'
  | 'CONTEXT_LOST'
  | 'DATA_URL_INVALID'
  | 'MANIFEST_UNAVAILABLE'
  | 'MANIFEST_INVALID'
  | 'SCHEMA_UNSUPPORTED'
  | 'DATA_VERSION_UNAVAILABLE'
  | 'DATA_MISMATCH'
  | 'FILE_UNAVAILABLE'
  | 'FILE_INTEGRITY'
  | 'FORMAT_UNSUPPORTED'
  | 'UNKNOWN_ID'
  | 'NO_GEOMETRY'
  | 'STATE_INVALID'
  | 'STATE_MALFORMED'
  | 'STATE_TOO_LARGE'
  | 'STATE_UNSUPPORTED_VERSION'
  | 'NOT_READY'
  | 'DISPOSED';

export interface AtlasErrorDetails {
  /** Structure IDs involved (for UNKNOWN_ID, NO_GEOMETRY). */
  ids?: string[];
  /** Chunk IDs or file paths involved in a loading error. */
  files?: string[];
  /** Data version involved (DATA_VERSION_UNAVAILABLE, DATA_MISMATCH). */
  version?: string;
  /** HTTP status of a failed request. */
  status?: number;
  /** Whether a retry can succeed without reloading the page. */
  recoverable?: boolean;
}

export class AtlasError extends Error {
  readonly code: AtlasErrorCode;
  readonly details: AtlasErrorDetails;

  constructor(code: AtlasErrorCode, message: string, details: AtlasErrorDetails = {}, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AtlasError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...this.details };
  }
}

export function isAtlasError(value: unknown): value is AtlasError {
  return value instanceof AtlasError;
}

/** Converts schema-level state errors (which do not depend on the core) into atlas errors. */
export function toAtlasError(error: unknown, fallback: AtlasErrorCode, message: string): AtlasError {
  if (error instanceof AtlasError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === 'STATE_TOO_LARGE' ||
    code === 'STATE_MALFORMED' ||
    code === 'STATE_UNSUPPORTED_VERSION' ||
    code === 'STATE_INVALID'
  ) {
    return new AtlasError(code, (error as Error).message, {}, { cause: error });
  }
  if (code === 'DATA_PATH_REJECTED') {
    return new AtlasError('MANIFEST_INVALID', (error as Error).message, {}, { cause: error });
  }
  const detail = error instanceof Error ? `: ${error.message}` : '';
  return new AtlasError(fallback, `${message}${detail}`, {}, { cause: error });
}
