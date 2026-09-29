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
import type { Lang, Quality, Vec3, ViewState } from '../schema/index.js';
import type { AtlasErrorCode, AtlasErrorDetails } from './errors.js';

/** What caused a change; lets integrations tell user actions from programmatic ones. */
export type ChangeSource = 'api' | 'pointer' | 'keyboard' | 'tree' | 'search' | 'state' | 'reset' | 'ui';

export interface SelectEvent {
  ids: string[];
  primary: string | null;
  source: ChangeSource;
}

export interface HoverEvent {
  id: string | null;
}

export interface VisibilityEvent {
  /** Number of structures currently drawn (opaque or ghost). */
  visible: number;
  scene: string[];
  hidden: string[];
  isolate: string[] | null;
  source: ChangeSource;
}

export interface CameraEvent {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface StateChangeEvent {
  state: ViewState;
  source: ChangeSource;
}

export type LoadPhase = 'idle' | 'loading' | 'complete' | 'cancelled' | 'error';

export interface ProgressEvent {
  phase: LoadPhase;
  /** Files requested by the current view. */
  totalFiles: number;
  loadedFiles: number;
  failedFiles: number;
  totalBytes: number;
  loadedBytes: number;
  quality: Quality;
}

export interface ReadyEvent {
  /**
   * `ui`: metadata, dictionaries and search are ready (no geometry implied).
   * `scene`: the geometry of the requested view is ready — never "the whole body" unless
   * `request` is `loadAll`.
   */
  kind: 'ui' | 'scene';
  request?: string;
  complete?: boolean;
}

export interface ErrorEvent extends AtlasErrorDetails {
  code: AtlasErrorCode;
  message: string;
}

/** The surroundings of the selection (`AtlasViewer.surroundings`). */
export interface SurroundingsInfo {
  /**
   * Level of the view: 0 = only the selection, 1 = the nearest groups of every selected
   * structure … `levels.length` = the whole body; null without a selection. When not `explicit`,
   * it is derived from what is visible.
   */
  level: number | null;
  /**
   * The level was chosen (`setSurroundingsLevel`): it limits what is shown around the selection,
   * and the next selections keep it until the level goes back to automatic.
   */
  explicit: boolean;
  /** Group IDs of each level from 1 (index 0) up; `null` = the whole body. */
  levels: (string[] | null)[];
  /** Transparency of everything that is not selected: 0 = opaque. */
  transparency: number;
}

export interface SurroundingsEvent extends SurroundingsInfo {
  source: ChangeSource;
}

export interface QualityEvent {
  quality: Quality;
}

/** Names display: the language and whether Latin names are shown alongside. */
export interface LangEvent {
  lang: Lang;
  latin: boolean;
}

export interface AtlasEventMap {
  select: SelectEvent;
  hover: HoverEvent;
  visibility: VisibilityEvent;
  camera: CameraEvent;
  statechange: StateChangeEvent;
  progress: ProgressEvent;
  ready: ReadyEvent;
  error: ErrorEvent;
  surroundings: SurroundingsEvent;
  quality: QualityEvent;
  lang: LangEvent;
}

export type AtlasEventName = keyof AtlasEventMap;
export type Unsubscribe = () => void;

/** Minimal typed emitter; every subscription returns its own unsubscribe function. */
export class Emitter<M extends object> {
  private handlers = new Map<keyof M, Set<(detail: never) => void>>();

  on<K extends keyof M>(type: K, handler: (detail: M[K]) => void): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (detail: never) => void);
    return () => {
      set.delete(handler as (detail: never) => void);
    };
  }

  emit<K extends keyof M>(type: K, detail: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as (d: M[K]) => void)(detail);
      } catch (error) {
        // A failing subscriber must not break the viewer or other subscribers.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Calls `fn` at most once per `interval` ms with the latest arguments (leading + trailing). */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, interval: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    timer = null;
    last = Date.now();
    const args = pending;
    pending = null;
    if (args) fn(...args);
  };
  const throttled = (...args: A) => {
    pending = args;
    const wait = interval - (Date.now() - last);
    if (wait <= 0 && !timer) run();
    else if (!timer) timer = setTimeout(run, Math.max(wait, 0));
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      run();
    }
  };
  return throttled;
}

/** Delays `fn` until calls stop for `wait` ms. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const debounced = (...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = pending;
      pending = null;
      if (a) fn(...a);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      const a = pending;
      pending = null;
      if (a) fn(...a);
    }
  };
  return debounced;
}
