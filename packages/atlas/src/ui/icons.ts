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
import { svg, type SVGTemplateResult } from 'lit';

const icon = (paths: SVGTemplateResult) =>
  svg`<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  menu: icon(svg`<line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line>`),
  search: icon(svg`<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>`),
  eye: icon(svg`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>`),
  eyeOff: icon(svg`<path d="M3 3l18 18"></path><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"></path><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>`),
  eyeAdd: icon(svg`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke-dasharray="3 3"></path><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line>`),
  chevronRight: icon(svg`<polyline points="9 6 15 12 9 18"></polyline>`),
  chevronDown: icon(svg`<polyline points="6 9 12 15 18 9"></polyline>`),
  chevronUp: icon(svg`<polyline points="6 15 12 9 18 15"></polyline>`),
  minus: icon(svg`<line x1="5" y1="12" x2="19" y2="12"></line>`),
  plus: icon(svg`<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`),
  close: icon(svg`<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>`),
  share: icon(svg`<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line>`),
  reset: icon(svg`<path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 3 3 9 9 9"></polyline>`),
  fullscreen: icon(svg`<polyline points="4 9 4 4 9 4"></polyline><polyline points="15 4 20 4 20 9"></polyline><polyline points="20 15 20 20 15 20"></polyline><polyline points="9 20 4 20 4 15"></polyline>`),
  exitFullscreen: icon(svg`<polyline points="9 4 9 9 4 9"></polyline><polyline points="20 9 15 9 15 4"></polyline><polyline points="15 20 15 15 20 15"></polyline><polyline points="4 15 9 15 9 20"></polyline>`),
  focus: icon(svg`<circle cx="12" cy="12" r="3"></circle><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"></path>`),
  zoomIn: icon(svg`<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>`),
  zoomOut: icon(svg`<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line><line x1="8" y1="11" x2="14" y2="11"></line>`),
  cube: icon(svg`<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"></path><polyline points="3.5 7 12 11.5 20.5 7"></polyline><line x1="12" y1="11.5" x2="12" y2="21.5"></line>`),
  ghost: icon(svg`<rect x="3" y="3" width="13" height="13" rx="2" opacity="0.5"></rect><rect x="8" y="8" width="13" height="13" rx="2"></rect>`),
  isolate: icon(svg`<circle cx="12" cy="12" r="4"></circle><circle cx="12" cy="12" r="9" stroke-dasharray="2 3"></circle>`),
  info: icon(svg`<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="7.5" r="0.6" fill="currentColor"></circle>`),
  book: icon(svg`<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 19.5V21.5"></path><line x1="8" y1="7" x2="16" y2="7"></line>`),
  download: icon(svg`<path d="M12 3v12"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="4" y1="20" x2="20" y2="20"></line>`),
  layersAll: icon(svg`<polygon points="12 3 21 8 12 13 3 8 12 3"></polygon><polyline points="3 13 12 18 21 13"></polyline><polyline points="3 17.5 12 22 21 17.5"></polyline>`),
  rotateLeft: icon(svg`<path d="M4 12a8 8 0 1 0 2.3-5.7"></path><polyline points="4 3 4 8 9 8"></polyline>`),
  rotateRight: icon(svg`<path d="M20 12a8 8 0 1 1-2.3-5.7"></path><polyline points="20 3 20 8 15 8"></polyline>`),
  // Panel toggles (the sidebar icons of the Svitylo design system; the right ones are mirrored).
  panelLeftClose: icon(svg`<path d="M8 10 6 12l2 2M11 5v14m-7 0h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"></path>`),
  panelLeftOpen: icon(svg`<path d="m6 10 2 2-2 2M11 5v14m-7 0h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"></path>`),
  panelRightClose: icon(svg`<g transform="matrix(-1 0 0 1 24 0)"><path d="M8 10 6 12l2 2M11 5v14m-7 0h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"></path></g>`),
  panelRightOpen: icon(svg`<g transform="matrix(-1 0 0 1 24 0)"><path d="m6 10 2 2-2 2M11 5v14m-7 0h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z"></path></g>`),
  settings: icon(svg`<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`),
  /** Everything visible fits the view ("overall view"). */
  fit: icon(svg`<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"></path><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"></rect>`),
  warning: icon(svg`<path d="M12 3l10 18H2z"></path><line x1="12" y1="10" x2="12" y2="14"></line><circle cx="12" cy="17.5" r="0.6" fill="currentColor"></circle>`),
};
