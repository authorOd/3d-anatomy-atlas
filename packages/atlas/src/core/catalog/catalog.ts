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
import {
  DictionarySchema,
  ManifestSchema,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  normalizeBaseUrl,
  resolveDataPath,
  siblingVersionBase,
  type AssetEntry,
  type Dictionary,
  type FileRef,
  type IssueEntry,
  type Lang,
  type Manifest,
  type SystemEntry,
} from '../../schema/index.js';
import { AtlasError, toAtlasError } from '../errors.js';
import { sha256Hex } from '../util/hash.js';
import { NameResolver, type NamePolicy } from './names.js';
import { SearchIndex } from './search.js';
import { StructureIndex, type IndexedStructure } from './structure-index.js';

export interface CatalogOptions {
  /** Base URL of one dataset version (the folder with `manifest.json`). */
  dataUrl: string;
  /** Base for relative data URLs; defaults to `document.baseURI`. */
  documentBase?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  names?: Partial<NamePolicy>;
  /**
   * Resolves the base URL of another data version for `loadVersion` (links do not use it: they
   * open in the loaded data). Return `null` when the site does not host that version. Without a
   * resolver the sibling folder `<root>/<version>/` of the configured data URL is used.
   */
  resolveDataUrl?: (version: string) => string | null | undefined;
}

const MAX_JSON_BYTES = 48 * 1024 * 1024;

async function fetchBytes(url: string, fetchImpl: typeof fetch, signal: AbortSignal | undefined, what: string) {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal, credentials: 'same-origin' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AtlasError('MANIFEST_UNAVAILABLE', `${what} is unavailable (network error)`, {
      files: [url],
      recoverable: true,
    }, { cause: error });
  }
  if (!response.ok) {
    throw new AtlasError('MANIFEST_UNAVAILABLE', `${what} is unavailable (HTTP ${response.status})`, {
      files: [url],
      status: response.status,
      recoverable: response.status >= 500,
    });
  }
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > MAX_JSON_BYTES) throw new AtlasError('MANIFEST_INVALID', `${what} is too large`, { files: [url] });
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_JSON_BYTES) throw new AtlasError('MANIFEST_INVALID', `${what} is too large`, { files: [url] });
  return buffer;
}

function parseJson(bytes: Uint8Array, what: string, url: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AtlasError('MANIFEST_INVALID', `${what} is not valid JSON`, { files: [url] });
  }
}

/**
 * Metadata of one dataset: manifest, dictionaries, hierarchy and search. Loading a catalog
 * never downloads geometry.
 */
export class AtlasCatalog {
  readonly index: StructureIndex;
  readonly names: NameResolver;
  readonly search: SearchIndex;
  private readonly issues: Map<string, IssueEntry>;
  private readonly assets: Map<string, AssetEntry>;
  private readonly systemsById: Map<string, SystemEntry>;

  private constructor(
    readonly base: URL,
    readonly manifest: Manifest,
    readonly dictionaries: Partial<Record<Lang, Dictionary>>,
    private readonly options: CatalogOptions,
  ) {
    this.index = new StructureIndex(manifest);
    this.names = new NameResolver(dictionaries, options.names);
    this.search = new SearchIndex(this.index, this.names);
    this.issues = new Map(manifest.issues.map((i) => [i.id, i]));
    this.assets = new Map(manifest.assets.map((a) => [a.id, a]));
    this.systemsById = new Map(manifest.systems.map((s) => [s.id, s]));
  }

  static async load(options: CatalogOptions): Promise<AtlasCatalog> {
    const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const documentBase =
      options.documentBase ?? (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
    let base: URL;
    try {
      base = normalizeBaseUrl(options.dataUrl, documentBase);
    } catch (error) {
      throw new AtlasError('DATA_URL_INVALID', (error as Error).message);
    }
    const manifestUrl = resolveDataPath(base, 'manifest.json');
    const manifestBytes = await fetchBytes(manifestUrl, fetchImpl, options.signal, 'Manifest');
    const raw = parseJson(manifestBytes, 'Manifest', manifestUrl) as { schemaVersion?: unknown };
    if (typeof raw?.schemaVersion !== 'number' || !SUPPORTED_MANIFEST_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
      throw new AtlasError(
        'SCHEMA_UNSUPPORTED',
        `Data schema version ${String(raw?.schemaVersion)} is not supported by this library version`,
        { files: [manifestUrl] },
      );
    }
    const parsed = ManifestSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AtlasError(
        'MANIFEST_INVALID',
        `Manifest failed validation${issue?.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue?.message}`,
        { files: [manifestUrl] },
      );
    }
    const manifest = parsed.data;

    const dictionaries: Partial<Record<Lang, Dictionary>> = {};
    await Promise.all(
      (Object.entries(manifest.dictionaries) as [Lang, FileRef][]).map(async ([lang, ref]) => {
        const url = resolveDataPath(base, ref.path);
        const bytes = await fetchBytes(url, fetchImpl, options.signal, `Dictionary ${lang}`);
        await verifyFile(bytes, ref, url);
        const dict = DictionarySchema.safeParse(parseJson(bytes, `Dictionary ${lang}`, url));
        if (!dict.success) {
          throw new AtlasError('MANIFEST_INVALID', `Dictionary ${lang} failed validation: ${dict.error.issues[0]?.message}`, {
            files: [url],
          });
        }
        if (dict.data.lang !== lang || dict.data.version !== manifest.version || dict.data.model !== manifest.model) {
          throw new AtlasError('MANIFEST_INVALID', `Dictionary ${lang} does not belong to data ${manifest.version}`, {
            files: [url],
          });
        }
        dictionaries[lang] = dict.data;
      }),
    );
    return new AtlasCatalog(base, manifest, dictionaries, options);
  }

  /**
   * Loads the catalog of another data version through the site's allowed data location.
   * Throws `DATA_VERSION_UNAVAILABLE` (with the version) instead of substituting other data.
   */
  async loadVersion(version: string, signal?: AbortSignal): Promise<AtlasCatalog> {
    if (version === this.manifest.version) return this;
    let target: string | null | undefined;
    try {
      target = this.options.resolveDataUrl
        ? this.options.resolveDataUrl(version)
        : siblingVersionBase(this.base, this.manifest.version, version)?.href;
    } catch {
      target = null;
    }
    if (!target) {
      throw new AtlasError('DATA_VERSION_UNAVAILABLE', `Data version ${version} is not available on this site`, {
        version,
      });
    }
    try {
      const other = await AtlasCatalog.load({ ...this.options, dataUrl: target, signal });
      if (other.manifest.version !== version || other.manifest.model !== this.manifest.model) {
        throw new AtlasError('DATA_VERSION_UNAVAILABLE', `Data version ${version} is not available on this site`, {
          version,
        });
      }
      return other;
    } catch (error) {
      if ((error as AtlasError).code === 'DATA_VERSION_UNAVAILABLE' || signal?.aborted) throw error;
      throw new AtlasError(
        'DATA_VERSION_UNAVAILABLE',
        `Data version ${version} could not be loaded: ${(error as Error).message}`,
        { version, recoverable: (error as AtlasError).details?.recoverable === true },
        { cause: error },
      );
    }
  }

  url(path: string): string {
    return resolveDataPath(this.base, path);
  }

  get(id: string): IndexedStructure | undefined {
    return this.index.get(id);
  }

  system(id: string): SystemEntry | undefined {
    return this.systemsById.get(id);
  }

  asset(id: string | undefined): AssetEntry | undefined {
    return id ? this.assets.get(id) : undefined;
  }

  issuesFor(id: string): IssueEntry[] {
    const node = this.index.get(id);
    if (!node) return [];
    return (node.entry.issues ?? []).map((i) => this.issues.get(i)).filter((i): i is IssueEntry => Boolean(i));
  }

  /** Short prefix of the manifest content hash stored in shared states. */
  get hashPrefix(): string {
    return this.manifest.contentHash.slice(0, 16);
  }
}

async function verifyFile(bytes: Uint8Array, ref: FileRef, url: string) {
  if (bytes.byteLength !== ref.bytes) {
    throw new AtlasError('FILE_INTEGRITY', `File size does not match the manifest: ${ref.path}`, { files: [url] });
  }
  const digest = await sha256Hex(bytes);
  if (digest !== null && digest !== ref.sha256) {
    throw new AtlasError('FILE_INTEGRITY', `Checksum does not match the manifest: ${ref.path}`, { files: [url] });
  }
}

export { verifyFile, toAtlasError };
