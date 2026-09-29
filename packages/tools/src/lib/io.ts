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
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const DATA_PACKAGE = join(REPO_ROOT, 'packages/data');
export const DATA_SOURCES = join(DATA_PACKAGE, 'sources');
export const DATA_RELEASES = join(DATA_PACKAGE, 'releases');
export const WORK_DIR = process.env.SVITYLO_ATLAS_WORK ? resolve(process.env.SVITYLO_ATLAS_WORK) : join(REPO_ROOT, '.work');

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Deterministic JSON (2-space indentation, trailing newline) so releases are reproducible. */
export function writeJson(path: string, value: unknown, compact = false): Buffer {
  mkdirSync(dirname(path), { recursive: true });
  const text = (compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)) + '\n';
  const buffer = Buffer.from(text, 'utf8');
  writeFileSync(path, buffer);
  return buffer;
}

export function writeBytes(path: string, bytes: Uint8Array | string): Buffer {
  mkdirSync(dirname(path), { recursive: true });
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeFileSync(path, buffer);
  return buffer;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function log(message: string): void {
  process.stdout.write(`${message}\n`);
}
