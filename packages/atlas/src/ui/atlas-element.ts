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
import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { cssProps } from './css-props.js';
import dataPackage from '@authorod/svitylo-3d-anatomy-data/package.json' with { type: 'json' };
import { AtlasCatalog } from '../core/catalog/catalog.js';
import { AtlasError, isAtlasError, toAtlasError, type AtlasErrorCode } from '../core/errors.js';
import type { AtlasEventMap, ProgressEvent, SurroundingsInfo } from '../core/events.js';
import { STANDARD_VIEWS, type StandardView } from '../core/render/camera-rig.js';
import { AtlasViewer, isWebGL2Available, type OperationResult } from '../core/viewer.js';
import {
  TRANSPARENCY_RANGE,
  decodeState,
  encodeState,
  type Lang,
  type Quality,
  type ViewState,
} from '../schema/index.js';
import { SVITYLO_NAME, SVITYLO_URL, logo, logoMark } from './branding.js';
import { resolveStrings, type UiLang, type UiStrings } from './i18n.js';
import { icons } from './icons.js';
import { latinAlongside } from './name-flags.js';
import { defineAtlasInfo, type InfoAction } from './info.js';
import { defineAtlasSearch } from './search.js';
import { embedLimits, registerEmbed, sharedCatalog, touchEmbed, unregisterEmbed, type ActiveEmbed } from './shared.js';
import { elementStyles } from './styles.js';
import { defineAtlasTree, type AtlasTree, type DisplayState, type LoadState, type TreeStateProvider } from './tree.js';

export const DEFAULT_DATA_VERSION: string = dataPackage.version;
export const DEFAULT_DATA_URL = `/anatomy-data/${DEFAULT_DATA_VERSION}/`;

const LANGS: Lang[] = ['uk', 'la', 'en'];
/** Languages offered by the language control; Latin is a separate toggle shown alongside. */
const MAIN_LANGS = ['uk', 'en'] as const;

const isUiLang = (value: unknown): value is UiLang => value === 'uk' || value === 'en';

interface Notice {
  kind: 'error' | 'info';
  message: string;
  code?: AtlasErrorCode;
  retry?: 'files' | 'catalog' | 'context' | null;
}

interface ShareView {
  url?: string;
  json?: string;
  tooLarge?: boolean;
  error?: string;
  copied?: boolean;
}

/** Builds the link for a shared state; receives the encoded payload and the state object. */
export type ShareUrlBuilder = (encodedState: string, state: ViewState) => string;

/**
 * `<svitylo-anatomy>` — the full atlas as a standard web component (Shadow DOM, Lit).
 *
 * Attributes: `data-url`, `lang` (en | uk; `la` = the interface language plus Latin), `latin`
 * (Latin names alongside), `ui-lang` (en | uk; default: follows `lang`), `uk-names`
 * (any | reviewed: whether unreviewed Ukrainian names are shown, marked as drafts; read when
 * metadata loads), `quality` (standard | economy), `layout` (full | embed), `state` (encoded view
 * state of a link), `share-base-url`, `pick-ghost` (read when the viewer is created).
 * Embed attributes: `structure`, `system`, `surroundings`, `view` (used without `state`),
 * `label`, `height`, `autoload`.
 * Properties: `strings` (UI text overrides), `shareUrlBuilder`, `dataUrlResolver`.
 *
 * Registering the element loads nothing. Connecting it loads metadata and dictionaries only;
 * geometry is requested after a user action or when a shared state is applied. An embed requests
 * nothing until the reader starts it.
 * DOM events: `anatomy:select|hover|visibility|surroundings|camera|statechange|progress|ready|error|expand`
 * (bubbles, composed).
 */
export class SvityloAnatomyElement extends LitElement implements ActiveEmbed {
  /**
   * Embeds that may hold a 3D scene at the same time on a page (default 4). Starting one more
   * returns the least recently used embed to its placeholder; its view is restored on return.
   */
  static get maxActiveEmbeds(): number {
    return embedLimits.maxActive;
  }
  static set maxActiveEmbeds(value: number) {
    embedLimits.maxActive = value;
  }

  static override properties = {
    dataUrl: { type: String, attribute: 'data-url' },
    termLang: { type: String, attribute: 'lang' },
    uiLang: { type: String, attribute: 'ui-lang' },
    latin: { type: Boolean },
    theme: { type: String, reflect: true },
    ukNames: { type: String, attribute: 'uk-names' },
    quality: { type: String },
    layout: { type: String, reflect: true },
    state: { type: String },
    structure: { type: String },
    system: { type: String },
    surroundingsLevel: { type: Number, attribute: 'surroundings' },
    view: { type: String },
    label: { type: String },
    embedHeight: { type: Number, attribute: 'height' },
    autoload: { type: Boolean },
    shareBaseUrl: { type: String, attribute: 'share-base-url' },
    pickGhost: { type: Boolean, attribute: 'pick-ghost' },
    strings: { attribute: false },
    shareUrlBuilder: { attribute: false },
    dataUrlResolver: { attribute: false },
    phase: { state: true },
    fatal: { state: true },
    notice: { state: true },
    progress: { state: true },
    selection: { state: true },
    revision: { state: true },
    panelOpen: { state: true },
    shareView: { state: true },
    announcement: { state: true },
    fullscreen: { state: true },
    contextLost: { state: true },
    expandedCards: { state: true },
    sheetOpen: { state: true },
    currentQuality: { state: true },
    currentLang: { state: true },
    currentUi: { state: true },
    currentLatin: { state: true },
    activated: { state: true },
    expanded: { state: true },
    leftCollapsed: { state: true },
    rightCollapsed: { state: true },
    leftWidth: { state: true },
    settingsOpen: { state: true },
    viewsOpen: { state: true },
    transparencyOpen: { state: true },
    currentView: { state: true },
    narrow: { state: true },
  };

  static override styles = elementStyles;

  declare dataUrl: string | null;
  declare termLang: string | null;
  declare uiLang: string | null;
  /** Show Latin names next to the names in the current language. */
  declare latin: boolean;
  /** `auto` (default: follows the system), `light` or `dark`. The 3D scene is dark in both. */
  declare theme: string | null;
  /** `any` (default): unreviewed Ukrainian names are shown, marked as drafts; `reviewed`: only reviewed ones. */
  declare ukNames: string | null;
  declare quality: string | null;
  declare layout: string | null;
  declare state: string | null;
  /** Embed: structure shown when there is no `state` (with `surroundings` and `view`). */
  declare structure: string | null;
  /** Embed: system shown when there is no `state` or `structure`. */
  declare system: string | null;
  /** Embed: surroundings level around `structure` (1 = nearest parent group). */
  declare surroundingsLevel: number | null;
  /** Embed: standard view (anterior, posterior, left, right, superior, inferior). */
  declare view: string | null;
  /** Embed: name shown on the placeholder before anything is loaded (e.g. the structure name). */
  declare label: string | null;
  /** Embed: height in CSS pixels (default 420, CSS variable --svitylo-anatomy-embed-height). */
  declare embedHeight: number | null;
  /** Embed: start without the placeholder. */
  declare autoload: boolean;
  declare shareBaseUrl: string | null;
  declare pickGhost: boolean;
  declare strings: Partial<UiStrings> | undefined;
  declare shareUrlBuilder: ShareUrlBuilder | undefined;
  /**
   * Where this site hosts other data versions, for `catalog.loadVersion()`. Links do not use it:
   * they always open in the loaded data. Return `null` when a version is not hosted. Default: the
   * sibling folder `<root>/<version>/` of `data-url`.
   */
  declare dataUrlResolver: ((version: string) => string | null | undefined) | undefined;
  declare phase: 'idle' | 'loading' | 'ready' | 'failed';
  declare fatal: Notice | null;
  declare notice: Notice | null;
  declare progress: ProgressEvent | null;
  declare selection: string[];
  declare revision: number;
  declare panelOpen: boolean;
  declare shareView: ShareView | null;
  declare announcement: string;
  declare fullscreen: boolean;
  declare contextLost: boolean;
  /** Selection cards shown expanded (the newest selection expands, older ones collapse). */
  declare expandedCards: Set<string>;
  /** Narrow layouts: the selection sheet is expanded (collapsed to its summary bar otherwise). */
  declare sheetOpen: boolean;
  declare currentQuality: Quality;
  declare currentLang: Lang;
  /** Interface language: `ui-lang`, else the names language. */
  declare currentUi: UiLang;
  /** Latin names are shown alongside (the `latin` attribute, the toggle or a link). */
  declare currentLatin: boolean;
  /** Embed: the 3D scene was started (placeholder otherwise). Always true for the full layout. */
  declare activated: boolean;
  /** Embed: opened as the full atlas on the whole screen. */
  declare expanded: boolean;
  /** Wide layouts: the structures panel (left) or the selection panel (right) is hidden. */
  declare leftCollapsed: boolean;
  declare rightCollapsed: boolean;
  /** Width of the structures panel set by dragging its edge (CSS pixels), or null. */
  declare leftWidth: number | null;
  declare settingsOpen: boolean;
  /** The menu of standard views is open. */
  declare viewsOpen: boolean;
  /** Narrow scene: the transparency slider above the camera bar is open. */
  declare transparencyOpen: boolean;
  /** The standard view the camera looks from (null after free rotation). */
  declare currentView: StandardView | null;
  /** Narrow layout (the container is at most 820 px wide): drawer, sheet and header menu. */
  declare narrow: boolean;

  private catalogValue: AtlasCatalog | null = null;
  private viewerValue: AtlasViewer | null = null;
  private webgl2 = true;
  private unsubscribers: (() => void)[] = [];
  private abort: AbortController | null = null;
  private teardownTimer: ReturnType<typeof setTimeout> | null = null;
  private savedState: ViewState | null = null;
  /** The view "Reset" returns to (the opened link or the embed's view); kept across restarts. */
  private initialView: ViewState | null = null;
  private loadedLinkRaw: string | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  /** The surroundings last announced (only changes of the level or of the transparency on/off are). */
  private announcedSurroundings: SurroundingsInfo | null = null;
  private session = 0;

  constructor() {
    super();
    this.dataUrl = null;
    this.termLang = null;
    this.uiLang = null;
    this.latin = false;
    this.theme = null;
    this.ukNames = null;
    this.quality = null;
    this.layout = 'full';
    this.state = null;
    this.structure = null;
    this.system = null;
    this.surroundingsLevel = null;
    this.view = null;
    this.label = null;
    this.embedHeight = null;
    this.autoload = false;
    this.activated = false;
    this.expanded = false;
    this.leftCollapsed = false;
    this.rightCollapsed = false;
    this.leftWidth = null;
    this.settingsOpen = false;
    this.viewsOpen = false;
    this.transparencyOpen = false;
    this.currentView = null;
    this.narrow = false;
    this.shareBaseUrl = null;
    this.pickGhost = false;
    this.phase = 'idle';
    this.fatal = null;
    this.notice = null;
    this.progress = null;
    this.selection = [];
    this.revision = 0;
    this.panelOpen = false;
    this.shareView = null;
    this.announcement = '';
    this.fullscreen = false;
    this.contextLost = false;
    this.expandedCards = new Set();
    this.sheetOpen = false;
    this.currentQuality = 'standard';
    this.currentLang = 'en';
    this.currentUi = 'en';
    this.currentLatin = false;
  }

  // ------------------------------------------------------------------ public API

  /** Loaded metadata (manifest, dictionaries, search); null before `anatomy:ready` (ui). */
  get catalog(): AtlasCatalog | null {
    return this.catalogValue;
  }

  /** The headless viewer (null without WebGL2 or before the component is ready). */
  get viewer(): AtlasViewer | null {
    return this.viewerValue;
  }

  private requireViewer(): AtlasViewer {
    if (this.viewerValue) return this.viewerValue;
    if (!this.webgl2) throw new AtlasError('WEBGL2_UNAVAILABLE', 'WebGL2 is not available');
    throw new AtlasError('NOT_READY', 'The atlas is not ready yet (wait for anatomy:ready)');
  }

  loadAll(): Promise<OperationResult> {
    return this.requireViewer().loadAll();
  }
  showStructure(id: string): Promise<OperationResult> {
    return this.requireViewer().showStructure(id);
  }
  showSystem(id: string): Promise<OperationResult> {
    return this.requireViewer().showSystem(id);
  }
  /**
   * Transparent surroundings of the selection: with `id`, that structure is added to the
   * selection first; then the level (default: the chosen one, else 1) and the transparency.
   */
  showSurroundings(id?: string, options: { level?: number; transparency?: number } = {}): Promise<OperationResult> {
    return this.requireViewer().showSurroundings(id, options);
  }
  /** Surroundings level: 0 = only the selection … the whole body; `null` = automatic. */
  setSurroundingsLevel(level: number | null): Promise<OperationResult> {
    return this.requireViewer().setSurroundingsLevel(level);
  }
  /** Transparency of everything that is not selected: 0 = opaque … 0.95. */
  setTransparency(value: number): void {
    this.requireViewer().setTransparency(value);
  }
  /** Automatic level and opaque structures. */
  exitSurroundings(): void {
    this.requireViewer().exitSurroundings();
  }
  isolate(ids?: string[]): void {
    this.requireViewer().isolate(ids);
  }
  clearIsolation(): void {
    this.requireViewer().clearIsolation();
  }
  hide(ids: string[]): void {
    this.requireViewer().hide(ids);
  }
  show(ids: string[]): Promise<OperationResult> {
    return this.requireViewer().show(ids);
  }
  showHidden(): void {
    this.requireViewer().showHidden();
  }
  select(ids: string[]): void {
    this.requireViewer().select(ids, 'replace');
  }
  /** Focuses the camera on structures (default: the selection). */
  focusOn(ids?: string[]): void {
    this.requireViewer().focus(ids);
  }
  setView(view: StandardView): void {
    this.requireViewer().setView(view);
  }
  async setQuality(quality: Quality): Promise<OperationResult> {
    this.currentQuality = quality;
    return this.requireViewer().setQuality(quality);
  }
  getState(): ViewState | null {
    return this.viewerValue?.getState() ?? null;
  }
  /** Applies a state object or an encoded link payload (loads the files it needs). */
  async setState(state: ViewState | string): Promise<OperationResult> {
    return this.requireViewer().setState(state);
  }
  /** Returns to the initial state of the opened link, or to the empty scene. */
  reset(): Promise<OperationResult> {
    return this.requireViewer().reset();
  }
  /**
   * Embed: starts the 3D scene (as the "Show 3D" button does). Nothing is requested before this.
   */
  activate(): void {
    if (this.activated) return;
    this.activated = true;
    if (this.isEmbed) registerEmbed(this);
    void this.initialise();
  }

  /**
   * Embed "Open": dispatches a cancelable `anatomy:expand` with the current state; a page can
   * handle it (e.g. open its own window) by calling `preventDefault()`. Otherwise the embed shows
   * the full atlas on the whole screen until fullscreen is left.
   */
  async expand(): Promise<void> {
    const state = this.viewerValue?.getState() ?? null;
    const event = new CustomEvent('anatomy:expand', { detail: { state }, bubbles: true, composed: true, cancelable: true });
    if (!this.dispatchEvent(event)) return;
    this.expanded = true;
    if (!this.fullscreen) await this.toggleFullscreen();
  }

  /** Returns an embed to its placeholder and frees its WebGL context (the view is kept). */
  deactivateEmbed(): boolean {
    if (!this.isEmbed || !this.activated || this.expanded) return false;
    this.session++;
    if (this.viewerValue) this.savedState = this.viewerValue.getState();
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.viewerValue?.dispose();
    this.viewerValue = null;
    this.activated = false;
    unregisterEmbed(this);
    return true;
  }

  /** Link for the current view (uses `share-base-url` or `shareUrlBuilder`). */
  async shareUrl(): Promise<string> {
    const state = this.requireViewer().getState();
    return this.buildShareUrl(await encodeState(state), state);
  }

  // ------------------------------------------------------------------ lifecycle

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.teardownTimer) {
      // Moved within the DOM: keep everything.
      clearTimeout(this.teardownTimer);
      this.teardownTimer = null;
      return;
    }
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('keydown', this.onDocumentKeyDown);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.sizeObserver ??= typeof ResizeObserver === 'function' ? new ResizeObserver(this.onResize) : null;
    this.sizeObserver?.observe(this);
    this.addEventListener('pointerdown', this.onHostPointerDown);
    // An embed shows only its placeholder until the reader starts it: nothing is requested.
    if (this.isEmbed && !this.activated && !this.autoload) return;
    this.activated = true;
    if (this.isEmbed) registerEmbed(this);
    void this.initialise();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // A short DOM move (disconnect + connect in the same task) must not lose the view.
    this.teardownTimer = setTimeout(() => {
      this.teardownTimer = null;
      this.teardown();
    }, 0);
  }

  /** Disposes the viewer and stops loading; its view is kept for the next start. */
  private disposeViewer() {
    this.session++;
    if (this.viewerValue) this.savedState = this.viewerValue.getState();
    this.abort?.abort();
    this.abort = null;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.viewerValue?.dispose();
    this.viewerValue = null;
  }

  private teardown() {
    this.disposeViewer();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('keydown', this.onDocumentKeyDown);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.sizeObserver?.disconnect();
    this.removeEventListener('pointerdown', this.onHostPointerDown);
    unregisterEmbed(this);
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.phase = this.catalogValue ? 'ready' : 'idle';
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('uiLang') && isUiLang(this.uiLang)) this.currentUi = this.uiLang;
    if (changed.has('termLang') || changed.has('latin')) {
      const lang = this.termLang && LANGS.includes(this.termLang as Lang) ? (this.termLang as Lang) : this.currentLang;
      this.applyNames(lang, changed.has('latin') ? this.latin : this.currentLatin);
      // An explicit `ui-lang` wins over the names language set by the site.
      if (isUiLang(this.uiLang)) this.currentUi = this.uiLang;
    }
    if (changed.has('currentUi') || changed.has('strings')) this.revision++;
    if (changed.has('quality') && (this.quality === 'standard' || this.quality === 'economy')) {
      this.currentQuality = this.quality;
      if (this.viewerValue && this.viewerValue.quality !== this.quality) void this.viewerValue.setQuality(this.quality);
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.toggleAttribute('data-expanded', this.expanded);
    if (changed.has('embedHeight') || changed.has('expanded') || changed.has('layout')) {
      const height = Number(this.embedHeight);
      // Set through CSSOM (allowed under a strict CSP); fullscreen uses the whole screen.
      if (this.isEmbed && height > 0 && !this.expanded) this.style.height = `${Math.min(2000, Math.max(160, height))}px`;
      else if (this.isEmbed || changed.get('layout') === 'embed') this.style.removeProperty('height');
    }
    if (changed.has('layout') && !this.isEmbed && !this.activated && this.isConnected) this.activate();
    if (changed.has('dataUrl') && changed.get('dataUrl') !== undefined && this.isConnected) {
      // A different dataset: start over (metadata only); an embed waits for the reader again.
      this.disposeViewer();
      this.catalogValue = null;
      this.savedState = null;
      this.initialView = null;
      this.phase = 'idle';
      if (this.activated) void this.initialise();
    } else if (changed.has('state') && changed.get('state') !== undefined && this.viewerValue && this.state !== this.loadedLinkRaw) {
      void this.applyLinkState(this.state);
    }
  }

  private get uiLanguage(): UiLang {
    return this.currentUi;
  }

  /** One language control: Ukrainian or English names switch the interface too. */
  private followUi(lang: Lang) {
    if (isUiLang(lang)) this.currentUi = lang;
  }

  /**
   * Names display. Latin is not a main language of the interface: `la` (an attribute or an
   * older link) means the interface language plus Latin names alongside.
   */
  private applyNames(lang: Lang, latin: boolean) {
    const main: Lang = lang === 'la' ? this.currentUi : lang;
    const showLatin = latin || lang === 'la';
    this.currentLang = main;
    this.currentLatin = showLatin;
    this.followUi(main);
    const viewer = this.viewerValue;
    if (viewer) {
      if (viewer.lang !== main) viewer.setLang(main);
      if (viewer.latin !== showLatin) viewer.setLatin(showLatin);
    }
  }

  private get text(): UiStrings {
    return resolveStrings(this.uiLanguage, this.strings);
  }

  private get isEmbed(): boolean {
    return this.layout === 'embed';
  }

  private readonly onHostPointerDown = () => touchEmbed(this);

  private sizeObserver: ResizeObserver | null = null;

  /** Narrow layout follows the width of the element itself (as the CSS container queries do). */
  private readonly onResize = (entries: ResizeObserverEntry[]) => {
    const width = entries[entries.length - 1]?.contentRect.width ?? this.clientWidth;
    const narrow = width > 0 && width <= 820;
    if (narrow !== this.narrow) {
      this.narrow = narrow;
      this.settingsOpen = false;
      this.transparencyOpen = false;
    }
  };

  /** Clicks outside an open menu close it. */
  private readonly onDocumentPointerDown = (e: PointerEvent) => {
    if (!this.settingsOpen && !this.viewsOpen && !this.transparencyOpen) return;
    const path = e.composedPath();
    const inside = (selector: string) => {
      const el = this.renderRoot.querySelector(selector);
      return el ? path.includes(el) : false;
    };
    if (this.settingsOpen && !inside('.menu-anchor')) this.settingsOpen = false;
    if (this.viewsOpen && !inside('.views-button') && !inside('.views-popover')) this.viewsOpen = false;
    if (this.transparencyOpen && !inside('.transparency-button') && !inside('.transparency-popover')) this.transparencyOpen = false;
  };

  private async initialise() {
    const session = ++this.session;
    if (this.layout && this.layout !== 'full' && this.layout !== 'embed') {
      console.warn(`svitylo-anatomy: unknown layout="${this.layout}"; using "full"`);
    }
    if (this.quality === 'economy' || this.quality === 'standard') this.currentQuality = this.quality;
    this.abort = new AbortController();
    if (!this.catalogValue) {
      this.phase = 'loading';
      try {
        const dataUrl = this.dataUrl || DEFAULT_DATA_URL;
        const names = { ukrainian: this.ukNames === 'reviewed' ? ('reviewed' as const) : ('any' as const) };
        // Atlases on one page share the metadata of a data folder (an own resolver opts out).
        this.catalogValue = this.dataUrlResolver
          ? await AtlasCatalog.load({
              dataUrl,
              signal: this.abort.signal,
              names,
              resolveDataUrl: (version: string) => this.dataUrlResolver?.(version),
            })
          : await sharedCatalog(dataUrl, names);
      } catch (error) {
        if (session !== this.session) return;
        const e = toAtlasError(error, 'MANIFEST_UNAVAILABLE', 'Metadata could not be loaded');
        this.phase = 'failed';
        this.fatal = { kind: 'error', code: e.code, message: this.errorText(e.code, e.message), retry: 'catalog' };
        this.emitDom('error', { code: e.code, message: e.message, ...e.details });
        return;
      }
      if (session !== this.session) return;
    }
    this.phase = 'ready';
    this.fatal = null;
    this.emitDom('ready', { kind: 'ui' });
    await this.updateComplete;
    if (session !== this.session) return;
    this.webgl2 = isWebGL2Available();
    if (!this.webgl2) {
      this.emitDom('error', { code: 'WEBGL2_UNAVAILABLE', message: 'WebGL2 is not available', recoverable: false });
      this.revision++;
      return;
    }
    if (!this.createViewer(this.catalogValue)) return;
    const pending = this.savedState;
    this.savedState = null;
    if (pending) {
      // A restarted viewer (an embed back from its placeholder, a remount) keeps its "Reset" view.
      this.viewerValue!.setInitialState(this.initialView);
      await this.viewerValue!.setState(pending).catch((e) => this.reportError(e));
    } else if (this.state) {
      await this.applyLinkState(this.state);
    } else if (this.isEmbed) {
      await this.applyEmbedView();
    }
  }

  /** Embed without a state: the structure (or system), its surroundings level and a view. */
  private async applyEmbedView() {
    const viewer = this.viewerValue;
    const target = this.structure || this.system;
    if (!viewer || !target) return;
    try {
      if (this.structure) await viewer.showStructure(this.structure);
      else await viewer.showSystem(target);
      const level = Math.round(Number(this.surroundingsLevel));
      if (level >= 1) await viewer.showSurroundings(target, { level });
      if (this.view && (STANDARD_VIEWS as readonly string[]).includes(this.view)) viewer.setView(this.view as StandardView, { animate: false });
      // "Reset" returns to this view.
      this.initialView = viewer.getState();
      viewer.setInitialState(this.initialView);
    } catch (error) {
      this.reportError(error);
    }
  }

  /** Creates the viewer; false when no WebGL2 context can be created (the atlas works as without WebGL2). */
  private createViewer(catalog: AtlasCatalog): boolean {
    const container = this.renderRoot.querySelector('.viewport') as HTMLElement;
    const background = getComputedStyle(this).getPropertyValue('--_scene').trim() || '#0e1320';
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.viewerValue?.dispose();
    this.viewerValue = null;
    this.announcedSurroundings = null;
    let viewer: AtlasViewer;
    try {
      viewer = new AtlasViewer({
        container,
        catalog,
        quality: this.currentQuality,
        lang: this.currentLang,
        latin: this.currentLatin,
        pickGhost: this.pickGhost,
        background: /^#[0-9a-f]{6}$/i.test(background) ? background : '#0e1320',
      });
    } catch (error) {
      const e = toAtlasError(error, 'WEBGL2_UNAVAILABLE', 'The WebGL2 context could not be created');
      this.webgl2 = false;
      this.emitDom('error', { code: e.code, message: e.message, ...e.details, recoverable: false });
      this.revision++;
      return false;
    }
    this.viewerValue = viewer;
    const forward = <K extends keyof AtlasEventMap>(type: K) =>
      viewer.on(type, (detail) => this.emitDom(type, detail as unknown as Record<string, unknown>));
    this.unsubscribers.push(
      ...(['select', 'hover', 'visibility', 'surroundings', 'camera', 'statechange', 'progress', 'ready', 'error'] as const).map(forward),
      viewer.on('select', (e) => {
        const before = this.selection;
        this.selection = e.ids;
        this.revision++;
        const added = e.ids.filter((id) => !before.includes(id));
        const removed = before.filter((id) => !e.ids.includes(id));
        const label = (id: string) => catalog.names.label(id, this.currentLang);
        if (added.length) {
          // The newest selection is expanded; older cards collapse to their header.
          this.expandedCards = new Set([added[added.length - 1]!]);
          (this.renderRoot.querySelector('svitylo-anatomy-tree') as AtlasTree | null)?.reveal(added[added.length - 1]!);
          this.announce(this.text.selected(label(added[added.length - 1]!)));
        } else if (e.ids.length === 0) {
          this.sheetOpen = false;
          this.announce(this.text.selectionCleared);
        } else if (removed.length) {
          this.announce(this.text.deselected(label(removed[0]!)));
        }
      }),
      viewer.on('visibility', () => this.revision++),
      viewer.on('surroundings', (e) => {
        this.revision++;
        const before = this.announcedSurroundings;
        this.announcedSurroundings = e;
        const s = this.text;
        if (before && before.transparency > 0 !== e.transparency > 0) {
          this.announce(e.transparency > 0 ? s.transparencyOn(Math.round(e.transparency * 100)) : s.transparencyOff);
        } else if (e.level !== null && (e.level !== before?.level || e.levels.length !== before.levels.length)) {
          this.announce(`${s.surroundingsLevelOf(e.level, e.levels.length)}: ${this.levelName(e.level, e.levels)}`);
        }
      }),
      viewer.on('progress', (p) => {
        this.progress = p;
        if (p.phase === 'complete' || p.phase === 'loading') this.revision++;
      }),
      viewer.on('error', (e) => {
        if (e.code === 'CONTEXT_LOST') {
          this.contextLost = true;
          return;
        }
        this.notice = {
          kind: 'error',
          code: e.code,
          message: e.code === 'UNKNOWN_ID' && e.ids?.length ? this.text.unknownIdsInLink(e.ids.join(', ')) : this.errorText(e.code, e.message),
          retry: e.code === 'FILE_UNAVAILABLE' || e.code === 'FILE_INTEGRITY' ? 'files' : null,
        };
      }),
      viewer.on('quality', (q) => (this.currentQuality = q.quality)),
      viewer.on('camera', () => {
        const view = viewer.currentView;
        if (view !== this.currentView) this.currentView = view;
      }),
      viewer.on('lang', (l) => {
        if (l.lang === 'la') {
          // Links made before the Latin toggle: the interface language plus Latin alongside.
          this.applyNames('la', true);
          return;
        }
        this.currentLang = l.lang;
        this.currentLatin = l.latin;
        this.followUi(l.lang);
      }),
    );
    this.revision++;
    return true;
  }

  /**
   * Opens the state of a link in the loaded data, whatever data version made the link: IDs do not
   * change between versions, and the ones this data does not have are reported.
   */
  private async applyLinkState(raw: string | null) {
    const viewer = this.viewerValue;
    if (!raw || !viewer || !this.catalogValue) return;
    this.loadedLinkRaw = raw;
    const session = this.session;
    let state: ViewState;
    try {
      state = await decodeState(raw);
    } catch (error) {
      this.reportError(toAtlasError(error, 'STATE_INVALID', 'Invalid state'));
      return;
    }
    // The viewer may have been recreated meanwhile (a restored context): use the current one.
    const target = this.viewerValue;
    if (session !== this.session || !target) return;
    this.initialView = state;
    target.setInitialState(state);
    try {
      await target.setState(state, { source: 'state' });
    } catch (error) {
      this.reportError(error);
    }
  }

  private buildShareUrl(encoded: string, state: ViewState): string {
    if (this.shareUrlBuilder) return this.shareUrlBuilder(encoded, state);
    const base = new URL(this.shareBaseUrl || location.href, location.href);
    base.hash = `s=${encoded}`;
    return base.href;
  }

  // ------------------------------------------------------------------ events and helpers

  private emitDom(type: string, detail: Record<string, unknown> | object) {
    this.dispatchEvent(new CustomEvent(`anatomy:${type}`, { detail, bubbles: true, composed: true }));
  }

  private errorText(code: AtlasErrorCode | undefined, fallback: string): string {
    return (code && this.text.errors[code]) || fallback || this.text.errorGeneric;
  }

  private reportError(error: unknown) {
    if (!isAtlasError(error)) {
      console.error(error);
      this.notice = { kind: 'error', message: this.text.errorGeneric };
      return;
    }
    this.notice = { kind: 'error', code: error.code, message: this.errorText(error.code, error.message) };
    this.emitDom('error', { code: error.code, message: error.message, ...error.details });
  }

  private announce(message: string) {
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => (this.announcement = message), 250);
  }

  private readonly provider: TreeStateProvider = {
    display: (id: string): DisplayState => {
      const v = this.viewerValue;
      if (!v) return 'absent';
      const d = v.displayOf(id);
      return d;
    },
    load: (id: string): LoadState => this.viewerValue?.loadStateOf(id) ?? 'none',
  };

  private async run(action: () => Promise<unknown> | unknown) {
    try {
      await action();
    } catch (error) {
      this.reportError(error);
    }
  }

  /**
   * A tree row works like a click on the model: it adds the structure to the selection (placing
   * and loading it when needed) or removes it. Selecting zooms the camera to the structure; when
   * other structures cover it, the surroundings turn transparent.
   */
  private onTreeSelect(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    const viewer = this.viewerValue;
    if (!viewer) {
      // Without WebGL2 the tree and the structure card still work.
      this.selection = this.selection.includes(id) ? this.selection.filter((s) => s !== id) : [...this.selection, id];
      if (this.selection.includes(id)) this.expandedCards = new Set([id]);
      return;
    }
    if (!this.catalogValue?.get(id)) return;
    if (viewer.selection.includes(id)) viewer.select([id], 'remove', { source: 'tree' });
    else {
      void this.run(() => viewer.selectStructure(id, { source: 'tree', ensureVisible: true }));
      this.closePanelIfNarrow();
    }
  }

  /** A search result is selected (never deselected) and zoomed to; the search field is cleared. */
  private onSearchSelect(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    const viewer = this.viewerValue;
    (this.renderRoot.querySelector('svitylo-anatomy-tree') as AtlasTree | null)?.reveal(id);
    if (!viewer) {
      if (!this.selection.includes(id)) this.selection = [...this.selection, id];
      this.expandedCards = new Set([id]);
      return;
    }
    if (!this.catalogValue?.get(id)) return;
    void this.run(() => viewer.selectStructure(id, { source: 'search', ensureVisible: true }));
    this.closePanelIfNarrow();
  }

  private onTreeVisibility(e: CustomEvent<{ id: string }>) {
    const viewer = this.viewerValue;
    if (!viewer) return;
    const { id } = e.detail;
    const state = viewer.displayOf(id);
    void this.run(async () => {
      if (state === 'opaque' || state === 'ghost' || state === 'mixed') viewer.hide([id], { source: 'tree' });
      else await viewer.show([id], { source: 'tree' });
    });
  }

  private onInfoAction(e: CustomEvent<{ action: InfoAction; id: string }>) {
    const viewer = this.viewerValue;
    const { action, id } = e.detail;
    if (action === 'toggle') {
      const next = new Set(this.expandedCards);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.expandedCards = next;
      return;
    }
    if (action === 'deselect') {
      if (viewer) viewer.select([id], 'remove', { source: 'ui' });
      else this.selection = this.selection.filter((s) => s !== id);
      return;
    }
    if (!viewer) return;
    void this.run(async () => {
      switch (action) {
        case 'focus':
          viewer.focus([id]);
          break;
        case 'isolate':
          viewer.isolate([id], { source: 'ui' });
          break;
        case 'clear-isolation':
          viewer.clearIsolation({ source: 'ui' });
          break;
        case 'hide':
          viewer.hide([id], { source: 'ui' });
          break;
        case 'show':
          await viewer.show([id], { source: 'ui' });
          break;
      }
    });
  }

  private async openShare() {
    const viewer = this.viewerValue;
    if (!viewer) return;
    const state = viewer.getState();
    try {
      const encoded = await encodeState(state);
      this.shareView = { url: this.buildShareUrl(encoded, state) };
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.shareView =
        code === 'STATE_TOO_LARGE'
          ? { tooLarge: true, json: JSON.stringify(state, null, 2) }
          : { error: this.text.shareUnavailable, json: JSON.stringify(state, null, 2) };
    }
    await this.updateComplete;
    (this.renderRoot.querySelector('dialog.share') as HTMLDialogElement | null)?.showModal();
  }

  private async copyShare() {
    const url = this.shareView?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.shareView = { ...this.shareView, copied: true };
    } catch {
      const input = this.renderRoot.querySelector('.share-url input') as HTMLInputElement | null;
      input?.select();
    }
  }

  private downloadJson() {
    const json = this.shareView?.json;
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'svitylo-anatomy-view.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private openSources() {
    (this.renderRoot.querySelector('dialog.sources') as HTMLDialogElement | null)?.showModal();
  }

  private async toggleFullscreen() {
    if (this.fullscreen) {
      if (document.fullscreenElement === this) await document.exitFullscreen().catch(() => undefined);
      this.removeAttribute('data-pseudo-fullscreen');
      this.fullscreen = false;
      this.expanded = false;
      return;
    }
    if (typeof this.requestFullscreen === 'function' && document.fullscreenEnabled) {
      try {
        await this.requestFullscreen();
        return;
      } catch {
        // fall back below
      }
    }
    // iOS Safari (no element fullscreen): fill the viewport instead.
    this.setAttribute('data-pseudo-fullscreen', '');
    this.fullscreen = true;
  }

  private readonly onFullscreenChange = () => {
    this.fullscreen = document.fullscreenElement === this || this.hasAttribute('data-pseudo-fullscreen');
    // An expanded embed returns to its place when fullscreen ends.
    if (!this.fullscreen) this.expanded = false;
  };

  private readonly onDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (this.settingsOpen || this.viewsOpen || this.transparencyOpen)) {
      const button = this.settingsOpen ? '.settings-button' : this.viewsOpen ? '.views-button' : '.transparency-button';
      this.settingsOpen = false;
      this.viewsOpen = false;
      this.transparencyOpen = false;
      (this.renderRoot.querySelector(button) as HTMLElement | null)?.focus();
      return;
    }
    if (e.key === 'Escape' && this.hasAttribute('data-pseudo-fullscreen')) {
      this.removeAttribute('data-pseudo-fullscreen');
      this.fullscreen = false;
      this.expanded = false;
    }
  };

  private togglePanel(open = !this.panelOpen) {
    this.panelOpen = open;
    void this.updateComplete.then(() => {
      if (open) (this.renderRoot.querySelector('svitylo-anatomy-tree') as AtlasTree | null)?.focus();
      else (this.renderRoot.querySelector('.menu-button') as HTMLElement | null)?.focus();
    });
  }

  private closePanelIfNarrow() {
    if (this.panelOpen) this.panelOpen = false;
  }

  private onPanelKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.panelOpen) {
      e.stopPropagation();
      this.togglePanel(false);
    }
  }

  // ------------------------------------------------------------------ rendering

  private renderProgress() {
    const p = this.progress;
    const s = this.text;
    if (!p || p.phase === 'idle' || p.phase === 'complete') return nothing;
    if (p.phase === 'cancelled') {
      return html`<div class="banner" data-kind="info" role="status">
        <span>${s.cancelled}</span>
        ${this.viewerValue?.canResumeLoading
          ? html`<button class="btn" @click=${() => this.run(() => this.viewerValue?.resumeLoading())}><span class="label-text">${s.resume}</span></button>`
          : nothing}
        <button class="btn icon-only" aria-label=${s.dismiss} @click=${() => (this.progress = null)}>${icons.close}</button>
      </div>`;
    }
    if (p.phase === 'error') {
      return html`<div class="banner" data-kind="error" role="alert">
        <span>${s.partialLoad}</span>
        <button class="btn" @click=${() => this.run(() => this.viewerValue?.retry())}><span class="label-text">${s.retry}</span></button>
      </div>`;
    }
    const pct = p.totalBytes ? Math.round((p.loadedBytes / p.totalBytes) * 100) : 0;
    const mb = (v: number) => (v / 1e6).toFixed(1);
    return html`<div class="banner" role="status" aria-live="polite">
      <div class="bar-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}>
        <span ${cssProps({ width: `${pct}%` })}></span>
      </div>
      <span>${s.progress(p.loadedFiles, p.totalFiles, mb(p.loadedBytes), mb(p.totalBytes))}</span>
      <button class="btn" @click=${() => this.viewerValue?.cancelLoading()}><span class="label-text">${s.cancel}</span></button>
    </div>`;
  }

  private renderNotice() {
    const n = this.notice;
    if (!n) return nothing;
    const s = this.text;
    return html`<div class="banner" data-kind=${n.kind} role=${n.kind === 'error' ? 'alert' : 'status'}>
      ${n.kind === 'error' ? icons.warning : icons.info}
      <span>${n.message}</span>
      ${n.retry === 'files'
        ? html`<button class="btn" @click=${() => {
            this.notice = null;
            void this.run(() => this.viewerValue?.retry());
          }}><span class="label-text">${s.retry}</span></button>`
        : nothing}
      <button class="btn icon-only" aria-label=${s.dismiss} @click=${() => (this.notice = null)}>${icons.close}</button>
    </div>`;
  }

  /** Name of a surroundings level: only the selection (0), the groups of the level, or the whole body. */
  private levelName(level: number, levels: readonly (readonly string[] | null)[]): string {
    if (level === 0) return this.text.selectionOnly;
    const groups = levels[level - 1];
    const catalog = this.catalogValue;
    if (!groups || !catalog) return this.text.wholeBody;
    return groups.map((id) => catalog.names.label(id, this.currentLang)).join(', ');
  }

  /**
   * Surroundings level of the selection, from 0 (only the selection) to the whole body. It shows
   * the level of what is visible; a step chooses the level, and the next selections keep it.
   * Always rendered (disabled without a selection), so nothing around it moves. Wide layouts have
   * it in the selection block; narrow ones at the end of the camera bar (`bar`), in the same block.
   */
  private renderLevelStepper(viewer: AtlasViewer, bar = false) {
    const s = this.text;
    const { level, levels, explicit } = viewer.surroundings;
    const total = levels.length;
    const detail = level === null ? s.surroundingsNoSelection : this.levelName(level, levels);
    const step = (delta: number) => {
      if (level !== null) void this.run(() => viewer.setSurroundingsLevel(level + delta, { source: 'ui' }));
    };
    const button = bar ? 'pill-btn' : 'btn icon-only';
    const caption =
      level === null
        ? s.surroundingsDepth
        : bar
          ? // A phone has room only for the short label.
            html`<span class="level-long">${s.surroundingsLevelOf(level, total)}</span><span class="level-short">${s.surroundingsLevelShort(level, total)}</span>`
          : s.surroundingsLevelOf(level, total);
    return html`<div
      class=${bar ? 'level-stepper level-bar' : 'stepper level-stepper'}
      role="group"
      aria-label=${s.surroundingsDepth}
      ?data-off=${level === null}
      ?data-explicit=${explicit && level !== null}
    >
      <button class=${button} aria-label=${s.lessSurroundings} title=${s.lessSurroundings} ?disabled=${level === null || level <= 0} @click=${() => step(-1)}>
        ${icons.minus}
      </button>
      <span class="stepper-label" title=${detail}
        ><span class="stepper-level">${caption}</span><span class="stepper-name">${detail}</span></span
      >
      <button class=${button} aria-label=${s.moreSurroundings} title=${s.moreSurroundings} ?disabled=${level === null || level >= total} @click=${() => step(1)}>
        ${icons.plus}
      </button>
    </div>`;
  }

  /** Transparency of everything that is not selected: 0 (the left end) = opaque. */
  private renderTransparency(viewer: AtlasViewer) {
    const s = this.text;
    const value = viewer.transparency;
    const percent = Math.round(value * 100);
    return html`<label class="transparency" ?data-active=${value > 0}>
      ${icons.ghost}
      <input
        type="range"
        min="0"
        max=${TRANSPARENCY_RANGE.max}
        step="0.01"
        .value=${String(value)}
        aria-label=${s.transparency}
        aria-valuetext=${percent ? `${percent}%` : s.transparencyNone}
        @input=${(e: Event) => viewer.setTransparency(Number((e.target as HTMLInputElement).value), { source: 'ui' })}
      />
      <span class="transparency-value" aria-hidden="true">${percent}%</span>
    </label>`;
  }

  /**
   * Camera bar over the scene: the views menu (named views), zoom, "overall view" and the
   * transparency slider of the surroundings (on a narrow scene, a button that opens it). Narrow
   * layouts also have the surroundings level here, where the wide ones have the logo.
   */
  private renderSceneControls() {
    const viewer = this.viewerValue;
    if (!viewer) return nothing;
    const s = this.text;
    const current = this.currentView;
    const go = (view: StandardView) => {
      viewer.setView(view);
      this.currentView = view;
      this.viewsOpen = false;
    };
    return html`<div class="scene-controls" role="toolbar" aria-label=${s.camera} ?data-level=${this.narrow}>
      <div class="pill glass">
        <button
          class="pill-btn text views-button"
          aria-haspopup="true"
          aria-expanded=${String(this.viewsOpen)}
          aria-controls="views-menu"
          aria-label=${current ? `${s.views}: ${s.view[current]}` : s.views}
          title=${s.views}
          @click=${() => {
            this.viewsOpen = !this.viewsOpen;
            this.transparencyOpen = false;
          }}
        >
          <span class="pill-label">${current ? s.view[current] : s.views}</span>${icons.chevronUp}
        </button>
        <span class="sep zoom-part" aria-hidden="true"></span>
        <button class="pill-btn zoom-part" aria-label=${s.zoomOut} title=${s.zoomOut} @click=${() => viewer.zoom(1.25)}>${icons.zoomOut}</button>
        <button class="pill-btn zoom-part" aria-label=${s.zoomIn} title=${s.zoomIn} @click=${() => viewer.zoom(0.8)}>${icons.zoomIn}</button>
        <span class="sep" aria-hidden="true"></span>
        <button class="pill-btn" aria-label=${s.fitAll} title=${s.fitAll} @click=${() => viewer.frameAll()}>${icons.fit}</button>
        <span class="sep" aria-hidden="true"></span>
        ${this.renderTransparency(viewer)}
        <button
          class="pill-btn transparency-button"
          aria-haspopup="true"
          aria-expanded=${String(this.transparencyOpen)}
          aria-controls="transparency-menu"
          aria-label=${s.transparency}
          title=${s.transparency}
          ?data-active=${viewer.transparency > 0}
          @click=${() => {
            this.transparencyOpen = !this.transparencyOpen;
            this.viewsOpen = false;
          }}
        >
          ${icons.ghost}
        </button>
        ${this.narrow ? html`<span class="sep level-sep" aria-hidden="true"></span>${this.renderLevelStepper(viewer, true)}` : nothing}
      </div>
      <div class="pill-popover views-popover glass" id="views-menu" role="group" aria-label=${s.views} ?hidden=${!this.viewsOpen}>
        ${STANDARD_VIEWS.map(
          (view) => html`<button class="menu-item" aria-pressed=${String(current === view)} @click=${() => go(view)}>${s.view[view]}</button>`,
        )}
      </div>
      <div class="pill-popover transparency-popover glass" id="transparency-menu" role="group" aria-label=${s.transparency} ?hidden=${!this.transparencyOpen}>
        <span class="transparency-title">${s.transparency}</span>
        ${this.renderTransparency(viewer)}
      </div>
    </div>`;
  }

  private sheetPointer: { y: number; id: number } | null = null;
  private sheetSwiped = false;

  private toggleSheet(open = !this.sheetOpen) {
    const count = (this.viewerValue ? this.viewerValue.selection : this.selection).length;
    this.sheetOpen = open && count > 0;
  }

  private readonly onSheetPointerDown = (e: PointerEvent) => {
    this.sheetPointer = { y: e.clientY, id: e.pointerId };
    this.sheetSwiped = false;
  };

  /** A vertical swipe on the summary bar opens (up) or closes (down) the sheet. */
  private readonly onSheetPointerUp = (e: PointerEvent) => {
    const start = this.sheetPointer;
    this.sheetPointer = null;
    if (!start || start.id !== e.pointerId) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) < 24) return;
    this.sheetSwiped = true;
    this.toggleSheet(dy < 0);
  };

  private readonly onSheetBarClick = () => {
    if (this.sheetSwiped) {
      this.sheetSwiped = false;
      return;
    }
    this.toggleSheet();
  };

  private readonly onSheetKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.sheetOpen) {
      e.stopPropagation();
      this.sheetOpen = false;
      (this.renderRoot.querySelector('.sheet-bar') as HTMLElement | null)?.focus();
    }
  };

  /**
   * The right column (a sheet on narrow layouts): what applies to the whole selection first —
   * centre the camera, isolate, hide and the surroundings level — then one card per structure
   * with the actions for that structure only. The column keeps its width when nothing is
   * selected.
   */
  private renderSelection() {
    const s = this.text;
    const catalog = this.catalogValue;
    const viewer = this.viewerValue;
    const ids = [...(viewer ? viewer.selection : this.selection)].reverse();
    const open = this.sheetOpen && ids.length > 0;
    const newest = ids[0] ? catalog?.names.display(ids[0], this.currentLang) : null;
    const isolated = viewer?.isolated ?? false;
    const anyVisible = viewer ? ids.some((id) => ['opaque', 'ghost', 'mixed'].includes(viewer.displayOf(id))) : false;
    // "Hide" is a toggle: pressed while the whole selection is hidden, and then shows it again.
    const allHidden = viewer ? ids.length > 0 && ids.every((id) => viewer.displayOf(id) === 'hidden') : false;
    return html`<aside class="info" id="info" aria-label=${s.info} ?data-empty=${ids.length === 0} ?data-open=${open} @keydown=${this.onSheetKeyDown}>
      <div class="sheet-bar" @pointerdown=${this.onSheetPointerDown} @pointerup=${this.onSheetPointerUp}>
        <button
          class="sheet-toggle"
          aria-expanded=${String(open)}
          aria-controls="selection-body"
          ?disabled=${ids.length === 0}
          @click=${this.onSheetBarClick}
        >
          <span class="sheet-summary"
            >${ids.length
              ? html`${s.selectedCount(ids.length)}${newest ? html` · <span lang=${newest.lang}>${newest.text}</span>` : nothing}`
              : s.nothingSelected}</span
          >
          ${ids.length ? (open ? icons.chevronDown : icons.chevronUp) : nothing}
        </button>
      </div>
      <div class="sheet-body" id="selection-body">
        <div class="selection-head">
          <span>${ids.length ? s.selectedCount(ids.length) : s.nothingSelected}</span>
          <button
            class="btn small ghost"
            ?disabled=${ids.length === 0}
            @click=${() => {
              if (viewer) viewer.clearSelection({ source: 'ui' });
              else this.selection = [];
            }}
          >
            ${s.clearSelection}
          </button>
        </div>
        ${viewer
          ? html`<div class="selection-tools">
              <div class="tool-row" role="group" aria-label=${s.wholeSelection}>
                <button class="btn small" ?disabled=${ids.length === 0} title=${s.focusHint} @click=${() => viewer.focus()}>
                  ${icons.focus}<span>${s.focus}</span>
                </button>
                <button
                  class="btn small"
                  aria-pressed=${String(isolated)}
                  ?disabled=${!isolated && ids.length === 0}
                  title=${isolated ? s.clearIsolation : s.isolateSelectionHint}
                  @click=${() => (isolated ? viewer.clearIsolation({ source: 'ui' }) : viewer.isolate(undefined, { source: 'ui' }))}
                >
                  ${icons.isolate}<span>${s.isolate}</span>
                </button>
                <button
                  class="btn small"
                  aria-pressed=${String(allHidden)}
                  ?disabled=${!anyVisible && !allHidden}
                  title=${allHidden ? s.showSelectionHint : s.hideSelectionHint}
                  @click=${() =>
                    allHidden ? void this.run(() => viewer.show(viewer.selection, { source: 'ui' })) : viewer.hide(viewer.selection, { source: 'ui' })}
                >
                  ${icons.eyeOff}<span>${s.hide}</span>
                </button>
              </div>
              ${this.narrow ? nothing : this.renderLevelStepper(viewer)}
            </div>`
          : nothing}
        ${ids.length
          ? html`<ul class="cards">
              ${repeat(
                ids,
                (id) => id,
                (id) => html`<li>
                  <svitylo-anatomy-info
                    .catalog=${catalog}
                    .lang=${this.currentLang}
                    .strings=${s}
                    .structureId=${id}
                    .display=${this.provider.display(id)}
                    .isolatedHere=${viewer?.isolates(id) ?? false}
                    .viewerAvailable=${Boolean(viewer)}
                    .expanded=${this.expandedCards.has(id)}
                    .revision=${this.revision}
                    @info-action=${this.onInfoAction}
                  ></svitylo-anatomy-info>
                </li>`,
              )}
            </ul>`
          : html`<p class="empty-hint">${icons.info}<span>${s.selectionEmptyHint}</span></p>`}
      </div>
    </aside>`;
  }

  private renderSources() {
    const catalog = this.catalogValue;
    const s = this.text;
    const uiLang = this.uiLanguage;
    return html`<dialog class="sources" aria-labelledby="sources-title">
      <div class="dialog-head">
        <h2 id="sources-title">${s.sourcesTitle}</h2>
        <button class="btn icon-only" aria-label=${s.close} @click=${(e: Event) => ((e.target as HTMLElement).closest('dialog') as HTMLDialogElement).close()}>
          ${icons.close}
        </button>
      </div>
      <div class="dialog-body">
        <p>${s.sourcesIntro}</p>
        ${catalog
          ? html`<p class="muted">${catalog.manifest.notices.review[uiLang] ?? catalog.manifest.notices.review.en}</p>
              ${catalog.manifest.notices.data ? html`<p class="muted">${catalog.manifest.notices.data[uiLang] ?? catalog.manifest.notices.data.en}</p>` : nothing}
              ${catalog.manifest.assets.map(
                (a) => html`<section class="asset">
                  <h3>${a.title}</h3>
                  <dl>
                    <dt>${s.author}</dt>
                    <dd>${a.authors.join('; ')}</dd>
                    <dt>${s.licence}</dt>
                    <dd><a href=${a.license.url} target="_blank" rel="noopener noreferrer">${a.license.name}</a> (${a.license.id})</dd>
                    <dt>${s.source}</dt>
                    <dd><a href=${a.source.url} target="_blank" rel="noopener noreferrer">${a.source.name}</a>, ${a.source.version}</dd>
                    <dt>${s.attribution}</dt>
                    <dd>${a.attribution}</dd>
                    <dt>${s.changes}</dt>
                    <dd>${a.changes}</dd>
                    <dt>${s.permissionBasis}</dt>
                    <dd>${a.permissionBasis}</dd>
                    <dt>${s.audit}</dt>
                    <dd>${s.auditStatus[a.audit.status]} · ${a.included ? s.included : s.excluded} · ${s.commercialUse[a.commercialUse]}</dd>
                  </dl>
                </section>`,
              )}
              <p>
                ${s.releaseDocuments}:
                <a href=${catalog.url(catalog.manifest.reports.attribution.path)} target="_blank" rel="noopener noreferrer">ATTRIBUTION.md</a>,
                <a href=${catalog.url(catalog.manifest.reports.licenses.path)} target="_blank" rel="noopener noreferrer">LICENSES.md</a>,
                <a href=${catalog.url('reports/COVERAGE.md')} target="_blank" rel="noopener noreferrer">COVERAGE.md</a>
              </p>`
          : nothing}
        <section class="asset">
          <h3>${s.codeLicence}</h3>
          <p>${s.codeLicenceText}</p>
        </section>
      </div>
    </dialog>`;
  }

  private renderShare() {
    const s = this.text;
    const view = this.shareView;
    return html`<dialog class="share" aria-labelledby="share-title" @close=${() => (this.shareView = null)}>
      <div class="dialog-head">
        <h2 id="share-title">${s.shareTitle}</h2>
        <button class="btn icon-only" aria-label=${s.close} @click=${(e: Event) => ((e.target as HTMLElement).closest('dialog') as HTMLDialogElement).close()}>
          ${icons.close}
        </button>
      </div>
      <div class="dialog-body">
        ${view?.url
          ? html`<div class="share-url">
                <input readonly .value=${view.url} aria-label=${s.shareTitle} @focus=${(e: Event) => (e.target as HTMLInputElement).select()} />
                <button class="btn" @click=${this.copyShare}>${s.shareCopy}</button>
                ${typeof navigator !== 'undefined' && 'share' in navigator
                  ? html`<button class="btn" @click=${() => navigator.share({ url: view.url!, title: s.appLabel }).catch(() => undefined)}>
                      ${s.shareNative}
                    </button>`
                  : nothing}
              </div>
              <p class="muted" role="status">${view.copied ? s.shareCopied : ''}</p>`
          : nothing}
        ${view?.tooLarge || view?.error
          ? html`<p role="alert">${view.tooLarge ? s.shareTooLarge : view.error}</p>
              <button class="btn" @click=${this.downloadJson}>${icons.download}${s.shareDownloadJson}</button>`
          : nothing}
      </div>
    </dialog>`;
  }

  /** Progress and notices live in the structures panel; without it they float over the scene. */
  private get statusInPanel(): boolean {
    return !this.narrow && !this.leftCollapsed && (!this.isEmbed || this.expanded);
  }

  private renderStage() {
    const s = this.text;
    const viewer = this.viewerValue;
    // An embed with a target view never offers "load everything" while it is being prepared.
    const embedTarget = this.isEmbed && Boolean(this.state || this.structure || this.system);
    const empty = viewer && !embedTarget ? viewer.sceneIsEmpty && (!this.progress || this.progress.phase !== 'loading') : false;
    const p = this.progress;
    const loading = p?.phase === 'loading';
    const pct = loading && p.totalBytes ? Math.round((p.loadedBytes / p.totalBytes) * 100) : 0;
    const shortLogo = this.narrow && (!this.isEmbed || this.expanded);
    return html`<main class="stage" ?data-short-logo=${shortLogo}>
      <div class="viewport" tabindex="0" role="application" aria-roledescription="3D" aria-label=${s.viewportLabel}></div>
      ${loading ? html`<div class="progress-line" aria-hidden="true"><span ${cssProps({ width: `${pct}%` })}></span></div>` : nothing}
      ${this.phase === 'loading'
        ? html`<div class="center"><div class="card" role="status"><p>${s.loading}</p></div></div>`
        : nothing}
      ${this.fatal
        ? html`<div class="center">
            <div class="card" role="alert">
              <h2>${this.fatal.message}</h2>
              <button class="btn primary" @click=${() => {
                this.fatal = null;
                void this.initialise();
              }}><span class="label-text">${s.retry}</span></button>
            </div>
          </div>`
        : nothing}
      ${this.phase === 'ready' && !this.webgl2
        ? html`<div class="center"><div class="card" role="alert"><h2>${s.webgl2Title}</h2><p>${s.webgl2Text}</p></div></div>`
        : nothing}
      ${empty
        ? html`<div class="center">
            <div class="card">
              <h2>${s.emptyTitle}</h2>
              <p>${s.emptyText}</p>
              <button class="btn primary load-all" @click=${() => this.run(() => this.viewerValue?.loadAll())}>
                ${icons.layersAll}<span>${s.loadAll}</span>
              </button>
            </div>
          </div>`
        : nothing}
      ${this.contextLost
        ? html`<div class="center">
            <div class="card" role="alert">
              <h2>${s.contextLostTitle}</h2>
              <p>${s.contextLostText}</p>
              <button class="btn primary" @click=${() => {
                this.contextLost = false;
                try {
                  this.viewerValue?.recreateRenderer();
                } catch (error) {
                  this.reportError(error);
                }
              }}><span>${s.restore}</span></button>
            </div>
          </div>`
        : nothing}
      ${this.statusInPanel ? nothing : html`<div class="status">${this.renderProgress()}${this.renderNotice()}</div>`}
      ${this.isEmbed && !this.expanded ? this.renderEmbedBar() : this.renderSceneControls()}
      ${this.renderBrand(shortLogo)}
    </main>`;
  }

  /**
   * The mandatory Svitylo logo with its link: the full logo at the bottom corner of the scene, or
   * (narrow layouts of the full atlas, `short`) the mark alone in its top corner.
   */
  private renderBrand(short = false) {
    const s = this.text;
    return html`<a class="brand" href=${SVITYLO_URL} target="_blank" rel="noopener noreferrer" aria-label=${s.brandLabel} title=${SVITYLO_NAME} ?data-short=${short}
      >${short ? logoMark : logo}</a
    >`;
  }

  /** Embed before it is started: a label and a button; nothing is loaded yet. */
  private renderPlaceholder() {
    const s = this.text;
    const label = this.label || s.embedTitle;
    return html`<div class="embed-placeholder" lang=${this.uiLanguage}>
      <button class="embed-start glass" aria-label=${s.embedStartLabel(label)} @click=${() => this.activate()}>
        ${icons.cube}
        <span class="embed-title">${label}</span>
        <span class="embed-cta">${s.embedStart}</span>
      </button>
      ${this.renderBrand()}
    </div>`;
  }

  /** Embed controls over the scene: the selected structure, reset and "open". */
  private renderEmbedBar() {
    const s = this.text;
    const viewer = this.viewerValue;
    const primary = viewer?.primarySelection;
    const name = primary ? this.catalogValue?.names.display(primary, this.currentLang) : null;
    const latin = primary && this.currentLatin && this.catalogValue ? latinAlongside(this.catalogValue, primary, name) : null;
    return html`<div class="embed-bar">
      ${name
        ? html`<span class="embed-chip glass" lang=${name.lang}
            >${name.text}${latin ? html` <span class="embed-latin" lang="la">${latin}</span>` : nothing}</span
          >`
        : html`<span></span>`}
      <div class="embed-actions glass">
        <button class="pill-btn" ?disabled=${!viewer} aria-label=${s.reset} title=${s.reset} @click=${() => this.run(() => viewer?.reset())}>
          ${icons.reset}
        </button>
        <button class="pill-btn embed-expand" title=${s.embedOpenHint} @click=${() => this.expand()}>
          ${icons.fullscreen}<span class="embed-expand-label">${s.embedOpen}</span>
        </button>
      </div>
    </div>`;
  }

  /**
   * Top bar: panel toggles, search and what applies to the whole atlas — load everything,
   * share, reset, settings and fullscreen. On narrow layouts the actions move into the menu.
   */
  private renderHeader() {
    const s = this.text;
    const catalog = this.catalogValue;
    const viewer = this.viewerValue;
    const count = (viewer ? viewer.selection : this.selection).length;
    const fullscreenLabel = this.fullscreen ? s.exitFullscreen : s.fullscreen;
    return html`<header class="bar">
      <button
        class="btn ghost icon-only panel-toggle wide-only"
        aria-controls="panel"
        aria-expanded=${String(!this.leftCollapsed)}
        aria-label=${this.leftCollapsed ? s.showStructuresPanel : s.hideStructuresPanel}
        title=${this.leftCollapsed ? s.showStructuresPanel : s.hideStructuresPanel}
        @click=${() => (this.leftCollapsed = !this.leftCollapsed)}
      >
        ${this.leftCollapsed ? icons.panelLeftOpen : icons.panelLeftClose}
      </button>
      <button
        class="btn ghost icon-only only-narrow menu-button"
        aria-label=${s.menu}
        aria-controls="panel"
        aria-expanded=${String(this.panelOpen)}
        @click=${() => this.togglePanel()}
      >
        ${icons.menu}
      </button>
      <svitylo-anatomy-search
        .catalog=${catalog}
        .lang=${this.currentLang}
        .latin=${this.currentLatin}
        .strings=${s}
        @search-select=${this.onSearchSelect}
      ></svitylo-anatomy-search>
      <div class="actions">
        <button class="btn ghost action wide-only" ?disabled=${!viewer} aria-label=${s.loadAll} title=${s.loadAllHint} @click=${() => this.run(() => viewer?.loadAll())}>
          ${icons.layersAll}<span class="label-text">${s.loadAll}</span>
        </button>
        <button class="btn ghost action wide-only" ?disabled=${!viewer} aria-label=${s.share} title=${s.share} @click=${this.openShare}>
          ${icons.share}<span class="label-text">${s.share}</span>
        </button>
        <button class="btn ghost action wide-only" ?disabled=${!viewer} aria-label=${s.reset} title=${s.reset} @click=${() => this.run(() => viewer?.reset())}>
          ${icons.reset}<span class="label-text">${s.reset}</span>
        </button>
        ${this.renderSettings()}
        <button class="btn ghost icon-only wide-only" aria-label=${fullscreenLabel} title=${fullscreenLabel} @click=${this.toggleFullscreen}>
          ${this.fullscreen ? icons.exitFullscreen : icons.fullscreen}
        </button>
        <button
          class="btn ghost icon-only panel-toggle wide-only"
          aria-controls="info"
          aria-expanded=${String(!this.rightCollapsed)}
          aria-label=${this.rightCollapsed ? s.showInfoPanel : s.hideInfoPanel}
          title=${this.rightCollapsed ? s.showInfoPanel : s.hideInfoPanel}
          @click=${() => (this.rightCollapsed = !this.rightCollapsed)}
        >
          ${this.rightCollapsed ? icons.panelRightOpen : icons.panelRightClose}
          ${this.rightCollapsed && count ? html`<span class="badge-count" aria-hidden="true">${count}</span>` : nothing}
        </button>
      </div>
    </header>`;
  }

  /** Runs a menu command and closes the menu. */
  private menuAction(action: () => unknown) {
    this.settingsOpen = false;
    void this.run(action);
  }

  private toggleSettings(open = !this.settingsOpen) {
    this.settingsOpen = open;
    this.viewsOpen = false;
    if (open) void this.updateComplete.then(() => (this.renderRoot.querySelector('#settings select, #settings button') as HTMLElement | null)?.focus());
  }

  /** Settings: language, Latin names, economy mode, sources (plus the atlas actions on narrow layouts). */
  private renderSettings() {
    const s = this.text;
    const viewer = this.viewerValue;
    const open = this.settingsOpen;
    const fullscreenLabel = this.fullscreen ? s.exitFullscreen : s.fullscreen;
    return html`<div class="menu-anchor">
      <button
        class="btn ghost icon-only settings-button"
        aria-haspopup="dialog"
        aria-expanded=${String(open)}
        aria-controls="settings"
        aria-label=${s.settings}
        title=${s.settings}
        @click=${() => this.toggleSettings()}
      >
        ${icons.settings}
      </button>
      <div class="popover" id="settings" role="dialog" aria-label=${s.settings} ?hidden=${!open}>
        ${this.narrow
          ? html`<div class="popover-section">
              <button class="menu-item" ?disabled=${!viewer} @click=${() => this.menuAction(() => viewer?.loadAll())}>${icons.layersAll}<span>${s.loadAll}</span></button>
              <button class="menu-item" ?disabled=${!viewer} @click=${() => this.menuAction(() => this.openShare())}>${icons.share}<span>${s.share}</span></button>
              <button class="menu-item" ?disabled=${!viewer} @click=${() => this.menuAction(() => viewer?.reset())}>${icons.reset}<span>${s.reset}</span></button>
              <button class="menu-item" @click=${() => this.menuAction(() => this.toggleFullscreen())}>
                ${this.fullscreen ? icons.exitFullscreen : icons.fullscreen}<span>${fullscreenLabel}</span>
              </button>
            </div>`
          : nothing}
        <label class="field">
          <span>${s.termLanguage}</span>
          <select
            class="lang"
            title=${s.languageHint}
            .value=${this.currentLang}
            @change=${(e: Event) => {
              this.applyNames((e.target as HTMLSelectElement).value as Lang, this.currentLatin);
              this.revision++;
            }}
          >
            ${MAIN_LANGS.map((l) => html`<option value=${l} ?selected=${l === this.currentLang}>${s.langNames[l]}</option>`)}
          </select>
        </label>
        <label class="toggle-row" title=${s.latinHint}>
          <span lang=${this.uiLanguage}>${s.latinToggle}</span>
          <input
            class="switch latin-toggle"
            type="checkbox"
            role="switch"
            .checked=${this.currentLatin}
            @change=${(e: Event) => {
              this.applyNames(this.currentLang, (e.target as HTMLInputElement).checked);
              this.revision++;
            }}
          />
        </label>
        <label class="toggle-row" title=${s.economyHint}>
          <span>${s.economy}<small>${s.economyHint}</small></span>
          <input
            class="switch"
            type="checkbox"
            role="switch"
            .checked=${this.currentQuality === 'economy'}
            ?disabled=${!viewer}
            @change=${(e: Event) => void this.run(() => this.setQuality((e.target as HTMLInputElement).checked ? 'economy' : 'standard'))}
          />
        </label>
        <button class="menu-item" @click=${() => this.menuAction(() => this.openSources())}>${icons.book}<span>${s.sources}</span></button>
      </div>
    </div>`;
  }

  /** Visibility of the scene: isolation and hidden structures, with the way back. */
  private renderVisibilityStatus() {
    const viewer = this.viewerValue;
    if (!viewer) return nothing;
    const s = this.text;
    const hidden = viewer.hiddenCount;
    return html`${viewer.isolated
      ? html`<div class="status-line">
          <span>${s.isolatedStatus}</span>
          <button class="btn small ghost" @click=${() => viewer.clearIsolation({ source: 'ui' })}>${s.clearIsolation}</button>
        </div>`
      : nothing}${hidden > 0
      ? html`<button class="status-line action" @click=${() => viewer.showHidden({ source: 'ui' })}>
          ${icons.eye}<span>${s.showHidden(hidden)}</span>
        </button>`
      : nothing}`;
  }

  private resizeStart: { x: number; width: number; id: number } | null = null;

  private setLeftWidth(width: number) {
    this.leftWidth = Math.round(Math.min(520, Math.max(220, width)));
  }

  private readonly onResizePointerDown = (e: PointerEvent) => {
    const panel = this.renderRoot.querySelector('aside.panel') as HTMLElement | null;
    if (!panel) return;
    e.preventDefault();
    this.resizeStart = { x: e.clientX, width: panel.getBoundingClientRect().width, id: e.pointerId };
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    handle.toggleAttribute('data-active', true);
  };

  private readonly onResizePointerMove = (e: PointerEvent) => {
    const start = this.resizeStart;
    if (!start || start.id !== e.pointerId) return;
    this.setLeftWidth(start.width + e.clientX - start.x);
  };

  private readonly onResizePointerUp = (e: PointerEvent) => {
    if (!this.resizeStart || this.resizeStart.id !== e.pointerId) return;
    this.resizeStart = null;
    (e.currentTarget as HTMLElement).toggleAttribute('data-active', false);
  };

  private readonly onResizeKeyDown = (e: KeyboardEvent) => {
    const panel = this.renderRoot.querySelector('aside.panel') as HTMLElement | null;
    if (!panel || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    this.setLeftWidth(panel.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16));
  };

  /** Left column: the tree with visibility, the load status and the data notice. */
  private renderPanel() {
    const s = this.text;
    const catalog = this.catalogValue;
    const viewer = this.viewerValue;
    const uiLang = this.uiLanguage;
    return html`<aside class="panel" id="panel" ?data-open=${this.panelOpen} aria-label=${s.treeLabel} @keydown=${this.onPanelKeyDown}>
      <div class="panel-head">
        <h2>${s.systems}</h2>
        <button class="btn ghost icon-only" aria-label=${s.close} @click=${() => this.togglePanel(false)}>${icons.close}</button>
      </div>
      <div class="visibility-status">${this.renderVisibilityStatus()}</div>
      <svitylo-anatomy-tree
        .catalog=${catalog}
        .lang=${this.currentLang}
        .latin=${this.currentLatin}
        .strings=${s}
        .provider=${this.webgl2 ? this.provider : null}
        .selected=${viewer ? viewer.selection : this.selection}
        .revision=${this.revision}
        @tree-select=${this.onTreeSelect}
        @tree-visibility=${this.onTreeVisibility}
      ></svitylo-anatomy-tree>
      <div class="panel-status">${this.statusInPanel ? html`${this.renderProgress()}${this.renderNotice()}` : nothing}</div>
      ${catalog
        ? html`<p class="panel-notice">
            ${catalog.manifest.notices.data?.[uiLang] ?? ''} ${s.reviewNotice}
            ${this.currentLang === 'uk' && catalog.names.policy.ukrainian === 'any'
              ? html`<span class="legend"><span class="sample" aria-hidden="true">${s.draftSample}</span> — ${s.draftLegend}</span>`
              : nothing}
          </p>`
        : nothing}
      <div
        class="resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label=${s.panelWidth}
        aria-valuemin="220"
        aria-valuemax="520"
        aria-valuenow=${this.leftWidth ?? 300}
        tabindex="0"
        @pointerdown=${this.onResizePointerDown}
        @pointermove=${this.onResizePointerMove}
        @pointerup=${this.onResizePointerUp}
        @pointercancel=${this.onResizePointerUp}
        @keydown=${this.onResizeKeyDown}
      ></div>
    </aside>`;
  }

  protected override render() {
    if (this.isEmbed && !this.activated) return this.renderPlaceholder();
    const s = this.text;
    void this.revision;
    const selected = (this.viewerValue ? this.viewerValue.selection : this.selection).length;
    return html`<div
      class="shell"
      lang=${this.uiLanguage}
      aria-label=${s.appLabel}
      ?data-left-collapsed=${this.leftCollapsed}
      ?data-right-collapsed=${this.rightCollapsed}
      ?data-sheet-open=${this.narrow && this.sheetOpen && selected > 0}
      ${cssProps(this.leftWidth ? { '--_left-size': `${this.leftWidth}px` } : {})}
    >
      ${this.renderHeader()} ${this.renderPanel()} ${this.renderStage()} ${this.renderSelection()}
      ${this.renderSources()} ${this.renderShare()}
      <div class="sr-only announcer" role="status" aria-live="polite">${this.announcement}</div>
    </div>`;
  }
}

export function defineSvityloAnatomy(tag = 'svitylo-anatomy'): void {
  // The inner elements are registered here, not by importing their modules: a bundler drops an
  // import without names from a module that `sideEffects` in package.json does not list.
  defineAtlasInfo();
  defineAtlasSearch();
  defineAtlasTree();
  if (!customElements.get(tag)) customElements.define(tag, tag === 'svitylo-anatomy' ? SvityloAnatomyElement : class extends SvityloAnatomyElement {});
}
