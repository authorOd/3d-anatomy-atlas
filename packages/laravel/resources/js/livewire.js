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
// @ts-check
/**
 * Browser half of the Livewire integration of authorod/svitylo-anatomy-laravel (plain ES module,
 * no imports, no dependency on Livewire itself):
 *
 * - events of every <svitylo-anatomy> on the page become Livewire events `anatomy-select`,
 *   `anatomy-surroundings`, `anatomy-statechange` (their fields plus `atlas`, the element id);
 * - the browser event `anatomy-command` (sent by `$this->anatomy('id')->showStructure(…)`, see
 *   src/Livewire/AnatomyCommands.php) calls one of the allowed public methods of that atlas.
 *
 * The atlas elements themselves carry `wire:ignore`: Livewire updates never touch a 3D scene,
 * and `wire:navigate` / `@persist` work through the element's own lifecycle.
 *
 *     import { installLivewireBridge } from '../../vendor/authorod/svitylo-anatomy-laravel/resources/js/livewire.js';
 *     installLivewireBridge();
 */

/** Atlas events forwarded to Livewire by default. */
export const LIVEWIRE_EVENTS = /** @type {const} */ (['select', 'surroundings', 'statechange']);

/** Public methods of <svitylo-anatomy> that a command may call (AnatomyCommands::METHODS). */
export const LIVEWIRE_METHODS = /** @type {const} */ ([
  'showStructure',
  'showSystem',
  'showSurroundings',
  'setSurroundingsLevel',
  'setTransparency',
  'exitSurroundings',
  'select',
  'focusOn',
  'setView',
  'setState',
  'reset',
  'loadAll',
  'isolate',
  'clearIsolation',
  'hide',
  'show',
  'showHidden',
]);

/**
 * @typedef {{ dispatch(name: string, params?: Record<string, unknown>): void }} LivewireLike
 * @typedef {{ atlas?: string | null, method?: string, args?: unknown[] }} CommandDetail
 */

/**
 * Installs the bridge; returns a function that removes it.
 * @param {{ events?: readonly string[], livewire?: () => LivewireLike | undefined }} [options]
 *   `events`: atlas events forwarded to Livewire (default: select, surroundings, statechange);
 *   `livewire`: the Livewire object (default: `window.Livewire` at the time of the event).
 * @returns {() => void}
 */
export function installLivewireBridge(options = {}) {
  const livewire = options.livewire ?? (() => /** @type {{ Livewire?: LivewireLike }} */ (globalThis).Livewire);
  /** @type {(() => void)[]} */
  const cleanups = [];

  for (const type of options.events ?? LIVEWIRE_EVENTS) {
    /** @param {Event} event */
    const handler = (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (!target || target.localName !== 'svitylo-anatomy') return;
      const detail = /** @type {CustomEvent<Record<string, unknown> | null>} */ (event).detail ?? {};
      livewire()?.dispatch(`anatomy-${type}`, { ...detail, atlas: target.id || null });
    };
    document.addEventListener(`anatomy:${type}`, handler);
    cleanups.push(() => document.removeEventListener(`anatomy:${type}`, handler));
  }

  /** @param {Event} event */
  const onCommand = (event) => {
    const detail = /** @type {CustomEvent<CommandDetail | CommandDetail[] | null>} */ (event).detail ?? {};
    // Livewire 3 passed parameters as an array; Livewire 4 passes an object.
    const { atlas, method, args } = Array.isArray(detail) ? (detail[0] ?? {}) : detail;
    if (!method || !(/** @type {readonly string[]} */ (LIVEWIRE_METHODS)).includes(method)) return;
    const element = atlas ? document.getElementById(atlas) : document.querySelector('svitylo-anatomy');
    if (!element || element.localName !== 'svitylo-anatomy') return;
    const call = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (element))[method];
    if (typeof call !== 'function') return;
    try {
      const result = call.apply(element, Array.isArray(args) ? args : []);
      if (result instanceof Promise) result.catch((error) => console.warn(`svitylo-anatomy: ${method} failed`, error));
    } catch (error) {
      console.warn(`svitylo-anatomy: ${method} failed`, error);
    }
  };
  window.addEventListener('anatomy-command', onCommand);
  cleanups.push(() => window.removeEventListener('anatomy-command', onCommand));

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
