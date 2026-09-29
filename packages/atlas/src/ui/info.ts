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
import { LitElement, css, html, nothing } from 'lit';
import type { AtlasCatalog } from '../core/catalog/catalog.js';
import type { Lang } from '../schema/index.js';
import type { UiStrings } from './i18n.js';
import { icons } from './icons.js';
import { latinAlongside, nameFlag, nameFlagLabel } from './name-flags.js';
import type { DisplayState } from './tree.js';

export type InfoAction = 'focus' | 'isolate' | 'clear-isolation' | 'hide' | 'show' | 'deselect' | 'toggle';

/**
 * Card of one selected structure: the name in the current language (dotted underline while the
 * translation is unreviewed) with the Latin name under it, and icon buttons for this structure
 * only — zoom to it, isolate it, hide or show it, deselect it. The body holds the position in
 * the tree, known issues and gaps; synonyms, the source with its licence and the review status
 * are in the collapsed "Details". The card has no functional or clinical texts.
 */
export class AtlasInfo extends LitElement {
  static override properties = {
    catalog: { attribute: false },
    lang: { attribute: false },
    strings: { attribute: false },
    structureId: { attribute: false },
    display: { attribute: false },
    isolatedHere: { attribute: false },
    viewerAvailable: { attribute: false },
    expanded: { attribute: false },
    revision: { attribute: false },
  };

  declare catalog: AtlasCatalog | null;
  declare lang: Lang;
  declare strings: UiStrings;
  declare structureId: string | null;
  declare display: DisplayState;
  /** The isolation is exactly this structure. */
  declare isolatedHere: boolean;
  declare viewerAvailable: boolean;
  /** Collapsed cards show only the names and the deselect button. */
  declare expanded: boolean;
  declare revision: number;

  constructor() {
    super();
    this.catalog = null;
    this.lang = 'en';
    this.structureId = null;
    this.display = 'absent';
    this.isolatedHere = false;
    this.viewerAvailable = true;
    this.expanded = true;
    this.revision = 0;
  }

  static override styles = css`
    :host {
      display: block;
      color: var(--_text, #111827);
      font-size: 14px;
      line-height: 1.45;
      border: 1px solid var(--_line, #e5e7eb);
      border-radius: 12px;
      background: var(--_surface, #ffffff);
      box-shadow: var(--_shadow, none);
    }
    header {
      display: flex;
      align-items: flex-start;
      gap: 2px;
      padding: 6px 6px 6px 4px;
    }
    .tools {
      flex: none;
      display: flex;
      gap: 2px;
    }
    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    button.title {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      width: 100%;
      padding: 4px 6px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      text-align: left;
      font-weight: 600;
    }
    button.title:hover {
      background: var(--_surface-3, #f3f4f6);
    }
    .chevron {
      flex: none;
      margin-top: 1px;
      color: var(--_muted, #6b7280);
    }
    .names {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .name {
      display: block;
    }
    .side {
      font-weight: 400;
      color: var(--_muted, #6b7280);
    }
    .latin {
      display: block;
      margin-top: 1px;
      font-size: 13px;
      line-height: 18px;
      font-style: italic;
      font-weight: 400;
      color: var(--_muted, #6b7280);
    }
    /* Unreviewed translations and names flagged for correction: a dotted underline, no label. */
    .unverified {
      text-decoration: underline dotted;
      text-decoration-color: var(--_draft-line, #e3a008);
      text-decoration-thickness: 2px;
      text-underline-offset: 4px;
    }
    .tag {
      display: inline-block;
      margin-left: 6px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--_surface-4, #ecedf1);
      color: var(--_text-2, #374151);
      font-size: 11px;
      font-weight: 500;
      line-height: 18px;
      text-transform: uppercase;
      vertical-align: 2px;
    }
    .icon-button {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--_muted, #6b7280);
    }
    .icon-button:hover {
      background: var(--_surface-3, #f3f4f6);
      color: var(--_text, #111827);
    }
    .icon-button[aria-pressed='true'] {
      background: var(--_soft, #e5edff);
      color: var(--_on-soft, #003ab6);
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 12px 12px 36px;
    }
    .path {
      margin: -4px 0 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--_muted, #6b7280);
    }
    .path .sep {
      margin: 0 4px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--_focus, #0151fe);
      outline-offset: 1px;
    }
    .note {
      margin: 0;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--_warn-soft, #fdf6b2);
      color: var(--_on-warn-soft, #723b13);
      font-size: 12.5px;
    }
    details {
      font-size: 13px;
    }
    summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 0;
      border-radius: 6px;
      color: var(--_text-2, #374151);
      font-weight: 500;
      list-style: none;
      cursor: pointer;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary .icon {
      transition: transform 0.15s ease;
    }
    details[open] summary .icon {
      transform: rotate(90deg);
    }
    dl {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0 0;
    }
    dt {
      font-size: 12px;
      color: var(--_muted, #6b7280);
    }
    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--_text-2, #374151);
    }
    a {
      color: var(--_link, #0048e4);
    }
    .icon {
      width: 16px;
      height: 16px;
      flex: none;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    @media (prefers-reduced-motion: reduce) {
      summary .icon {
        transition: none;
      }
    }
  `;

  protected override updated(): void {
    this.toggleAttribute('data-expanded', this.expanded);
  }

  private act(action: InfoAction) {
    this.dispatchEvent(new CustomEvent('info-action', { detail: { action, id: this.structureId }, bubbles: true }));
  }

  protected override render() {
    const catalog = this.catalog;
    const id = this.structureId;
    const s = this.strings;
    if (!catalog || !id) return nothing;
    const node = catalog.get(id);
    if (!node) return nothing;
    const display = catalog.names.display(id, this.lang);
    const flag = nameFlag(display);
    const latin = latinAlongside(catalog, id, display);
    const bodyId = `card-${node.index}`;
    const side = node.side === 'left' || node.side === 'right' ? s.sides[node.side] : null;
    const visible = this.display === 'opaque' || this.display === 'ghost' || this.display === 'mixed';
    const hasGeometry = catalog.index.hasGeometry(node, 'all');
    const label = display?.text ?? id;
    return html`
      <header>
        <h2>
          <button class="title" aria-expanded=${String(this.expanded)} aria-controls=${bodyId} @click=${() => this.act('toggle')}>
            <span class="chevron">${this.expanded ? icons.chevronDown : icons.chevronRight}</span>
            <span class="names">
              <span class="name" lang=${display?.lang ?? 'en'}
                ><span class=${flag ? 'unverified' : ''}>${display?.text ?? s.missingName}</span
                >${side ? html` <span class="side">(${side})</span>` : nothing}${display?.fallback
                  ? html`<span class="tag" title=${s.nameFallback}>${display.lang}</span>`
                  : nothing}${flag ? html`<span class="sr-only">, ${nameFlagLabel(flag, s)}</span>` : nothing}</span
              >
              ${latin ? html`<span class="latin" lang="la">${latin}</span>` : nothing}
            </span>
          </button>
        </h2>
        ${this.viewerAvailable
          ? html`<div class="tools" role="group" aria-label=${label}>
              <button
                class="icon-button"
                aria-label=${`${s.zoomTo}: ${label}`}
                title=${s.zoomToHint}
                ?disabled=${!visible}
                @click=${() => this.act('focus')}
              >
                ${icons.focus}
              </button>
              <button
                class="icon-button"
                aria-label=${`${s.isolate}: ${label}`}
                aria-pressed=${String(this.isolatedHere)}
                title=${this.isolatedHere ? s.clearIsolation : s.isolateHint}
                ?disabled=${!visible && !this.isolatedHere}
                @click=${() => this.act(this.isolatedHere ? 'clear-isolation' : 'isolate')}
              >
                ${icons.isolate}
              </button>
              <button
                class="icon-button"
                aria-label=${`${visible ? s.hide : s.show}: ${label}`}
                title=${visible ? s.hideHint : s.show}
                ?disabled=${!visible && !hasGeometry}
                @click=${() => this.act(visible ? 'hide' : 'show')}
              >
                ${visible ? icons.eye : this.display === 'absent' ? icons.eyeAdd : icons.eyeOff}
              </button>
            </div>`
          : nothing}
        <button class="icon-button" aria-label=${`${s.deselect}: ${label}`} title=${s.deselect} @click=${() => this.act('deselect')}>
          ${icons.close}
        </button>
      </header>
      ${this.expanded ? this.renderBody(bodyId) : nothing}
    `;
  }

  private renderBody(bodyId: string) {
    const catalog = this.catalog!;
    const id = this.structureId!;
    const node = catalog.get(id)!;
    const names = catalog.names;
    const s = this.strings;
    const ancestors = catalog.index.ancestors(node).reverse();
    const asset = catalog.asset(node.entry.asset ?? node.entry.gap?.asset);
    const issues = catalog.issuesFor(id);
    // Open issues are notes on the card; what the atlas has corrected goes to the details.
    const open = issues.filter((issue) => issue.status !== 'resolved');
    const corrected = issues.filter((issue) => issue.status === 'resolved');
    const hasGeometry = catalog.index.hasGeometry(node, 'all');
    const noteLang = this.lang === 'la' ? 'en' : this.lang;
    const synonyms = names
      .variants(id)
      .filter((v) => (v.lang === this.lang || v.lang === 'la') && v.entry.synonyms?.length);
    const ukEntry = names.entry(id, 'uk');
    return html`<div class="body" id=${bodyId}>
      ${ancestors.length
        ? html`<p class="path" title=${s.path}>
            <span class="sr-only">${s.path}: </span>${ancestors.map(
              (a, i) => html`${i ? html`<span class="sep" aria-hidden="true">→</span>` : nothing}<span lang=${names.display(a.id, this.lang)?.lang ?? 'en'}
                  >${names.label(a.id, this.lang)}</span
                >`,
            )}
          </p>`
        : nothing}
      ${node.entry.gap
        ? html`<p class="note">${s.gap}: ${s.gapReasons[node.entry.gap.reason]}${node.entry.gap.note?.[noteLang]
            ? html`. ${node.entry.gap.note[noteLang]}`
            : nothing}</p>`
        : !hasGeometry
          ? html`<p class="note">${s.noGeometry}</p>`
          : nothing}
      ${open.map((issue) => html`<p class="note" role="note">${issue.text[noteLang] ?? issue.text.en ?? issue.text.uk}</p>`)}
      <details>
        <summary>${icons.chevronRight}${s.details}</summary>
        <dl>
          ${synonyms.length
            ? html`<div>
                <dt>${s.synonyms}</dt>
                ${synonyms.map((v) => html`<dd lang=${v.lang}>${v.entry.synonyms!.join(', ')}</dd>`)}
              </div>`
            : nothing}
          ${asset
            ? html`<div>
                <dt>${s.source}</dt>
                <dd>
                  ${asset.title}${node.entry.source?.object ? html` (<span lang="en">${node.entry.source.object}</span>)` : nothing}.
                  <a href=${asset.license.url} target="_blank" rel="noopener noreferrer">${asset.license.id}</a>
                </dd>
              </div>`
            : nothing}
          ${corrected.length
            ? html`<div class="corrected">
                <dt>${s.corrected}</dt>
                ${corrected.map((issue) => html`<dd>${issue.text[noteLang] ?? issue.text.en ?? issue.text.uk}</dd>`)}
              </div>`
            : nothing}
          <div>
            <dt>${s.review}</dt>
            <dd>${s.anatomyReview}: ${s.reviewStatus[node.entry.review.status]}</dd>
            ${ukEntry ? html`<dd>${s.translationReview}: ${s.reviewStatus[ukEntry.status]}</dd>` : nothing}
          </div>
        </dl>
      </details>
    </div>`;
  }
}

/** Registers `<svitylo-anatomy-info>`; `defineSvityloAnatomy()` calls it. */
export function defineAtlasInfo(): void {
  if (!customElements.get('svitylo-anatomy-info')) customElements.define('svitylo-anatomy-info', AtlasInfo);
}
