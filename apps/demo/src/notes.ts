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
 * Demo note: Markdown with atlas embeds, rendered in the browser with markdown-it and the
 * `@authorod/svitylo-anatomy-markdown` plugin; an HTML fragment as a rich text editor stores it
 * is upgraded with `upgradeAnatomyBlocks`. On wide screens "Open" shows the view in a page-owned
 * window (an example of handling `anatomy:expand`; phones keep the built-in fullscreen).
 */
import MarkdownIt from 'markdown-it';
import { upgradeAnatomyBlocks } from '@authorod/svitylo-anatomy-markdown';
import { anatomyPlugin } from '@authorod/svitylo-anatomy-markdown/markdown-it';
// Importing the library registers <svitylo-anatomy>; embeds still load nothing until started.
import { DEFAULT_DATA_URL, DEFAULT_DATA_VERSION, encodeState, type ViewState } from '@authorod/svitylo-3d-anatomy-atlas';

const params = new URLSearchParams(location.search);
const fixture = import.meta.env.DEV && params.get('data') === 'fixture';
const dataUrl = fixture ? '/test-data/1.0.0/' : DEFAULT_DATA_URL;
const data = fixture ? { model: 'fixture', version: '1.0.0' } : { model: 'adult-male', version: DEFAULT_DATA_VERSION };
const ids = fixture
  ? { heart: 'cardiovascular.heart', ventricle: 'cardiovascular.heart.left_ventricle', skeleton: 'skeletal' }
  : { heart: 'cardiovascular.heart', ventricle: 'cardiovascular.left_ventricle', skeleton: 'skeletal' };
const atlasPage = new URL('./', location.href).href.replace(/\/$/, '');

// A view as the atlas "Share" button would produce it.
const sharedView: ViewState = {
  v: 2,
  data,
  scene: [ids.heart],
  selected: [ids.ventricle],
  surroundings: { level: 2, transparency: 0.78 },
  lang: 'uk',
};
const shareLink = `${atlasPage}/#s=${await encodeState(sharedView)}`;

const note = `# Серце

Серце — порожнистий м'язовий орган у середостінні. Вставка нижче нічого не завантажує, доки ви не
натиснете «Показати 3D».

\`\`\`anatomy
structure: ${ids.heart}
label: Серце
caption: Серце. Вставка з конспекту: оберніть модель, торкніться структури, «Відкрити» — повний атлас.
\`\`\`

## Лівий шлуночок

Лівий шлуночок у прозорому оточенні найближчої батьківської групи, вигляд зліва.

\`\`\`anatomy
structure: ${ids.ventricle}
surroundings: 1
view: left
height: 360
label: Лівий шлуночок
caption: Лівий шлуночок в оточенні
\`\`\`

## Точний вигляд з атласу

Посилання «Поділитися», вставлене окремим рядком, стає вставкою з тим самим виглядом:

${shareLink}

## Блок у HTML, як його зберігає редактор
`;

const md = new MarkdownIt({ linkify: true }).use(anatomyPlugin, { dataUrl, lang: 'uk', shareUrls: [atlasPage] });
const main = document.getElementById('note')!;
main.innerHTML = md.render(note);

// The same block stored as HTML (a rich text editor with HTML data), upgraded on the page.
const pre = document.createElement('pre');
const code = document.createElement('code');
code.className = 'language-anatomy';
code.textContent = `system: ${ids.skeleton}\nlabel: Скелет\ncaption: Скелет (блок з HTML)`;
pre.append(code);
main.append(pre);
upgradeAnatomyBlocks(main, { dataUrl, lang: 'uk' });

// The note page is light: its atlases (also when opened on the whole screen) use the light theme.
for (const atlas of main.querySelectorAll('svitylo-anatomy')) atlas.setAttribute('theme', 'light');

const source = document.createElement('p');
source.className = 'source';
source.textContent = 'Дані: Z-Anatomy (CC BY-SA 4.0). Статуси перевірки й джерела — у повному атласі.';
main.append(source);

/** Wide screens: "Open" shows the embed's view in a movable, resizable window. */
function openWindow(state: ViewState | null) {
  document.querySelector('.atlas-window')?.remove();
  const win = document.createElement('section');
  win.className = 'atlas-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Атлас');
  const bar = document.createElement('div');
  bar.className = 'atlas-window-bar';
  const title = document.createElement('span');
  title.textContent = 'Атлас';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Закрити';
  close.addEventListener('click', () => win.remove());
  bar.append(title, close);
  const atlas = document.createElement('svitylo-anatomy');
  atlas.setAttribute('layout', 'full');
  atlas.setAttribute('data-url', dataUrl);
  atlas.setAttribute('lang', 'uk');
  atlas.setAttribute('theme', 'light');
  win.append(bar, atlas);
  document.body.append(win);
  if (state) void encodeState(state).then((encoded) => atlas.setAttribute('state', encoded));
  // Move by dragging the bar.
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = win.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    win.style.left = `${Math.max(0, drag.left + e.clientX - drag.x)}px`;
    win.style.top = `${Math.max(0, drag.top + e.clientY - drag.y)}px`;
  });
  bar.addEventListener('pointerup', () => (drag = null));
  close.focus();
}

document.addEventListener('anatomy:expand', (e) => {
  if (!window.matchMedia('(min-width: 900px)').matches) return; // phones: built-in fullscreen
  e.preventDefault();
  openWindow((e as CustomEvent<{ state: ViewState | null }>).detail.state);
});
