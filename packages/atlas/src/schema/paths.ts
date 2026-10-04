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
import { isSafeRelativePath, isSemver } from './primitives.js';

export class DataPathError extends Error {
  readonly code = 'DATA_PATH_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'DataPathError';
  }
}

/** Normalises a dataset base URL to an absolute http(s) URL with a trailing slash. */
export function normalizeBaseUrl(base: string, documentBase: string): URL {
  let url: URL;
  try {
    url = new URL(base, documentBase);
  } catch {
    throw new DataPathError(`Invalid data URL: ${String(base).slice(0, 200)}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DataPathError(`Data URL must use http(s): ${url.protocol}`);
  }
  if (url.username || url.password) throw new DataPathError('Data URL must not contain credentials');
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/**
 * Resolves a path from a manifest against the dataset base. The path is checked before
 * and after resolution, so it can never leave the base through `..`, schemes or encoding tricks.
 */
export function resolveDataPath(base: URL, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new DataPathError(`Unsafe path in data: ${relativePath.slice(0, 200)}`);
  }
  const url = new URL(relativePath, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) {
    throw new DataPathError(`Path leaves the data base: ${relativePath.slice(0, 200)}`);
  }
  return url.href;
}

/**
 * Default resolver of `AtlasCatalog.loadVersion`: when the configured base ends with
 * `/<currentVersion>/`, the requested version is looked up in the sibling folder of the same site
 * (`/<root>/<requestedVersion>/`). Returns null when no such convention applies; a version can
 * never point the atlas at another host or folder.
 */
export function siblingVersionBase(base: URL, currentVersion: string, requestedVersion: string): URL | null {
  if (!isSemver(requestedVersion) || !isSemver(currentVersion)) return null;
  const suffix = `/${currentVersion}/`;
  if (!base.pathname.endsWith(suffix)) return null;
  const url = new URL(base.href);
  url.pathname = base.pathname.slice(0, -suffix.length) + `/${requestedVersion}/`;
  return url;
}
