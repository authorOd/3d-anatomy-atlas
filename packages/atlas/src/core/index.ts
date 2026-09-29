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
export { AtlasCatalog, type CatalogOptions } from './catalog/catalog.js';
export { NameResolver, type DisplayName, type NamePolicy, type NameVariant } from './catalog/names.js';
export { SearchIndex, normalizeSearchText, type SearchOptions, type SearchResult } from './catalog/search.js';
export {
  StructureIndex,
  type ExpandMode,
  type IndexedStructure,
  type SelectionLevel,
  type SurroundingsLevel,
} from './catalog/structure-index.js';
export { AtlasError, isAtlasError, type AtlasErrorCode, type AtlasErrorDetails } from './errors.js';
export type {
  AtlasEventMap,
  AtlasEventName,
  CameraEvent,
  ChangeSource,
  ErrorEvent,
  HoverEvent,
  LangEvent,
  LoadPhase,
  ProgressEvent,
  QualityEvent,
  ReadyEvent,
  SelectEvent,
  StateChangeEvent,
  SurroundingsEvent,
  SurroundingsInfo,
  Unsubscribe,
  VisibilityEvent,
} from './events.js';
export { ResourceManager, type ChunkSource, type ResourceStats } from './loading/resource-manager.js';
export { STANDARD_VIEWS, type StandardView } from './render/camera-rig.js';
export { DEFAULT_MATERIAL_COLORS, type MaterialColors } from './render/materials.js';
export { MODE_GHOST, MODE_HIDDEN, MODE_OPAQUE, ViewModel, type DisplaySnapshot, type SelectMode } from './state/view-model.js';
export {
  AtlasViewer,
  isWebGL2Available,
  type AtlasViewerOptions,
  type OperationResult,
  type OperationStatus,
  type ResourceReport,
} from './viewer.js';
export { createAtlasViewer, type CreateAtlasViewerOptions } from './create.js';
