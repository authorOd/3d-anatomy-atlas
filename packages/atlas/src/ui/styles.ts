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
import { css } from 'lit';

/*
 * Design tokens of the Svitylo design system (svitylo resources/css/colors.css): surfaces,
 * lines, text, the primary blue and the light buttons, in a light and a dark theme. The 3D scene
 * stays dark in both themes, so the model and its translucent surroundings keep their contrast.
 * The public --svitylo-anatomy-* properties override the tokens of either theme.
 */
const lightTokens = css`
  color-scheme: light;
  --_app: var(--svitylo-anatomy-bg, #f9fafb);
  --_surface: var(--svitylo-anatomy-panel-bg, #ffffff);
  --_surface-2: #f9fafb;
  --_surface-3: #f3f4f6;
  --_surface-4: #ecedf1;
  --_line: var(--svitylo-anatomy-border, #e5e7eb);
  --_line-strong: #d1d5db;
  --_text: var(--svitylo-anatomy-text, #111827);
  --_text-2: #374151;
  --_muted: var(--svitylo-anatomy-muted, #6b7280);
  --_primary: var(--svitylo-anatomy-accent, #0151fe);
  --_primary-hover: #003ab6;
  --_on-primary: #ffffff;
  --_soft: #e5edff;
  --_soft-hover: #d4e2ff;
  --_on-soft: #003ab6;
  --_grey: #f3f4f6;
  --_grey-hover: #e5e7eb;
  --_on-grey: #374151;
  --_focus: var(--svitylo-anatomy-focus, #0151fe);
  --_link: var(--svitylo-anatomy-link, #0048e4);
  --_danger: #e02424;
  --_danger-soft: #fde8e8;
  --_on-danger-soft: #9b1c1c;
  --_warn-soft: #fdf6b2;
  --_on-warn-soft: #723b13;
  --_draft-line: #e3a008;
  --_tooltip: #111928;
  --_on-tooltip: #ffffff;
  --_shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
  --_shadow-lg: 0 12px 24px -6px rgba(16, 24, 40, 0.18), 0 4px 8px -4px rgba(16, 24, 40, 0.1);
  --_backdrop: rgba(1, 12, 28, 0.7);
`;

const darkTokens = css`
  color-scheme: dark;
  --_app: var(--svitylo-anatomy-bg, #161c29);
  --_surface: var(--svitylo-anatomy-panel-bg, #141924);
  --_surface-2: #161c29;
  --_surface-3: #1c2433;
  --_surface-4: #242b3a;
  --_line: var(--svitylo-anatomy-border, #273242);
  --_line-strong: #374151;
  --_text: var(--svitylo-anatomy-text, #eaeaea);
  --_text-2: #d1d5db;
  --_muted: var(--svitylo-anatomy-muted, #9ca3af);
  --_primary: var(--svitylo-anatomy-accent, #3977ff);
  --_primary-hover: #0e4acd;
  --_on-primary: #ffffff;
  --_soft: #002d8f;
  --_soft-hover: #003ab6;
  --_on-soft: #a8c3ff;
  --_grey: #242b3a;
  --_grey-hover: #374151;
  --_on-grey: #d1d5db;
  --_focus: var(--svitylo-anatomy-focus, #3977ff);
  --_link: var(--svitylo-anatomy-link, #a8c3ff);
  --_danger: #f98080;
  --_danger-soft: #771d1d;
  --_on-danger-soft: #f8b4b4;
  --_warn-soft: #633112;
  --_on-warn-soft: #fce96a;
  --_draft-line: #faca15;
  --_tooltip: #242b3a;
  --_on-tooltip: #eaeaea;
  --_shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  --_shadow-lg: 0 14px 30px -8px rgba(0, 0, 0, 0.6), 0 4px 10px -4px rgba(0, 0, 0, 0.4);
  --_backdrop: rgba(1, 6, 16, 0.72);
`;

/** Tokens shared by the element and its parts (tree, search, cards): the theme and the scene. */
export const themeStyles = css`
  :host {
    ${lightTokens}
    --_radius: var(--svitylo-anatomy-radius, 8px);
    --_radius-lg: 12px;
    --_scene: var(--svitylo-anatomy-scene-bg, #0e1320);
    --_font: var(
      --svitylo-anatomy-font,
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      'Noto Sans',
      sans-serif
    );
  }
  @media (prefers-color-scheme: dark) {
    :host(:not([theme='light'])) {
      ${darkTokens}
    }
  }
  :host([theme='dark']) {
    ${darkTokens}
  }
`;

export const elementStyles = css`
  ${themeStyles}
  :host {
    display: block;
    position: relative;
    /* Own stacking context: the logo stays on top inside the atlas, never over the page's dialogs. */
    isolation: isolate;
    height: 100%;
    min-height: 420px;
    overflow: hidden;
    container-type: inline-size;
    background: var(--_app);
    color: var(--_text);
    font-family: var(--_font);
    font-size: var(--svitylo-anatomy-font-size, 14px);
    line-height: 1.45;
    -webkit-tap-highlight-color: transparent;
  }
  :host([data-pseudo-fullscreen]) {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    height: 100dvh;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  button,
  select,
  input {
    font: inherit;
    color: inherit;
  }
  :focus-visible {
    outline: 2px solid var(--_focus);
    outline-offset: 2px;
  }
  .icon {
    width: 20px;
    height: 20px;
    flex: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
  [hidden] {
    display: none !important;
  }

  /* ------------------------------------------------------------------ buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 40px;
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--_radius);
    background: var(--_grey);
    color: var(--_on-grey);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }
  .btn:hover {
    background: var(--_grey-hover);
  }
  .btn.ghost {
    background: transparent;
    color: var(--_text-2);
  }
  .btn.ghost:hover {
    background: var(--_surface-3);
    color: var(--_text);
  }
  .btn.primary {
    background: var(--_primary);
    color: var(--_on-primary);
    font-weight: 600;
  }
  .btn.primary:hover {
    background: var(--_primary-hover);
  }
  .btn[aria-pressed='true'],
  .btn[aria-expanded='true'].settings-button {
    background: var(--_soft);
    color: var(--_on-soft);
  }
  .btn[aria-pressed='true']:hover {
    background: var(--_soft-hover);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
  }
  .btn.small {
    min-width: 32px;
    min-height: 32px;
    padding: 0 10px;
    gap: 6px;
    font-size: 13px;
  }
  .btn.small .icon {
    width: 18px;
    height: 18px;
  }
  .btn.icon-only {
    padding: 0;
  }
  .badge-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--_primary);
    color: var(--_on-primary);
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    text-align: center;
  }

  /* ------------------------------------------------------------------ layout */
  .shell {
    --_left-w: var(--_left-size, var(--svitylo-anatomy-panel-width, 300px));
    --_right-w: var(--svitylo-anatomy-info-width, 340px);
    position: relative;
    display: grid;
    grid-template-columns: var(--_left-w) minmax(0, 1fr) var(--_right-w);
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }
  .shell[data-left-collapsed] {
    --_left-w: 0px;
  }
  .shell[data-left-collapsed] > aside.panel {
    display: none;
  }
  .shell[data-right-collapsed] {
    --_right-w: 0px;
  }
  .shell[data-right-collapsed] > aside.info {
    display: none;
  }

  /* ------------------------------------------------------------------ top bar */
  header.bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    /* 64px with the border, as the Svitylo navbar. */
    min-height: calc(64px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));
    background: var(--_surface);
    border-bottom: 1px solid var(--_line);
  }
  header svitylo-anatomy-search {
    flex: 1 1 260px;
    max-width: 560px;
    min-width: 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  .panel-toggle {
    position: relative;
  }
  .panel-toggle .badge-count {
    position: absolute;
    top: 2px;
    right: 0;
  }
  .menu-anchor {
    position: relative;
  }
  .popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 300px;
    max-width: calc(100cqw - 24px);
    padding: 8px;
    border: 1px solid var(--_line);
    border-radius: var(--_radius-lg);
    background: var(--_surface);
    color: var(--_text);
    box-shadow: var(--_shadow-lg);
  }
  .popover-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--_line);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--_radius);
    background: transparent;
    color: var(--_text-2);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .menu-item:hover {
    background: var(--_surface-3);
    color: var(--_text);
  }
  .menu-item:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .field,
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 4px 10px;
    border-radius: var(--_radius);
    font-size: 14px;
    color: var(--_text-2);
  }
  .toggle-row {
    cursor: pointer;
  }
  .toggle-row:hover {
    background: var(--_surface-3);
  }
  .toggle-row small {
    display: block;
    font-size: 12px;
    line-height: 1.35;
    color: var(--_muted);
  }
  select.lang {
    min-height: 36px;
    padding: 0 8px;
    border: 1px solid var(--_line-strong);
    border-radius: var(--_radius);
    background: var(--_surface-2);
    color: var(--_text);
  }
  /* A checkbox drawn as a switch (role="switch"). */
  input.switch {
    appearance: none;
    flex: none;
    position: relative;
    width: 40px;
    height: 22px;
    margin: 0;
    border-radius: 999px;
    background: var(--_line-strong);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  input.switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease;
  }
  input.switch:checked {
    background: var(--_primary);
  }
  input.switch:checked::after {
    transform: translateX(18px);
  }
  input.switch:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ------------------------------------------------------------------ left panel */
  aside.panel {
    grid-column: 1;
    grid-row: 2;
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 8px max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
    background: var(--_surface);
    border-right: 1px solid var(--_line);
  }
  aside.panel svitylo-anatomy-tree {
    flex: 1;
    min-height: 0;
  }
  .panel-head {
    display: none;
  }
  .panel-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .panel-status,
  .visibility-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .panel-status:empty,
  .visibility-status:empty {
    display: none;
  }
  .status-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 4px 4px 4px 12px;
    border-radius: var(--_radius);
    background: var(--_surface-2);
    border: 1px solid var(--_line);
    font-size: 13px;
    color: var(--_text-2);
  }
  .status-line > span {
    min-width: 0;
  }
  button.status-line.action {
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    padding: 4px 12px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  button.status-line.action:hover {
    background: var(--_surface-3);
    color: var(--_text);
  }
  .status-line .icon {
    width: 18px;
    height: 18px;
  }
  .panel-notice {
    flex: none;
    margin: 0 4px;
    padding-top: 8px;
    border-top: 1px solid var(--_line);
    font-size: 12px;
    line-height: 1.4;
    color: var(--_muted);
  }
  .panel-notice .legend {
    display: block;
    margin-top: 4px;
  }
  .panel-notice .sample {
    color: var(--_text);
    text-decoration: underline dotted;
    text-decoration-color: var(--_draft-line);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }
  .resize-handle {
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    z-index: 6;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: transparent;
    transition: background-color 0.15s ease;
  }
  .resize-handle:hover::after,
  .resize-handle:focus-visible::after,
  .resize-handle[data-active]::after {
    background: var(--_primary);
  }
  .resize-handle:focus-visible {
    outline: none;
  }

  /* ------------------------------------------------------------------ banners (progress, notices) */
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 12px;
    border-radius: var(--_radius);
    background: var(--_surface-2);
    border: 1px solid var(--_line);
    font-size: 13px;
    color: var(--_text-2);
  }
  .banner > span {
    flex: 1 1 auto;
    min-width: 0;
  }
  .banner[data-kind='error'] {
    background: var(--_danger-soft);
    border-color: transparent;
    color: var(--_on-danger-soft);
  }
  .banner .btn {
    min-height: 32px;
    min-width: 32px;
    font-size: 13px;
  }
  .banner .btn.icon-only .icon {
    width: 18px;
    height: 18px;
  }
  .bar-progress {
    flex: none;
    width: 72px;
    height: 6px;
    border-radius: 3px;
    background: var(--_line);
    overflow: hidden;
  }
  .bar-progress > span {
    display: block;
    height: 100%;
    background: var(--_primary);
  }

  /* ------------------------------------------------------------------ stage */
  main.stage {
    grid-column: 2;
    grid-row: 2;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--_scene);
    container: stage / inline-size;
  }
  .viewport {
    position: absolute;
    inset: 0;
    outline: none;
  }
  .viewport:focus-visible {
    box-shadow: inset 0 0 0 2px var(--_focus);
  }
  .progress-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
  }
  .progress-line > span {
    display: block;
    height: 100%;
    background: #3977ff;
    transition: width 0.2s ease;
  }
  .center {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    pointer-events: none;
  }
  /* Cards and controls over the always dark scene: frosted dark glass. */
  .card,
  .glass {
    background: rgba(20, 25, 36, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: #eaeaea;
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .card,
    .glass {
      background: rgba(20, 25, 36, 0.94);
    }
  }
  .card {
    pointer-events: auto;
    max-width: 440px;
    padding: 24px 24px 20px;
    border-radius: 16px;
    text-align: center;
  }
  .card h2 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
  }
  .card p {
    margin: 0 0 16px;
    color: #9ca3af;
    line-height: 1.5;
  }
  .card .btn.primary {
    min-height: 44px;
    padding: 0 20px;
    background: #3977ff;
  }
  .card .btn.primary:hover {
    background: #0e4acd;
  }
  /* Progress and notices over the scene when the structures panel is not shown. */
  .status {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    pointer-events: none;
  }
  .status .banner {
    pointer-events: auto;
    max-width: min(560px, 100%);
    background: rgba(20, 25, 36, 0.86);
    border-color: rgba(255, 255, 255, 0.1);
    color: #eaeaea;
  }
  .status .banner[data-kind='error'] {
    background: rgba(119, 29, 29, 0.92);
    color: #fde8e8;
  }
  .status .banner .btn {
    background: rgba(255, 255, 255, 0.1);
    color: #eaeaea;
  }

  /*
   * Camera bar: views, zoom, overall view and the transparency of the surroundings — a frosted pill at
   * the bottom centre of the scene. Two equal spacers centre it; the right one never gets
   * narrower than the logo, so on a medium scene the pill slides left just enough to clear it,
   * and on a narrow one its text labels shorten. Menus open above it, centred on the scene.
   */
  .scene-controls {
    position: absolute;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: 4;
    display: flex;
    pointer-events: none;
  }
  .scene-controls::before,
  .scene-controls::after {
    content: '';
    flex: 1 1 0;
  }
  /* The logo (111px wide) and a gap. */
  .scene-controls::after {
    min-width: 123px;
  }
  .pill {
    flex: 0 1 auto;
    min-width: 0;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
  }
  .pill > * {
    flex: none;
  }
  .pill-btn {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #d1d5db;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }
  /* Buttons with a text label: the current view. */
  .pill-btn.text {
    display: flex;
    align-items: center;
    gap: 6px;
    width: auto;
    min-width: 0;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  .pill-btn.text .icon {
    flex: none;
  }
  .pill-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Transparency of the surroundings: a slider on the bar (in its menu on narrow layouts). */
  .transparency {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 38px;
    padding: 0 10px 0 8px;
    color: #d1d5db;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .pill > .transparency {
    flex: 0 1 auto;
  }
  .transparency .icon {
    opacity: 0.8;
  }
  .transparency[data-active] .icon {
    color: #a8c3ff;
    opacity: 1;
  }
  .transparency input[type='range'] {
    flex: 1 1 112px;
    width: 112px;
    min-width: 48px;
    margin: 0;
    accent-color: #3977ff;
  }
  .transparency-value {
    flex: none;
    min-width: 2.6em;
    text-align: end;
  }
  .views-button .icon {
    width: 16px;
    height: 16px;
    opacity: 0.8;
  }
  .pill-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }
  .pill-btn[aria-pressed='true'],
  .pill-btn[aria-expanded='true'],
  .pill-btn[data-active] {
    background: rgba(57, 119, 255, 0.4);
    color: #ffffff;
  }
  .pill-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pill-btn:focus-visible {
    outline: 2px solid #a8c3ff;
    outline-offset: 0;
  }
  .pill .sep {
    flex: none;
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: rgba(255, 255, 255, 0.16);
  }
  /*
   * Menus of the bar, centred above it on the scene: dark like the bar whatever the page theme
   * (fixed values, so page overrides of the theme do not reach the dark scene).
   */
  .pill-popover {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    transform: translateX(-50%);
    pointer-events: auto;
    padding: 6px;
    border-radius: 16px;
    color-scheme: dark;
    --_text: #eaeaea;
    --_text-2: #d1d5db;
    --_muted: #9ca3af;
    --_line: rgba(255, 255, 255, 0.14);
    --_line-strong: #4b5563;
    --_surface: rgba(255, 255, 255, 0.06);
    --_surface-2: rgba(255, 255, 255, 0.04);
    --_surface-3: rgba(255, 255, 255, 0.12);
    --_surface-4: #374151;
    --_grey: rgba(255, 255, 255, 0.08);
    --_grey-hover: rgba(255, 255, 255, 0.16);
    --_on-grey: #eaeaea;
    --_primary: #3977ff;
    --_focus: #a8c3ff;
    color: var(--_text);
  }
  .views-popover {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    width: 248px;
  }
  .views-popover .menu-item {
    justify-content: center;
    color: #d1d5db;
  }
  .views-popover .menu-item:hover,
  .views-popover .menu-item[aria-pressed='true'] {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }
  .views-popover .menu-item[aria-pressed='true'] {
    background: rgba(57, 119, 255, 0.4);
  }
  .transparency-popover {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(320px, calc(100cqw - 24px));
    padding: 10px 12px 4px;
  }
  .transparency-title {
    padding: 0 2px;
    font-size: 13px;
    font-weight: 500;
    color: #eaeaea;
  }
  .transparency-popover .transparency {
    padding: 0 2px;
  }
  .transparency-popover .transparency input[type='range'] {
    width: auto;
  }
  /* The transparency slider is on the bar; on a narrow scene a button opens it above the bar. */
  .transparency-button {
    display: none;
  }
  @container stage (min-width: 541px) {
    .transparency-popover {
      display: none;
    }
  }
  /* A narrow scene (phones, small windows): no zoom buttons — pinch or the wheel zoom. */
  @container stage (max-width: 540px) {
    .zoom-part,
    .pill > .transparency {
      display: none;
    }
    .transparency-button {
      display: grid;
    }
    .scene-controls {
      left: max(12px, env(safe-area-inset-left));
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
    }
    .scene-controls::after {
      min-width: 119px;
    }
  }

  /*
   * Mandatory attribution: always rendered, on top of the scene, not configurable (only the open
   * settings menu of narrow layouts covers the mark in the top corner, as the owner decided).
   */
  a.brand {
    position: absolute;
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: 2147483000;
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 7px 14px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    opacity: 1;
    visibility: visible;
    transform: none;
    text-decoration: none;
  }
  a.brand svg {
    display: block;
    width: 83px;
    height: 24px;
  }
  a.brand:focus-visible {
    outline: 3px solid #a8c3ff;
    outline-offset: 2px;
  }
  /* Narrow layouts of the full atlas: the mark alone, in the top corner of the scene. */
  a.brand[data-short] {
    top: 12px;
    right: max(12px, env(safe-area-inset-right));
    bottom: auto;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
  }
  a.brand[data-short] svg {
    width: 26px;
    height: 26px;
  }
  .stage[data-short-logo] > .status {
    right: calc(max(12px, env(safe-area-inset-right)) + 48px);
  }
  /*
   * Narrow layouts: the surroundings level at the end of the camera bar, in the same block, where
   * wide ones have the logo. The block takes the width of the scene and the level the rest of it;
   * on a scene too narrow for one row the level is the first row of the block.
   */
  .scene-controls[data-level]::before,
  .scene-controls[data-level]::after {
    display: none;
  }
  .scene-controls[data-level] > .pill {
    flex: 1 1 auto;
    max-width: 680px;
    margin: 0 auto;
  }
  .pill > .level-bar {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .level-bar > .pill-btn {
    width: 34px;
  }
  .level-bar .level-short {
    display: none;
  }
  /* A phone: the short label, and the separators between the camera buttons give way to the level. */
  @container stage (max-width: 540px) {
    .scene-controls[data-level] .sep:not(.level-sep),
    .level-bar .level-long {
      display: none;
    }
    .level-bar .level-short {
      display: inline;
    }
  }
  @container stage (max-width: 379px) {
    .scene-controls[data-level] > .pill {
      flex-wrap: wrap;
      border-radius: 24px;
    }
    .pill > .level-bar {
      flex-basis: 100%;
      order: -1;
    }
    .scene-controls[data-level] .level-sep {
      display: none;
    }
  }
  .level-bar > .stepper-label {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 2px;
  }
  .level-bar .stepper-level {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    color: #eaeaea;
  }
  .level-bar .stepper-name {
    font-size: 11px;
    color: #9ca3af;
  }
  .level-bar[data-off] .stepper-level {
    color: #9ca3af;
  }
  /* A chosen level (the next selections keep it). */
  .level-bar[data-explicit] .stepper-level {
    color: #8fb0ff;
  }
  @container stage (max-width: 540px) {
    a.brand {
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
    }
  }

  /* ------------------------------------------------------------------ right panel */
  aside.info {
    grid-column: 3;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px 16px max(16px, env(safe-area-inset-bottom));
    background: var(--_surface);
    border-left: 1px solid var(--_line);
  }
  /* The summary bar is the handle of the narrow-layout sheet only. */
  .sheet-bar {
    display: none;
  }
  .selection-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
    margin-bottom: 12px;
  }
  .selection-head > span {
    font-size: 15px;
    font-weight: 600;
    color: var(--_text);
  }
  .selection-tools {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }
  .tool-row {
    display: flex;
    gap: 8px;
  }
  .tool-row .btn {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 8px;
  }
  .tool-row .btn > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    border-radius: var(--_radius);
    background: var(--_surface);
    border: 1px solid var(--_line);
  }
  .stepper .btn {
    min-width: 36px;
    min-height: 36px;
    background: transparent;
  }
  .stepper .btn:hover {
    background: var(--_surface-3);
  }
  /* Fixed layout: "Level 1 of 3" and the group names change, the buttons around them do not move. */
  .stepper-label {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    padding: 2px 4px;
    text-align: center;
    white-space: nowrap;
    line-height: 1.3;
  }
  .stepper-level {
    font-size: 13px;
    font-weight: 500;
    color: var(--_text-2);
    font-variant-numeric: tabular-nums;
  }
  .stepper-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--_muted);
  }
  .stepper[data-off] .stepper-level {
    color: var(--_muted);
  }
  /* A chosen level (the next selections keep it). */
  .stepper[data-explicit] .stepper-level {
    color: var(--_primary);
  }
  ul.cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .empty-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    padding: 24px 12px;
    border: 1px dashed var(--_line);
    border-radius: var(--_radius-lg);
    text-align: center;
    font-size: 13px;
    color: var(--_muted);
  }
  .empty-hint .icon {
    width: 28px;
    height: 28px;
    color: var(--_line-strong);
  }

  /* ------------------------------------------------------------------ dialogs */
  dialog {
    width: min(720px, calc(100vw - 32px));
    max-height: min(80vh, 760px);
    padding: 0;
    border: 1px solid var(--_line);
    border-radius: 16px;
    background: var(--_surface);
    color: var(--_text);
    box-shadow: var(--_shadow-lg);
  }
  dialog::backdrop {
    background: var(--_backdrop);
  }
  .dialog-head {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--_line);
    background: var(--_surface);
  }
  .dialog-head h2 {
    flex: 1;
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .dialog-body {
    padding: 14px 16px 18px;
    line-height: 1.5;
  }
  .dialog-body a {
    color: var(--_link);
  }
  .asset {
    padding: 12px 0;
    border-bottom: 1px solid var(--_line);
  }
  .asset h3 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  .asset dl {
    display: grid;
    grid-template-columns: minmax(120px, auto) 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
  }
  .asset dt {
    color: var(--_muted);
  }
  .asset dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .share-url {
    display: flex;
    gap: 8px;
  }
  .share-url input {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--_radius);
    border: 1px solid var(--_line-strong);
    background: var(--_surface-2);
  }
  .muted {
    color: var(--_muted);
  }
  .only-narrow {
    display: none !important;
  }

  /* ------------------------------------------------------------------ medium widths */
  @container (max-width: 1180px) {
    .actions .label-text {
      display: none;
    }
    .actions .btn.action {
      padding: 0;
    }
  }

  /*
   * Narrow layout (phones, narrow containers), top to bottom: the header, the 3D area with the
   * camera pill and the logo, and the selection bar. The tree is a drawer; the selection details
   * open over the scene from the bar and never resize it.
   */
  @container (max-width: 820px) {
    .shell {
      display: flex;
      flex-direction: column;
    }
    .only-narrow {
      display: flex !important;
    }
    .wide-only {
      display: none !important;
    }
    .label-text {
      display: none;
    }
    header.bar {
      flex: none;
    }
    header svitylo-anatomy-search {
      flex: 1 1 auto;
      max-width: none;
    }
    main.stage {
      flex: 1 1 auto;
      min-height: 200px;
    }
    .shell[data-left-collapsed] > aside.panel,
    .shell[data-right-collapsed] > aside.info {
      display: flex;
    }
    aside.panel {
      position: absolute;
      z-index: 50;
      top: 0;
      bottom: 0;
      left: 0;
      width: min(88%, 380px);
      transform: translateX(-102%);
      transition: transform 0.2s ease;
      box-shadow: 8px 0 30px rgba(0, 0, 0, 0.35);
      visibility: hidden;
      padding-top: max(10px, env(safe-area-inset-top));
      /* The notice at the foot of the drawer stays clear of the logo. */
      padding-bottom: calc(max(8px, env(safe-area-inset-bottom)) + 8px);
    }
    aside.panel[data-open] {
      transform: none;
      visibility: visible;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0 4px 8px;
    }
    .resize-handle {
      display: none;
    }
    aside.info,
    .shell[data-right-collapsed] > aside.info {
      flex: none;
      display: flex;
      flex-direction: column;
      /* The 56px bar plus the border above it. */
      height: calc(57px + env(safe-area-inset-bottom));
      overflow: visible;
      padding: 0 0 env(safe-area-inset-bottom);
      border-left: 0;
      border-top: 1px solid var(--_line);
    }
    .sheet-bar {
      display: flex;
      flex: none;
      align-items: center;
      gap: 8px;
      height: 56px;
      padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
      touch-action: none;
    }
    .sheet-toggle {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      height: 44px;
      padding: 0 8px;
      border: 0;
      border-radius: var(--_radius);
      background: transparent;
      color: var(--_text);
      font-size: 14px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
    }
    .sheet-toggle:disabled {
      color: var(--_muted);
      cursor: default;
    }
    .sheet-summary {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* The details open over the scene: the model never moves. */
    .sheet-body {
      display: none;
    }
    aside.info[data-open] .sheet-body {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(57px + env(safe-area-inset-bottom));
      z-index: 45;
      display: block;
      max-height: min(68%, 620px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left));
      border-top: 1px solid var(--_line);
      border-radius: 16px 16px 0 0;
      background: var(--_surface);
      box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.28);
    }
    .sheet-body .selection-head > span {
      display: none;
    }
    .sheet-body .selection-head {
      justify-content: flex-end;
    }
    /* While it is open, the menu covers the logo in the top corner of the scene. */
    .popover {
      position: fixed;
      top: calc(64px + env(safe-area-inset-top));
      right: 12px;
      z-index: 2147483001;
      width: min(340px, calc(100cqw - 24px));
      max-height: calc(100% - 80px);
      overflow-y: auto;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    aside.panel,
    .btn,
    input.switch,
    input.switch::after,
    .progress-line > span {
      transition: none;
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    .card,
    .glass {
      background: #141924;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  /* ---------------------------------------------------------------- layout="embed" */
  :host([layout='embed']) {
    height: var(--svitylo-anatomy-embed-height, 420px);
    min-height: 200px;
    border-radius: var(--_radius-lg);
  }
  :host([layout='embed'][data-pseudo-fullscreen]) {
    height: 100dvh;
    border-radius: 0;
  }
  /* In place the embed is only the scene; opened, it becomes the full atlas. */
  :host([layout='embed']:not([data-expanded])) .shell {
    display: block;
  }
  :host([layout='embed']:not([data-expanded])) main.stage {
    height: 100%;
  }
  :host([layout='embed']:not([data-expanded])) header.bar,
  :host([layout='embed']:not([data-expanded])) aside.panel,
  :host([layout='embed']:not([data-expanded])) aside.info,
  :host([layout='embed']:not([data-expanded])) .scene-controls {
    display: none;
  }
  :host([layout='embed']:not([data-expanded])) a.brand {
    right: 12px;
    bottom: 12px;
  }
  .embed-bar {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    z-index: 4;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    pointer-events: none;
  }
  .embed-bar > * {
    pointer-events: auto;
  }
  .embed-chip {
    min-width: 0;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 13px;
  }
  .embed-latin {
    font-style: italic;
    color: #9ca3af;
  }
  .embed-actions {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
  }
  .embed-actions .pill-btn {
    width: auto;
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
  }
  .embed-placeholder {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    padding: 16px 16px 60px;
    border-radius: inherit;
    background: radial-gradient(120% 90% at 50% 35%, #1c2741 0%, var(--_scene) 70%);
    overflow: hidden;
  }
  .embed-start {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: min(420px, 100%);
    padding: 20px 24px;
    border-radius: 16px;
    font: inherit;
    cursor: pointer;
  }
  .embed-start:hover {
    background: rgba(28, 36, 51, 0.8);
  }
  .embed-start .icon {
    width: 36px;
    height: 36px;
    color: #a8c3ff;
  }
  .embed-title {
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .embed-cta {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 18px;
    border-radius: var(--_radius);
    background: #3977ff;
    color: #ffffff;
    font-weight: 600;
  }
`;
