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
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { cssProps } from './css-props.js';
import type { AtlasCatalog } from '../core/catalog/catalog.js';
import type { IndexedStructure } from '../core/catalog/structure-index.js';
import type { Lang } from '../schema/index.js';
import type { UiStrings } from './i18n.js';
import { icons } from './icons.js';
import { latinAlongside, nameFlag, nameFlagLabel } from './name-flags.js';

export type DisplayState = 'hidden' | 'opaque' | 'ghost' | 'mixed' | 'absent';
export type LoadState = 'none' | 'loading' | 'ready' | 'failed' | 'partial';

export interface TreeStateProvider {
  display(id: string): DisplayState;
  load(id: string): LoadState;
}

interface Row {
  node: IndexedStructure;
  depth: number;
  posinset: number;
  setsize: number;
}

/** Rows are one line high; with Latin names each row has a second, smaller line. */
const ROW_HEIGHT = 36;
const ROW_HEIGHT_LATIN = 48;
const OVERSCAN = 12;

/**
 * Keyboard-accessible tree of systems and structures (WAI-ARIA tree pattern). Only the rows in
 * view are rendered (virtualised), so the full hierarchy of several thousand structures stays
 * cheap; ARIA level/position attributes keep the structure available to assistive technology.
 */
export class AtlasTree extends LitElement {
  static override properties = {
    catalog: { attribute: false },
    lang: { attribute: false },
    latin: { attribute: false },
    strings: { attribute: false },
    provider: { attribute: false },
    selected: { attribute: false },
    revision: { attribute: false },
    scrollTopValue: { state: true },
    viewportHeight: { state: true },
    focusIndex: { state: true },
    tip: { state: true },
  };

  declare catalog: AtlasCatalog | null;
  declare lang: Lang;
  /** Show the Latin name next to the name in `lang`. */
  declare latin: boolean;
  declare strings: UiStrings;
  declare provider: TreeStateProvider | null;
  declare selected: string[];
  declare revision: number;
  declare scrollTopValue: number;
  declare viewportHeight: number;
  declare focusIndex: number;
  /** Tooltip with the full name of a truncated row. */
  declare tip: { text: string; latin: string | null; x: number; y: number } | null;

  private expanded = new Set<string>();
  private rows: Row[] = [];
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    super();
    this.catalog = null;
    this.lang = 'en';
    this.latin = false;
    this.provider = null;
    this.selected = [];
    this.revision = 0;
    this.scrollTopValue = 0;
    this.viewportHeight = 600;
    this.focusIndex = 0;
    this.tip = null;
  }

  private get rowHeight(): number {
    return this.latin ? ROW_HEIGHT_LATIN : ROW_HEIGHT;
  }

  private tipTimer: ReturnType<typeof setTimeout> | null = null;

  /** Shows the full name after a short hover, only when the row cuts it (or its Latin) short. */
  private onRowEnter(e: PointerEvent, node: IndexedStructure) {
    if (e.pointerType !== 'mouse') return;
    const row = e.currentTarget as HTMLElement;
    this.hideTip();
    this.tipTimer = setTimeout(() => {
      const parts = [...row.querySelectorAll('.name, .latin')] as HTMLElement[];
      if (!parts.some((el) => el.scrollWidth > el.clientWidth + 1)) return;
      const name = this.catalog!.names.display(node.id, this.lang);
      const side = node.side === 'left' || node.side === 'right' ? ` (${this.strings.sides[node.side]})` : '';
      const label = row.querySelector('.label') as HTMLElement | null;
      const box = (label ?? row).getBoundingClientRect();
      const host = this.getBoundingClientRect();
      this.tip = {
        text: `${name?.text ?? node.id}${side}`,
        latin: this.latin ? latinAlongside(this.catalog!, node.id, name) : null,
        x: box.left - host.left,
        y: box.bottom - host.top + 4,
      };
    }, 350);
  }

  private hideTip() {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = null;
    if (this.tip) this.tip = null;
  }

  static override styles = css`
    :host {
      position: relative;
      display: block;
      height: 100%;
      min-height: 0;
    }
    .scroller {
      height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
      outline: none;
    }
    .spacer {
      position: relative;
    }
    .row {
      position: absolute;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      gap: 2px;
      padding-right: 6px;
      box-sizing: border-box;
      border-radius: 8px;
      cursor: pointer;
      color: var(--_text-2, #374151);
      font-size: 14px;
      font-weight: 500;
      outline: none;
    }
    .row[data-latin] {
      height: ${ROW_HEIGHT_LATIN}px;
    }
    .row:hover {
      background: var(--_surface-3, #f3f4f6);
      color: var(--_text, #111827);
    }
    .row[aria-selected='true'] {
      background: var(--_soft, #e5edff);
      color: var(--_on-soft, #003ab6);
    }
    .row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--_focus, #0151fe);
    }
    .toggle,
    .eye {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      padding: 0;
      cursor: pointer;
    }
    .toggle {
      color: var(--_muted, #6b7280);
    }
    .toggle:hover,
    .eye:hover {
      background: var(--_surface-4, #ecedf1);
    }
    .toggle[data-leaf] {
      visibility: hidden;
    }
    .eye[data-state='hidden'] {
      opacity: 0.5;
    }
    .eye[data-state='absent'] {
      opacity: 0.55;
    }
    .eye[data-state='ghost'] {
      opacity: 0.8;
    }
    .label {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .name,
    .latin {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name {
      line-height: 20px;
    }
    .latin {
      font-size: 12px;
      line-height: 16px;
      font-style: italic;
      font-weight: 400;
      color: var(--_muted, #6b7280);
    }
    .row[aria-selected='true'] .latin {
      color: inherit;
      opacity: 0.8;
    }
    /* Unreviewed Ukrainian names and names flagged for correction: a dotted underline, no label. */
    .unverified {
      text-decoration: underline dotted;
      text-decoration-color: var(--_draft-line, #e3a008);
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    .lang {
      font-size: 11px;
      font-weight: 400;
      opacity: 0.7;
      margin-left: 4px;
      text-transform: uppercase;
    }
    .badge {
      flex: none;
      font-size: 11px;
      font-weight: 400;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--_surface-4, #ecedf1);
      color: var(--_muted, #6b7280);
    }
    .badge[data-kind='failed'] {
      background: var(--_danger-soft, #fde8e8);
      color: var(--_on-danger-soft, #9b1c1c);
    }
    .icon {
      width: 18px;
      height: 18px;
    }
    /* Positioned in the tree's own box (the atlas is a containment context for fixed boxes). */
    .tooltip {
      position: absolute;
      z-index: 100;
      width: max-content;
      max-width: min(420px, calc(100vw - 24px));
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--_tooltip, #111928);
      color: var(--_on-tooltip, #ffffff);
      box-shadow: var(--_shadow-lg, 0 10px 20px rgba(0, 0, 0, 0.25));
      font-size: 13px;
      line-height: 1.4;
      pointer-events: none;
    }
    .tooltip .latin {
      color: inherit;
      opacity: 0.75;
      white-space: normal;
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => {
      const scroller = this.renderRoot.querySelector('.scroller') as HTMLElement | null;
      if (scroller) this.viewportHeight = scroller.clientHeight || 600;
    });
    // Connected again after a move in the DOM: the scroller is already there.
    this.observeScroller();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  protected override firstUpdated(): void {
    this.observeScroller();
  }

  /** The observer reports the real height right after observing; no extra update here. */
  private observeScroller() {
    const scroller = this.renderRoot?.querySelector('.scroller') as HTMLElement | null;
    if (scroller) this.resizeObserver?.observe(scroller);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // Systems start collapsed; selecting a structure reveals (expands) its branch.
    this.rows = this.flatten();
    if (this.focusIndex >= this.rows.length) this.focusIndex = Math.max(0, this.rows.length - 1);
  }

  private flatten(): Row[] {
    const out: Row[] = [];
    if (!this.catalog) return out;
    const visit = (nodes: IndexedStructure[], depth: number) => {
      nodes.forEach((node, i) => {
        out.push({ node, depth, posinset: i + 1, setsize: nodes.length });
        if (node.children.length && this.expanded.has(node.id)) visit(node.children, depth + 1);
      });
    };
    visit(this.catalog.index.systems, 0);
    return out;
  }

  /** Expands the ancestors of a structure and scrolls it into view. */
  reveal(id: string, focus = false): void {
    const node = this.catalog?.get(id);
    if (!node) return;
    for (const a of this.catalog!.index.ancestors(node)) this.expanded.add(a.id);
    this.rows = this.flatten();
    const index = this.rows.findIndex((r) => r.node === node);
    if (index < 0) return;
    this.focusIndex = index;
    this.requestUpdate();
    void this.updateComplete.then(() => {
      const scroller = this.renderRoot.querySelector('.scroller') as HTMLElement | null;
      if (!scroller) return;
      const top = index * this.rowHeight;
      if (top < scroller.scrollTop || top + this.rowHeight > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 2);
      }
      if (focus) void this.updateComplete.then(() => this.focusRow(index));
    });
  }

  private focusRow(index: number) {
    const row = this.renderRoot.querySelector(`[data-index="${index}"]`) as HTMLElement | null;
    row?.focus({ preventScroll: false });
  }

  private toggle(node: IndexedStructure, open?: boolean) {
    const isOpen = this.expanded.has(node.id);
    const next = open ?? !isOpen;
    if (next === isOpen) return;
    if (next) this.expanded.add(node.id);
    else this.expanded.delete(node.id);
    this.requestUpdate();
  }

  private emit(type: 'tree-select' | 'tree-visibility', id: string) {
    this.dispatchEvent(new CustomEvent(type, { detail: { id }, bubbles: true, composed: false }));
  }

  private onKeyDown(event: KeyboardEvent, index: number) {
    const row = this.rows[index];
    if (!row) return;
    let next = index;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(this.rows.length - 1, index + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, index - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.rows.length - 1;
        break;
      case 'ArrowRight':
        if (row.node.children.length) {
          if (!this.expanded.has(row.node.id)) this.toggle(row.node, true);
          else next = index + 1;
        }
        break;
      case 'ArrowLeft':
        if (row.node.children.length && this.expanded.has(row.node.id)) this.toggle(row.node, false);
        else if (row.node.parent) next = this.rows.findIndex((r) => r.node === row.node.parent);
        break;
      case 'Enter':
        this.emit('tree-select', row.node.id);
        break;
      case ' ':
        this.emit('tree-visibility', row.node.id);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== index && next >= 0) {
      this.focusIndex = next;
      void this.updateComplete.then(() => {
        this.ensureVisible(next);
        void this.updateComplete.then(() => this.focusRow(next));
      });
    }
  }

  private ensureVisible(index: number) {
    const scroller = this.renderRoot.querySelector('.scroller') as HTMLElement | null;
    if (!scroller) return;
    const h = this.rowHeight;
    const top = index * h;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + h > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + h - scroller.clientHeight;
  }

  /** Plain accessible name of a row: name, side and language marker, without the row buttons. */
  private accessibleName(node: IndexedStructure): string {
    const name = this.catalog!.names.display(node.id, this.lang);
    const parts = [name?.text ?? node.id];
    if (node.side === 'left' || node.side === 'right') parts.push(`(${this.strings.sides[node.side]})`);
    if (name?.fallback) parts.push(`[${name.lang}]`);
    const flag = nameFlag(name);
    if (flag) parts.push(`(${nameFlagLabel(flag, this.strings)})`);
    const latin = this.latin ? latinAlongside(this.catalog!, node.id, name) : null;
    return latin ? `${parts.join(' ')}, ${latin}` : parts.join(' ');
  }

  /** Name on the first line; with Latin names, the Latin name on a second, smaller line. */
  private label(node: IndexedStructure) {
    const name = this.catalog!.names.display(node.id, this.lang);
    if (!name) return html`<span class="label"><span class="name">${node.id}</span></span>`;
    const flag = nameFlag(name);
    // Marked names are underlined without a tooltip; the legend below the tree explains the mark.
    const text = flag ? html`<span class="unverified">${name.text}</span>` : name.text;
    const latin = this.latin ? latinAlongside(this.catalog!, node.id, name) : null;
    return html`<span class="label"
      ><span class="name" lang=${name.lang}
        >${text}${node.side === 'left' || node.side === 'right'
          ? html` <span class="lang">(${this.strings.sides[node.side]})</span>`
          : nothing}${name.fallback ? html`<span class="lang" aria-hidden="true">${name.lang}</span>` : nothing}</span
      >${this.latin ? html`<span class="latin" lang="la">${latin ?? ' '}</span>` : nothing}</span
    >`;
  }

  protected override render() {
    if (!this.catalog) return html`<div class="scroller"></div>`;
    const total = this.rows.length;
    const h = this.rowHeight;
    const first = Math.max(0, Math.floor(this.scrollTopValue / h) - OVERSCAN);
    const last = Math.min(total, Math.ceil((this.scrollTopValue + this.viewportHeight) / h) + OVERSCAN);
    const indices: number[] = [];
    for (let i = first; i < last; i++) indices.push(i);
    if (this.focusIndex < first || this.focusIndex >= last) indices.push(this.focusIndex);
    const s = this.strings;
    return html`<div
      class="scroller"
      role="tree"
      aria-label=${s.treeLabel}
      aria-multiselectable="true"
      @scroll=${(e: Event) => {
        this.scrollTopValue = (e.target as HTMLElement).scrollTop;
        this.hideTip();
      }}
    >
      <div class="spacer" ${cssProps({ height: `${total * h}px` })}>
        ${indices.map((i) => {
          const row = this.rows[i];
          if (!row) return nothing;
          const { node } = row;
          const display = this.provider?.display(node.id) ?? 'absent';
          const load = this.provider?.load(node.id) ?? 'none';
          const hasGeometry = this.catalog!.index.hasGeometry(node, 'all');
          const expanded = this.expanded.has(node.id);
          const selected = this.selected.includes(node.id);
          const eyeLabel = display === 'opaque' || display === 'ghost' || display === 'mixed' ? s.hide : s.show;
          return html`<div
            class="row"
            role="treeitem"
            aria-label=${this.accessibleName(node)}
            data-index=${i}
            aria-level=${row.depth + 1}
            aria-setsize=${row.setsize}
            aria-posinset=${row.posinset}
            aria-expanded=${node.children.length ? String(expanded) : nothing}
            aria-selected=${String(selected)}
            tabindex=${i === this.focusIndex ? 0 : -1}
            ?data-latin=${this.latin}
            ${cssProps({ top: `${i * h}px`, 'padding-left': `${row.depth * 14}px` })}
            @pointerenter=${(e: PointerEvent) => this.onRowEnter(e, node)}
            @pointerleave=${() => this.hideTip()}
            @click=${(e: MouseEvent) => {
              this.focusIndex = i;
              this.emit('tree-select', node.id);
            }}
            @keydown=${(e: KeyboardEvent) => this.onKeyDown(e, i)}
            @focus=${() => (this.focusIndex = i)}
          >
            <button
              class="toggle"
              tabindex="-1"
              ?data-leaf=${node.children.length === 0}
              aria-label=${expanded ? s.collapse : s.expand}
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
                this.toggle(node);
              }}
            >
              ${expanded ? icons.chevronDown : icons.chevronRight}
            </button>
            ${hasGeometry && this.provider
              ? html`<button
                  class="eye"
                  tabindex="-1"
                  data-state=${display}
                  aria-label=${eyeLabel}
                  title=${eyeLabel}
                  @click=${(e: MouseEvent) => {
                    e.stopPropagation();
                    this.emit('tree-visibility', node.id);
                  }}
                >
                  ${display === 'hidden' ? icons.eyeOff : display === 'absent' ? icons.eyeAdd : icons.eye}
                </button>`
              : html`<span class="eye" aria-hidden="true"></span>`}
            ${this.label(node)}
            ${!hasGeometry
              ? html`<span class="badge">${s.noGeometry}</span>`
              : load === 'loading'
                ? html`<span class="badge">${s.loadingShort}</span>`
                : load === 'failed'
                  ? html`<span class="badge" data-kind="failed">${s.failedShort}</span>`
                  : nothing}
          </div>`;
        })}
      </div>
    </div>
    ${this.tip
      ? html`<div class="tooltip" role="tooltip" aria-hidden="true" ${cssProps({ left: `${Math.round(this.tip.x)}px`, top: `${Math.round(this.tip.y)}px` })}>
          ${this.tip.text}${this.tip.latin ? html`<span class="latin" lang="la">${this.tip.latin}</span>` : nothing}
        </div>`
      : nothing}`;
  }
}

/** Registers `<svitylo-anatomy-tree>`; `defineSvityloAnatomy()` calls it. */
export function defineAtlasTree(): void {
  if (!customElements.get('svitylo-anatomy-tree')) customElements.define('svitylo-anatomy-tree', AtlasTree);
}
