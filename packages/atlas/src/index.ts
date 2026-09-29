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
/**
 * @authorod/svitylo-3d-anatomy-atlas — importing this module registers <svitylo-anatomy>.
 * Registration itself loads no data; the headless core is available from "./core".
 */
import type {
  CameraEvent,
  ErrorEvent,
  HoverEvent,
  ProgressEvent,
  ReadyEvent,
  SelectEvent,
  StateChangeEvent,
  SurroundingsEvent,
  VisibilityEvent,
} from './core/events.js';
import { SvityloAnatomyElement, defineSvityloAnatomy } from './ui/atlas-element.js';
import type { ViewState } from './schema/index.js';

export * from './core/index.js';
export {
  DEFAULT_DATA_URL,
  DEFAULT_DATA_VERSION,
  SvityloAnatomyElement,
  defineSvityloAnatomy,
  type ShareUrlBuilder,
} from './ui/atlas-element.js';
export { UI_STRINGS, resolveStrings, type UiLang, type UiStrings } from './ui/i18n.js';
export {
  STATE_LIMITS,
  STATE_SCHEMA_VERSION,
  StateFormatError,
  decodeState,
  encodeState,
  parseViewState,
  type Lang,
  type Manifest,
  type Quality,
  type ViewState,
} from './schema/index.js';

defineSvityloAnatomy();

declare global {
  interface HTMLElementTagNameMap {
    'svitylo-anatomy': SvityloAnatomyElement;
  }
  /** DOM events of <svitylo-anatomy> (bubbles, composed). */
  interface HTMLElementEventMap {
    'anatomy:select': CustomEvent<SelectEvent>;
    'anatomy:hover': CustomEvent<HoverEvent>;
    'anatomy:visibility': CustomEvent<VisibilityEvent>;
    'anatomy:surroundings': CustomEvent<SurroundingsEvent>;
    'anatomy:camera': CustomEvent<CameraEvent>;
    'anatomy:statechange': CustomEvent<StateChangeEvent>;
    'anatomy:progress': CustomEvent<ProgressEvent>;
    'anatomy:ready': CustomEvent<ReadyEvent>;
    'anatomy:error': CustomEvent<ErrorEvent>;
    /** Embed "Open" (cancelable): `preventDefault()` to show the view in a page-owned window. */
    'anatomy:expand': CustomEvent<{ state: ViewState | null }>;
  }
}
