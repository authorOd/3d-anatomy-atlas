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
 * Demo site: a minimal consumer of the atlas without any server-side logic.
 * The view state travels in the URL fragment (#s=…), so shared links never reach a server.
 */
const atlas = document.getElementById('atlas')!;
const params = new URLSearchParams(location.search);

// Development only: `?data=` picks one of the fixture datasets; a link never passes its own URL.
const DATASETS: Record<string, string> = import.meta.env.DEV
  ? { fixture: '/test-data/1.0.0/', 'fixture-next': '/test-data/1.1.0/' }
  : {};
const dataset = params.get('data');
if (dataset && dataset in DATASETS) atlas.setAttribute('data-url', DATASETS[dataset]!);
const uiLang = params.get('ui');
if (uiLang === 'en' || uiLang === 'uk') atlas.setAttribute('ui-lang', uiLang);
const termLang = params.get('lang');
if (termLang === 'en' || termLang === 'uk' || termLang === 'la') atlas.setAttribute('lang', termLang);
// ?theme=light|dark previews a theme; without it the atlas follows the system colour scheme.
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') {
  atlas.setAttribute('theme', theme);
  document.documentElement.style.colorScheme = theme;
  document.body.style.background = theme === 'dark' ? '#161c29' : '#f9fafb';
}

const stateFromHash = () => new URLSearchParams(location.hash.slice(1)).get('s');
const initial = stateFromHash();
if (initial) atlas.setAttribute('state', initial);

window.addEventListener('hashchange', () => {
  const next = stateFromHash();
  if (next && next !== atlas.getAttribute('state')) atlas.setAttribute('state', next);
});

// Register the element only after the attributes are in place (registration loads nothing).
await import('@authorod/svitylo-3d-anatomy-atlas');
