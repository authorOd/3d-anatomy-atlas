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
import type { SearchResult } from '../core/catalog/search.js';
import type { Lang } from '../schema/index.js';
import type { UiStrings } from './i18n.js';
import { icons } from './icons.js';
import { latinAlongside, nameFlag, nameFlagLabel } from './name-flags.js';

let instances = 0;

/**
 * Search box (WAI-ARIA combobox with a listbox popup). Searches all names and synonyms in all
 * languages at once and works before any geometry is loaded. Results with identical names keep
 * separate entries (selection is bound to IDs) and show side/system to tell them apart.
 */
export class AtlasSearch extends LitElement {
  static override properties = {
    catalog: { attribute: false },
    lang: { attribute: false },
    latin: { attribute: false },
    strings: { attribute: false },
    query: { state: true },
    results: { state: true },
    active: { state: true },
    open: { state: true },
  };

  declare catalog: AtlasCatalog | null;
  declare lang: Lang;
  /** Show the Latin name next to the name in `lang`. */
  declare latin: boolean;
  declare strings: UiStrings;
  declare query: string;
  declare results: SearchResult[];
  declare active: number;
  declare open: boolean;
  private readonly uid = `s${++instances}`;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.catalog = null;
    this.lang = 'en';
    this.latin = false;
    this.query = '';
    this.results = [];
    this.active = -1;
    this.open = false;
  }

  static override styles = css`
    :host {
      display: block;
      position: relative;
      min-width: 0;
    }
    .box {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 8px 0 12px;
      border-radius: 8px;
      background: var(--_surface-2, #f9fafb);
      color: var(--_text, #111827);
      border: 1px solid var(--_line-strong, #d1d5db);
    }
    .box > .icon {
      color: var(--_muted, #6b7280);
    }
    .box:focus-within {
      border-color: var(--_focus, #0151fe);
      box-shadow: 0 0 0 1px var(--_focus, #0151fe);
    }
    input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 14px;
      outline: none;
    }
    input::-webkit-search-cancel-button,
    input::-webkit-search-decoration {
      -webkit-appearance: none;
      appearance: none;
      display: none;
    }
    input::placeholder {
      color: var(--_muted, #6b7280);
    }
    .clear {
      border: 0;
      background: transparent;
      color: var(--_muted, #6b7280);
      padding: 4px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-grid;
    }
    .clear:hover {
      background: var(--_surface-3, #f3f4f6);
      color: var(--_text, #111827);
    }
    .clear:focus-visible {
      outline: 2px solid var(--_focus, #0151fe);
    }
    ul {
      position: absolute;
      z-index: 40;
      left: 0;
      right: 0;
      top: calc(100% + 6px);
      margin: 0;
      padding: 6px;
      list-style: none;
      max-height: min(60vh, 440px);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--_line, #e5e7eb);
      border-radius: 12px;
      background: var(--_surface, #ffffff);
      box-shadow: var(--_shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.2));
      color: var(--_text, #111827);
    }
    li {
      display: grid;
      gap: 1px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    li[aria-selected='true'],
    li:hover {
      background: var(--_surface-3, #f3f4f6);
    }
    .name {
      font-size: 14px;
      font-weight: 500;
    }
    .latin {
      font-size: 12.5px;
      font-style: italic;
      color: var(--_muted, #6b7280);
    }
    .meta {
      font-size: 12px;
      color: var(--_muted, #6b7280);
    }
    .tag {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.7;
      margin-left: 4px;
    }
    .unverified {
      text-decoration: underline dotted;
      text-decoration-color: var(--_draft-line, #e3a008);
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    .empty {
      padding: 10px;
      color: var(--_muted, #6b7280);
      cursor: default;
    }
    .icon {
      width: 18px;
      height: 18px;
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
  `;

  private runSearch(query: string) {
    if (!this.catalog) return;
    this.results = query.trim() ? this.catalog.search.search(query, { lang: this.lang, limit: 50 }) : [];
    this.active = this.results.length ? 0 : -1;
    this.open = query.trim().length > 0;
  }

  private onInput(event: Event) {
    this.query = (event.target as HTMLInputElement).value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.runSearch(this.query), 60);
  }

  /** Picks a result: the query is cleared and the atlas selects the structure. */
  private choose(result: SearchResult | undefined, pointer = false) {
    if (!result) return;
    this.query = '';
    this.results = [];
    this.active = -1;
    this.open = false;
    // After a tap the on-screen keyboard closes, so the model is in view.
    if (pointer && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) {
      (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.blur();
    }
    this.dispatchEvent(new CustomEvent('search-select', { detail: { id: result.id }, bubbles: true }));
  }

  private onKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        if (!this.open && this.query) this.runSearch(this.query);
        else if (this.results.length) this.active = (this.active + 1) % this.results.length;
        break;
      case 'ArrowUp':
        if (this.results.length) this.active = (this.active - 1 + this.results.length) % this.results.length;
        break;
      case 'Enter':
        if (this.open) this.choose(this.results[this.active]);
        break;
      case 'Escape':
        if (this.open) this.open = false;
        else this.clear();
        break;
      default:
        return;
    }
    event.preventDefault();
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector(`#${this.uid}-opt-${this.active}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  private clear() {
    this.query = '';
    this.results = [];
    this.open = false;
    (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  override focus(): void {
    (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  private describe(result: SearchResult) {
    const catalog = this.catalog!;
    const node = catalog.get(result.id)!;
    const display = catalog.names.display(result.id, this.lang);
    const system = catalog.names.display(node.system, this.lang);
    const duplicate = this.results.some(
      (other) => other !== result && catalog.names.display(other.id, this.lang)?.text === display?.text,
    );
    const side = node.side === 'left' || node.side === 'right' ? this.strings.sides[node.side] : null;
    return { node, display, system, duplicate, side };
  }

  /** Unverified Ukrainian names and names needing correction are marked, never shown as verified. */
  private matchTag(result: SearchResult) {
    const { status, lang } = result.matched;
    if (status === 'needs-correction') return html` <span class="tag">${this.strings.reviewStatus['needs-correction']}</span>`;
    if (lang === 'uk' && status !== 'reviewed') return html` <span class="tag">${this.strings.draft}</span>`;
    return nothing;
  }

  protected override render() {
    const s = this.strings;
    const listId = `${this.uid}-list`;
    const expanded = this.open;
    return html`<div class="box">
        ${icons.search}
        <input
          type="search"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          aria-label=${s.searchLabel}
          aria-autocomplete="list"
          aria-controls=${listId}
          aria-expanded=${String(expanded)}
          aria-activedescendant=${expanded && this.active >= 0 ? `${this.uid}-opt-${this.active}` : nothing}
          placeholder=${s.searchPlaceholder}
          .value=${this.query}
          @input=${this.onInput}
          @keydown=${this.onKeyDown}
          @focus=${() => this.query && this.runSearch(this.query)}
          @blur=${() => setTimeout(() => (this.open = false), 150)}
        />
        ${this.query
          ? html`<button class="clear" aria-label=${s.close} @click=${this.clear}>${icons.close}</button>`
          : nothing}
      </div>
      <ul id=${listId} role="listbox" aria-label=${s.searchLabel} ?hidden=${!expanded}>
        ${expanded && this.results.length === 0 ? html`<li class="empty" role="option" aria-disabled="true">${s.searchEmpty}</li>` : nothing}
        ${this.results.map((result, i) => {
          const { node, display, system, duplicate, side } = this.describe(result);
          const hasGeometry = this.catalog!.index.hasGeometry(node, 'all');
          const matchedOther = display && result.matched.text !== display.text;
          const flag = nameFlag(display);
          const latin = this.latin ? latinAlongside(this.catalog!, node.id, display) : null;
          return html`<li
            id="${this.uid}-opt-${i}"
            role="option"
            aria-selected=${String(i === this.active)}
            @mousedown=${(e: MouseEvent) => e.preventDefault()}
            @click=${() => this.choose(result, true)}
          >
            <span class="name" lang=${display?.lang ?? 'en'}
              >${flag
                ? html`<span class="unverified">${display!.text}</span><span class="sr-only"> (${nameFlagLabel(flag, s)})</span>`
                : (display?.text ?? node.id)}${display?.fallback ? html`<span class="tag">${display.lang}</span>` : nothing}${side && duplicate ? html`, ${side}` : nothing}</span
            >
            ${latin ? html`<span class="latin" lang="la">${latin}</span>` : nothing}
            <span class="meta"
              >${system ? html`<span lang=${system.lang}>${system.text}</span>` : node.system}${matchedOther
                ? html` · <span lang=${result.matched.lang}>${result.matched.text}</span>${this.matchTag(result)}`
                : nothing}${hasGeometry ? nothing : html` · ${s.noGeometry}`}</span
            >
          </li>`;
        })}
      </ul>
      <span class="sr-only" role="status" aria-live="polite">${expanded ? s.searchResults(this.results.length) : ''}</span>`;
  }
}

/** Registers `<svitylo-anatomy-search>`; `defineSvityloAnatomy()` calls it. */
export function defineAtlasSearch(): void {
  if (!customElements.get('svitylo-anatomy-search')) customElements.define('svitylo-anatomy-search', AtlasSearch);
}
