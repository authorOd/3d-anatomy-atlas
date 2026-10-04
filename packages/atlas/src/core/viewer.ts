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
import { Box3, Ray, Vector3 } from 'three';
import {
  MAX_SURROUNDINGS_LEVEL,
  TRANSPARENCY_RANGE,
  canonicalizeState,
  decodeState,
  parseViewState,
  type Lang,
  type Quality,
  type ViewState,
} from '../schema/index.js';
import type { AtlasCatalog } from './catalog/catalog.js';
import type { IndexedStructure } from './catalog/structure-index.js';
import { AtlasError, toAtlasError } from './errors.js';
import { Emitter, debounce, throttle, type AtlasEventMap, type ChangeSource, type SurroundingsInfo, type Unsubscribe } from './events.js';
import { ResourceManager, type ChunkSource, type ResourceStats } from './loading/resource-manager.js';
import type { CameraSnapshot, StandardView } from './render/camera-rig.js';
import { ChunkFormatError, type ChunkGeometry } from './render/chunk-geometry.js';
import { parseChunkGlb } from './render/glb.js';
import type { MaterialColors } from './render/materials.js';
import { meshBounds, pickChunks, rayCrossings } from './render/picking.js';
import { AtlasRenderer, isWebGL2Available, type RenderStats } from './render/renderer.js';
import { MODE_GHOST, MODE_HIDDEN, MODE_OPAQUE, ViewModel, type DisplaySnapshot, type SelectMode } from './state/view-model.js';

export interface AtlasViewerOptions {
  /** Element that receives the canvas. The viewer adds only a canvas to it. */
  container: HTMLElement;
  catalog: AtlasCatalog;
  quality?: Quality;
  lang?: Lang;
  /** Show Latin names next to the names in `lang` (default false). */
  latin?: boolean;
  /**
   * Pick the nearest structure under the pointer whether opaque or translucent. By default an
   * opaque structure under the pointer has priority over translucent surroundings in front of it.
   */
  pickGhost?: boolean;
  /** Scene background colour. */
  background?: string;
  colors?: Partial<MaterialColors>;
  fetch?: typeof fetch;
  /** Parallel file requests (1–8, default 4). */
  concurrency?: number;
  /** Decoded bytes kept for chunks the current view does not need (default 384 MB). */
  cacheBudgetBytes?: number;
  /** Keyboard camera control on the container (default true). */
  keyboard?: boolean;
}

export type OperationStatus = 'complete' | 'partial' | 'cancelled' | 'superseded';

export interface OperationResult {
  status: OperationStatus;
  /** Requested structures without geometry in this release (declared gaps). */
  missing: string[];
  /** Chunks that failed to load. */
  failed: string[];
}

export interface ResourceReport extends ResourceStats {
  listeners: number;
  render: RenderStats | null;
}

const EMPTY_RESULT = (): OperationResult => ({ status: 'complete', missing: [], failed: [] });

/** Two camera poses are the same (within 0.1 mm). */
function samePose(a: CameraSnapshot, b: CameraSnapshot): boolean {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.position[i]! - b.position[i]!) > 1e-4 || Math.abs(a.target[i]! - b.target[i]!) > 1e-4) return false;
  }
  return true;
}

/**
 * Headless atlas viewer: loading, structure index, camera, rendering, selection, visibility,
 * state and typed events. It has no UI and no dependency on Lit or on Svitylo services.
 */
export class AtlasViewer {
  readonly catalog: AtlasCatalog;
  readonly model: ViewModel;
  private readonly events = new Emitter<AtlasEventMap>();
  private renderer: AtlasRenderer | null = null;
  private readonly resources: ResourceManager<ChunkGeometry>;
  private readonly container: HTMLElement;
  private readonly options: AtlasViewerOptions;
  private currentQuality: Quality;
  private currentLang: Lang;
  private showLatin: boolean;
  private display: DisplaySnapshot;
  private meshModes: Uint8Array;
  private meshFlags: Uint8Array;
  private hoverUnit = -1;
  private opSeq = 0;
  private waiters: { seq: number; resolve: (r: OperationResult) => void }[] = [];
  private initialState: ViewState | null = null;
  private disposed = false;
  private lastCamera: ViewState['camera'] | undefined;
  private visibilitySignature = '';
  private selectionSignature = '';
  private surroundingsSignature = '';
  private pendingSource: ChangeSource = 'api';
  /** What moves the camera now: the pointer (the orbit controls), the keyboard or the source of an operation. */
  private cameraSource: ChangeSource = 'api';
  private pointerDown: { x: number; y: number; t: number; id: number } | null = null;
  /** The last click on a structure, to tell a double click (or tap). */
  private lastClick: { id: string; x: number; y: number; t: number } | null = null;
  /**
   * The camera before an automatic zoom to a newly selected structure: deselecting it right
   * afterwards (the selection back to `selectionBefore`, the camera where the zoom left it)
   * brings the camera back.
   */
  private zoomReturn: { selectionBefore: string[]; selectionAfter: string; before: CameraSnapshot; after: CameraSnapshot } | null = null;
  /** What the last `cancelLoading()` took off the view (see `resumeLoading`). */
  private cancelledView: {
    scene: number[];
    extra: number[];
    level: number | null;
    after: number | null;
  } | null = null;
  private hoverFrame = 0;
  private hoverPoint: { x: number; y: number } | null = null;

  private readonly emitProgress = throttle(() => {
    this.events.emit('progress', this.resources.progress(this.currentQuality));
  }, 100);
  private readonly emitCamera = throttle(() => {
    if (!this.renderer) return;
    const snap = this.renderer.rig.snapshot();
    this.lastCamera = { position: snap.position, target: snap.target, fov: snap.fov };
    this.events.emit('camera', snap);
    this.scheduleStateChange(this.cameraSource);
  }, 150);
  private readonly emitStateChange = debounce((source: ChangeSource) => {
    if (this.disposed) return;
    this.events.emit('statechange', { state: this.getState(), source });
  }, 250);

  constructor(options: AtlasViewerOptions) {
    this.options = options;
    this.container = options.container;
    this.catalog = options.catalog;
    this.model = new ViewModel(options.catalog.index);
    this.currentQuality = options.quality ?? 'standard';
    this.currentLang = options.lang ?? 'en';
    this.showLatin = options.latin === true;
    const meshCount = options.catalog.manifest.meshCount;
    this.meshModes = new Uint8Array(meshCount);
    this.meshFlags = new Uint8Array(meshCount);
    this.display = this.model.display();

    this.resources = new ResourceManager<ChunkGeometry>({
      fetch: options.fetch,
      concurrency: options.concurrency,
      budgetBytes: options.cacheBudgetBytes,
      parse: (buffer, source) =>
        parseChunkGlb(buffer, {
          chunk: source.chunk,
          quality: source.quality,
          meshStart: source.meshStart,
          meshCount: source.meshCount,
        }),
      isFormatError: (e) => e instanceof ChunkFormatError,
      sizeOf: (g) => g.byteSize,
      release: (g) => this.releaseChunk(g),
      onLoaded: (source, g) => this.onChunkLoaded(source, g),
      onError: (source, error) => this.events.emit('error', { code: error.code, message: error.message, ...error.details, files: [source.id] }),
      onUpdate: () => {
        this.emitProgress();
        this.resolveWaiters();
      },
    });

    if (!isWebGL2Available()) {
      throw new AtlasError('WEBGL2_UNAVAILABLE', 'WebGL2 is not available in this browser', { recoverable: false });
    }
    this.createRenderer();
  }

  // ---------------------------------------------------------------- lifecycle

  private createRenderer() {
    const manifest = this.catalog.manifest;
    this.renderer = new AtlasRenderer({
      container: this.container,
      meshCount: manifest.meshCount,
      palette: manifest.materials.map((m) => m.color),
      background: this.options.background ?? '#0e1320',
      quality: this.currentQuality,
      colors: this.options.colors,
      onCameraChange: () => this.emitCamera(),
      onContextLost: () =>
        this.events.emit('error', {
          code: 'CONTEXT_LOST',
          message: 'The WebGL context was lost; the view is kept and can be restored',
          recoverable: true,
        }),
      onContextRestored: () => this.refreshScene(),
    });
    const b = manifest.bounds;
    this.renderer.setModelBounds(new Box3(new Vector3(...b.min), new Vector3(...b.max)));
    this.renderer.rig.view('anterior', this.modelBox(), false);
    this.renderer.setGhostOpacity(this.ghostOpacityFor(this.model.transparency));
    this.renderer.rig.controls.addEventListener('start', this.onControlsStart);
    const canvas = this.renderer.canvas;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    if (this.options.keyboard !== false) this.container.addEventListener('keydown', this.onKeyDown);
    this.refreshScene();
  }

  /** Re-creates the renderer (e.g. when a lost WebGL context cannot be restored). Logical state is kept. */
  recreateRenderer(): void {
    this.assertAlive();
    const camera = this.renderer?.rig.snapshot();
    this.destroyRenderer();
    this.createRenderer();
    if (camera) this.renderer!.rig.restore(camera, false);
  }

  private destroyRenderer() {
    if (!this.renderer) return;
    this.renderer.rig.controls.removeEventListener('start', this.onControlsStart);
    const canvas = this.renderer.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('keydown', this.onKeyDown);
    this.renderer.dispose();
    this.renderer = null;
  }

  /** Puts every cached chunk of the current quality back on the scene and re-applies state. */
  private refreshScene() {
    if (!this.renderer) return;
    for (let i = 0; i < this.catalog.manifest.chunks.length; i++) {
      const g = this.resources.get(i, this.currentQuality);
      if (g && this.renderer.chunk(i) !== g) this.renderer.setChunk(i, g);
    }
    this.applyDisplay();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opSeq++;
    this.resolveWaiters(true);
    this.emitProgress.cancel();
    this.emitCamera.cancel();
    this.emitStateChange.cancel();
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    this.destroyRenderer();
    this.resources.dispose();
    this.events.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private assertAlive() {
    if (this.disposed) throw new AtlasError('DISPOSED', 'The viewer has been disposed');
  }

  on<K extends keyof AtlasEventMap>(type: K, handler: (detail: AtlasEventMap[K]) => void): Unsubscribe {
    return this.events.on(type, handler);
  }

  // ---------------------------------------------------------------- queries

  get quality(): Quality {
    return this.currentQuality;
  }

  get lang(): Lang {
    return this.currentLang;
  }

  /** Latin names are shown next to the names in `lang`. */
  get latin(): boolean {
    return this.showLatin;
  }

  get selection(): string[] {
    return [...this.model.selected];
  }

  get primarySelection(): string | null {
    return this.model.primary;
  }

  /**
   * The surroundings of the selection: the level of the view (explicit, or derived from what is
   * on the scene), the levels of the current selection and the transparency.
   */
  get surroundings(): SurroundingsInfo {
    return {
      level: this.display.level,
      explicit: this.model.level !== null,
      levels: this.model.levels().map((l) => (l.groups ? [...l.groups] : null)),
      transparency: this.model.transparency,
    };
  }

  /** Surroundings ladder of a structure: ancestor group IDs, nearest first; `null` = whole body. */
  surroundingsLevels(id: string): (string | null)[] {
    return this.catalog.index.surroundingsLadder(this.resolve(id)).map((l) => l.id);
  }

  /** Transparency of everything that is not selected: 0 = opaque. */
  get transparency(): number {
    return this.model.transparency;
  }

  get isolated(): boolean {
    return this.model.isolate !== null;
  }

  /** The isolation is exactly this structure (with its parts). */
  isolates(id: string): boolean {
    const isolation = this.model.isolate;
    if (!isolation || !this.catalog.get(id)) return false;
    const { units } = this.catalog.index.expand([this.resolve(id).id], 'all');
    let count = 0;
    for (const u of units) {
      if (!isolation.has(u)) return false;
      count++;
    }
    return count === isolation.size;
  }

  get sceneIsEmpty(): boolean {
    return this.display.sceneUnits.size === 0;
  }

  get hiddenCount(): number {
    let n = 0;
    for (const u of this.model.hidden) if (this.display.sceneUnits.has(u)) n++;
    return n;
  }

  get visibleCount(): number {
    return this.display.visibleCount;
  }

  /** Display mode of a structure: hidden, opaque, ghost or mixed (for logical parents). */
  displayOf(id: string): 'hidden' | 'opaque' | 'ghost' | 'mixed' | 'absent' {
    const node = this.catalog.get(id);
    if (!node) return 'absent';
    const units = this.catalog.index.subtreeUnits(node, 'all');
    if (units.length === 0) return 'absent';
    let opaque = 0;
    let ghost = 0;
    let inScene = 0;
    for (const u of units) {
      if (this.display.sceneUnits.has(u)) inScene++;
      const m = this.display.modes[u];
      if (m === MODE_OPAQUE) opaque++;
      else if (m === MODE_GHOST) ghost++;
    }
    if (inScene === 0) return 'absent';
    if (opaque + ghost === 0) return 'hidden';
    if (opaque === units.length) return 'opaque';
    if (ghost === units.length) return 'ghost';
    return 'mixed';
  }

  /** Loading state of a structure's geometry at the current quality. */
  loadStateOf(id: string): 'none' | 'loading' | 'ready' | 'failed' | 'partial' {
    const node = this.catalog.get(id);
    if (!node) return 'none';
    const chunks = this.catalog.index.chunksFor(this.catalog.index.subtreeUnits(node, 'default'));
    if (chunks.size === 0) return 'none';
    let ready = 0;
    let loading = 0;
    let failed = 0;
    for (const c of chunks) {
      const state = this.resources.stateOf(c, this.currentQuality);
      if (state === 'ready') ready++;
      else if (state === 'failed') failed++;
      else if (state === 'loading' || state === 'queued') loading++;
    }
    if (failed > 0) return 'failed';
    if (loading > 0) return 'loading';
    if (ready === chunks.size) return 'ready';
    return ready > 0 ? 'partial' : 'none';
  }

  progress() {
    return this.resources.progress(this.currentQuality);
  }

  getResourceStats(): ResourceReport {
    return { ...this.resources.stats(), listeners: this.events.listenerCount(), render: this.renderer?.stats() ?? null };
  }

  frameTimeStats() {
    return this.renderer?.frameTimeStats() ?? { p50: 0, p95: 0, samples: 0 };
  }

  get isContextLost(): boolean {
    return this.renderer?.isContextLost ?? false;
  }

  // ---------------------------------------------------------------- operations

  private resolve(id: string): IndexedStructure {
    const node = this.catalog.get(id);
    if (!node) throw new AtlasError('UNKNOWN_ID', `Unknown structure ID: ${id}`, { ids: [id] });
    return node;
  }

  private missingOf(nodes: IndexedStructure[]): string[] {
    return nodes.filter((n) => !this.catalog.index.hasGeometry(n, 'default')).map((n) => n.id);
  }

  /** Loads the whole dataset at the current quality; the outer layer (skin) loads first. */
  async loadAll(): Promise<OperationResult> {
    this.assertAlive();
    const units = this.catalog.index.allDefaultUnits();
    return this.runOperation('loadAll', 'api', () => {
      // Everything is on the scene now and shown (the automatic level); the selection and the
      // transparency are kept.
      this.model.scene = units;
      this.model.extra.clear();
      this.model.level = null;
      this.model.hidden.clear();
      this.model.isolate = null;
      for (const system of this.catalog.manifest.systems) {
        if (!system.hiddenByDefault) continue;
        const root = this.catalog.get(system.id);
        if (root) for (const u of this.catalog.index.subtreeUnits(root, 'all')) this.model.hidden.add(u);
      }
      this.cameraSource = 'api';
      this.renderer?.rig.view('anterior', this.modelBox(), true);
    }, { focus: null });
  }

  /**
   * Shows one structure (or logical group) on its own, selects it and focuses the camera on it.
   * This replaces the scene and the selection; the surroundings go back to automatic and opaque.
   */
  async showStructure(id: string, options: { source?: ChangeSource; focus?: boolean } = {}): Promise<OperationResult> {
    this.assertAlive();
    const node = this.resolve(id);
    const units = this.catalog.index.subtreeUnits(node, 'default');
    const result = await this.runOperation('showStructure', options.source ?? 'api', () => {
      this.model.clear();
      this.model.scene = new Set(units);
      this.model.selected = node.kind === 'system' ? [] : [node.id];
    }, { focus: options.focus === false ? null : [node.id] });
    result.missing = this.missingOf([node]);
    return result;
  }

  /** Shows a whole system. */
  async showSystem(id: string, options: { source?: ChangeSource } = {}): Promise<OperationResult> {
    const node = this.resolve(id);
    return this.showStructure(this.catalog.index.systems.includes(node) ? node.id : node.system, {
      source: options.source,
    });
  }

  /**
   * Surroundings of the selection in one call: with `id`, that structure is placed on the scene
   * and added to the selection first (and the camera frames it unless `focus` is false); then the
   * level is set (default: the level already chosen, else 1) and, unless it is already on, the
   * transparency (default `TRANSPARENCY_RANGE.default`). An active isolation is cleared unless
   * `keepIsolation`, so the surroundings are visible.
   */
  async showSurroundings(
    id?: string,
    options: { level?: number; transparency?: number; source?: ChangeSource; focus?: boolean; keepIsolation?: boolean } = {},
  ): Promise<OperationResult> {
    this.assertAlive();
    const node = id === undefined ? null : this.resolve(id);
    const requested = options.level !== undefined && Number.isFinite(options.level) ? options.level : (this.model.level ?? 1);
    const level = Math.max(0, Math.min(Math.round(requested), MAX_SURROUNDINGS_LEVEL));
    const transparency = this.clampTransparency(options.transparency ?? (this.model.transparency || TRANSPARENCY_RANGE.default));
    return this.runOperation('showSurroundings', options.source ?? 'api', () => {
      if (node) {
        this.placeOnScene(node, 'scene');
        this.model.select([node.id], 'add');
      }
      const total = this.model.levels().length;
      this.model.level = total > 0 ? Math.min(level, total) : level;
      this.applyTransparency(transparency);
      if (!options.keepIsolation) this.model.isolate = null;
    }, { focus: node && options.focus !== false ? [node.id] : null, padding: 2.2 });
  }

  /**
   * How much of the surroundings is shown around the selection: 0 = only the selection, 1 = the
   * nearest groups of every selected structure … `levels.length` = the whole body; `null` =
   * automatic (everything placed on the scene is shown). The chosen level stays for the next
   * selections; without a selection everything placed is shown.
   */
  async setSurroundingsLevel(level: number | null, options: { source?: ChangeSource } = {}): Promise<OperationResult> {
    this.assertAlive();
    if (level !== null && !Number.isFinite(level)) return EMPTY_RESULT();
    const total = this.model.levels().length;
    const next = level === null ? null : Math.max(0, Math.min(Math.round(level), this.model.selected.length ? total : MAX_SURROUNDINGS_LEVEL));
    if (next === this.model.level) return EMPTY_RESULT();
    return this.runOperation('setSurroundingsLevel', options.source ?? 'api', () => {
      if (next === null) this.model.automaticLevel();
      else this.model.level = next;
    }, { focus: null });
  }

  /** Back to the automatic level and opaque structures: everything placed is shown again. */
  exitSurroundings(options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    if (this.model.level === null && this.model.transparency === 0) return;
    this.model.automaticLevel();
    this.applyTransparency(0);
    this.commit(options.source ?? 'api');
  }

  /**
   * Transparency of everything that is not selected: 0 = opaque (off) … 0.95. Selected
   * structures always stay opaque.
   */
  setTransparency(value: number, options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    const next = this.clampTransparency(value);
    if (next === this.model.transparency) return;
    this.applyTransparency(next);
    this.commit(options.source ?? 'api');
  }

  private clampTransparency(value: number): number {
    const v = Math.min(TRANSPARENCY_RANGE.max, Math.max(TRANSPARENCY_RANGE.min, Number.isFinite(value) ? value : 0));
    return Math.round(v * 1000) / 1000;
  }

  private applyTransparency(value: number) {
    this.model.transparency = value;
    this.renderer?.setGhostOpacity(this.ghostOpacityFor(value));
  }

  /** Opacity of the translucent structures for a transparency (the default look while opaque). */
  private ghostOpacityFor(transparency: number): number {
    return 1 - (transparency || TRANSPARENCY_RANGE.default);
  }

  /**
   * Click semantics: selects a structure, or removes it from the selection when it is selected.
   * A structure that is not displayed is placed on the scene; deselecting it later keeps it there.
   * The camera does not move.
   */
  async toggleSelection(id: string, options: { source?: ChangeSource } = {}): Promise<OperationResult> {
    this.assertAlive();
    const node = this.resolve(id);
    const source = options.source ?? 'api';
    if (this.model.selected.includes(node.id)) {
      this.model.select([node.id], 'remove');
      this.commit(source);
      return EMPTY_RESULT();
    }
    const result = await this.runOperation('select', source, () => {
      this.placeOnScene(node, 'scene');
      this.model.select([node.id], 'add');
    }, { focus: null });
    result.missing = this.missingOf([node]);
    return result;
  }

  /**
   * Selects a structure the way the tree and search do: it becomes the most recent selection
   * (nothing else is deselected) and, when it is not shown, it is placed on the scene — loaded,
   * un-hidden and added to an active isolation; deselecting it later keeps it there. `focus`
   * (default true) zooms the camera to it; deselecting it right afterwards, with nothing else
   * changed, brings the camera back. With `ensureVisible`, when other structures cover it after
   * the zoom, the transparency turns on (`TRANSPARENCY_RANGE.default`).
   */
  async selectStructure(
    id: string,
    options: { source?: ChangeSource; focus?: boolean; ensureVisible?: boolean } = {},
  ): Promise<OperationResult> {
    this.assertAlive();
    const node = this.resolve(id);
    const source = options.source ?? 'api';
    const before = this.model.selected.filter((s) => s !== node.id);
    const result = await this.runOperation('select', source, () => {
      this.placeOnScene(node, 'scene');
      this.model.select([node.id], 'add');
    }, { focus: null });
    result.missing = this.missingOf([node]);
    if (result.status === 'superseded' || this.disposed) return result;
    // Deselected while it was loading: it stays on the scene, but the camera does not move to it.
    if (!this.model.selected.includes(node.id)) return result;
    if (options.focus !== false) this.zoomTo(node.id, before, source);
    if (options.ensureVisible && this.model.transparency === 0 && this.isCovered(node)) {
      this.setTransparency(TRANSPARENCY_RANGE.default, { source });
    }
    return result;
  }

  /** Zooms to a newly selected structure and remembers the camera it came from (see `zoomReturn`). */
  private zoomTo(id: string, selectionBefore: string[], source: ChangeSource) {
    const rig = this.renderer?.rig;
    if (!rig) return;
    const before = rig.snapshot();
    this.cameraSource = source;
    if (!this.focusCamera([id])) return;
    this.zoomReturn = { selectionBefore, selectionAfter: this.model.selected.join('|'), before, after: rig.snapshot() };
  }

  /** On a selection change: deselecting what was just zoomed to, with nothing else changed, returns the camera. */
  private returnCamera(source: ChangeSource) {
    const record = this.zoomReturn;
    if (!record || this.model.selected.join('|') === record.selectionAfter) return;
    this.zoomReturn = null;
    const rig = this.renderer?.rig;
    const selected = this.model.selected;
    const same = selected.length === record.selectionBefore.length && selected.every((s) => record.selectionBefore.includes(s));
    if (rig && same && samePose(rig.snapshot(), record.after)) {
      this.cameraSource = source;
      rig.restore(record.before, true);
    }
  }

  /**
   * Whether other opaque structures cover most of a structure as seen from where the camera is
   * (or is going): of the rays to its centre and four points around it, three or more hit
   * another structure before reaching the point.
   */
  private isCovered(node: IndexedStructure): boolean {
    const renderer = this.renderer;
    if (!renderer) return false;
    const index = this.catalog.index;
    const own = new Set<number>();
    for (const u of index.expand([node.id], 'all').units) for (const m of index.structures[u]!.meshes) own.add(m);
    const box = this.boundsOf([node.id]);
    if (box.isEmpty()) return false;
    const eye = new Vector3(...renderer.rig.snapshot().position);
    const center = box.getCenter(new Vector3());
    const forward = center.clone().sub(eye);
    if (forward.lengthSq() < 1e-10) return false;
    forward.normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const up = new Vector3().crossVectors(right, forward).normalize();
    const spread = box.getSize(new Vector3()).length() * 0.15;
    const points = [
      center,
      center.clone().addScaledVector(right, spread),
      center.clone().addScaledVector(right, -spread),
      center.clone().addScaledVector(up, spread),
      center.clone().addScaledVector(up, -spread),
    ];
    const chunks = [...renderer.chunkData()];
    const pickable = (mesh: number) => (own.has(mesh) ? this.meshModes[mesh] !== MODE_HIDDEN : this.meshModes[mesh] === MODE_OPAQUE);
    let covered = 0;
    for (const point of points) {
      const direction = point.clone().sub(eye).normalize();
      const hit = pickChunks(new Ray(eye.clone(), direction), chunks, pickable);
      if (hit && !own.has(hit.mesh) && hit.distance < eye.distanceTo(point)) covered++;
    }
    return covered >= 3;
  }

  /**
   * Makes a structure displayed: un-hides it, extends an active isolation to it and adds to the
   * scene what is not on it yet. `explicit` also adds it to the extra structures while an explicit
   * level limits the view, so that the level does not hide it.
   */
  private placeOnScene(node: IndexedStructure, how: 'explicit' | 'scene') {
    const index = this.catalog.index;
    for (const u of index.subtreeUnits(node, 'all')) this.model.hidden.delete(u);
    const units = index.subtreeUnits(node, 'default');
    for (const u of units) this.model.isolate?.add(u);
    this.model.placeExplicitly(units, how === 'explicit');
  }

  /** Adds structures to the scene without removing others (multi-structure views). */
  async addStructures(ids: string[], options: { source?: ChangeSource; select?: boolean; focus?: boolean } = {}) {
    this.assertAlive();
    const nodes = ids.map((id) => this.resolve(id));
    const result = await this.runOperation('addStructures', options.source ?? 'api', () => {
      for (const node of nodes) this.placeOnScene(node, 'explicit');
      if (options.select) this.model.select(nodes.map((n) => n.id), 'add');
    }, { focus: options.focus ? nodes.map((n) => n.id) : null });
    result.missing = this.missingOf(nodes);
    return result;
  }

  /**
   * "Find / show structure": explicitly places the structure on the scene, removes it from
   * `hidden`, extends an active isolation to it, selects it and focuses the camera.
   */
  async reveal(id: string, options: { source?: ChangeSource } = {}): Promise<OperationResult> {
    this.assertAlive();
    const node = this.resolve(id);
    const result = await this.runOperation('reveal', options.source ?? 'api', () => {
      this.placeOnScene(node, 'explicit');
      this.model.select([node.id], 'replace');
    }, { focus: [node.id] });
    result.missing = this.missingOf([node]);
    return result;
  }

  /** Isolates the given structures (default: the selection). */
  isolate(ids?: string[], options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    const refs = ids ?? this.model.selected;
    if (refs.length === 0) return;
    const nodes = refs.map((id) => this.resolve(id));
    const { units } = this.catalog.index.expand(nodes.map((n) => n.id), 'all');
    // The surroundings are kept: clearing the isolation brings them back.
    this.model.isolate = units;
    this.commit(options.source ?? 'api');
  }

  clearIsolation(options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    if (this.model.isolate === null) return;
    this.model.isolate = null;
    this.commit(options.source ?? 'api');
  }

  /** Hides structures; hiding never unloads files. */
  hide(ids: string[], options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    const { units } = this.catalog.index.expand(ids.map((id) => this.resolve(id).id), 'all');
    for (const u of units) this.model.hidden.add(u);
    this.commit(options.source ?? 'api');
  }

  /**
   * Shows hidden structures; structures that are not on the scene yet are added (and loaded) —
   * while an explicit surroundings level limits the view, among the extra structures.
   */
  async show(ids: string[], options: { source?: ChangeSource } = {}): Promise<OperationResult> {
    this.assertAlive();
    const nodes = ids.map((id) => this.resolve(id));
    return this.runOperation('show', options.source ?? 'api', () => {
      for (const node of nodes) this.placeOnScene(node, 'explicit');
    }, { focus: null });
  }

  /** Makes every hidden structure of the current scene visible again (no new structures are loaded). */
  showHidden(options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    this.model.hidden.clear();
    this.commit(options.source ?? 'api');
  }

  /**
   * Changes the selection (`replace`, `add`, `toggle`, `remove`). A structure is never selected
   * together with its ancestors or descendants: selecting it deselects them.
   */
  select(ids: string[], mode: SelectMode = 'replace', options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    const valid = ids.map((id) => this.resolve(id).id);
    if (this.model.select(valid, mode)) this.commit(options.source ?? 'api');
  }

  clearSelection(options: { source?: ChangeSource } = {}): void {
    this.assertAlive();
    if (this.model.select([], 'replace')) this.commit(options.source ?? 'api');
  }

  /**
   * Focuses the camera on structures (default: selection, else everything visible), keeping the
   * viewing direction. The camera never ends up inside other visible structures: when it would,
   * it moves out along the same direction (the structure may then stay covered by others).
   */
  focus(ids?: string[], options: { animate?: boolean; padding?: number } = {}): boolean {
    this.assertAlive();
    this.cameraSource = 'api';
    return this.focusCamera(ids, options);
  }

  private focusCamera(ids?: string[], options: { animate?: boolean; padding?: number } = {}): boolean {
    if (!this.renderer) return false;
    const target = ids && ids.length ? ids.map((id) => this.resolve(id).id) : this.defaultFocusIds();
    const box = target ? this.boundsOf(target) : this.visibleBox();
    if (box.isEmpty()) return false;
    this.renderer.rig.focusBounds(box, { animate: options.animate ?? true, padding: options.padding, clearance: this.clearance(target) });
    return true;
  }

  /** Frames everything visible, whatever is selected ("fit to window"). */
  frameAll(options: { animate?: boolean } = {}): boolean {
    this.assertAlive();
    if (!this.renderer) return false;
    this.cameraSource = 'api';
    const box = this.visibleBox();
    if (box.isEmpty()) return false;
    this.renderer.rig.focusBounds(box, { animate: options.animate ?? true });
    return true;
  }

  /** Standard view of the selection (else of everything visible). */
  setView(view: StandardView, options: { animate?: boolean } = {}): void {
    this.assertAlive();
    this.cameraSource = 'api';
    this.viewCamera(view, options);
  }

  private viewCamera(view: StandardView, options: { animate?: boolean } = {}) {
    if (!this.renderer) return;
    const target = this.defaultFocusIds();
    let box = target ? this.boundsOf(target) : this.visibleBox();
    if (box.isEmpty()) box = target ? this.visibleBox() : box;
    this.renderer.rig.view(view, box.isEmpty() ? this.modelBox() : box, options.animate ?? true, this.clearance(target));
  }

  /** The standard view the camera currently looks from, or null after free rotation. */
  get currentView(): StandardView | null {
    return this.renderer?.rig.currentView() ?? null;
  }

  /** Keyboard-equivalent camera steps for UI buttons. */
  orbit(deltaAzimuth: number, deltaPolar: number): void {
    this.cameraSource = 'api';
    this.renderer?.rig.orbitBy(deltaAzimuth, deltaPolar);
  }

  zoom(factor: number): void {
    this.cameraSource = 'api';
    this.renderer?.rig.zoomBy(factor);
  }

  /** Switches the quality level; camera, visibility and selection are kept. */
  async setQuality(quality: Quality): Promise<OperationResult> {
    this.assertAlive();
    if (quality === this.currentQuality) return EMPTY_RESULT();
    const previous = this.currentQuality;
    this.currentQuality = quality;
    this.renderer?.setQuality(quality);
    this.events.emit('quality', { quality });
    const result = await this.runOperation('setQuality', 'api', () => undefined, { focus: null });
    // Chunks of the previous level that are no longer displayed are released, unless the quality
    // was switched again meanwhile (the previous level may be the current one again).
    if (this.disposed || this.currentQuality !== quality) return result;
    for (let i = 0; i < this.catalog.manifest.chunks.length; i++) {
      if (this.resources.stateOf(i, quality) === 'ready') this.resources.release(i, previous);
    }
    return result;
  }

  setLang(lang: Lang): void {
    this.assertAlive();
    if (lang === this.currentLang) return;
    this.currentLang = lang;
    this.events.emit('lang', { lang, latin: this.showLatin });
    this.scheduleStateChange('api');
  }

  /** Shows or hides Latin names next to the names in the current language. */
  setLatin(show: boolean): void {
    this.assertAlive();
    if (show === this.showLatin) return;
    this.showLatin = show;
    this.events.emit('lang', { lang: this.currentLang, latin: show });
    this.scheduleStateChange('api');
  }

  cancelLoading(): void {
    this.assertAlive();
    const cancelled = this.resources.cancel();
    if (cancelled.length === 0) return;
    // The view keeps only what is loaded, so a shared link never claims more; `resumeLoading`
    // puts the rest back.
    const index = this.catalog.index;
    const chunks = new Set(cancelled.map((c) => c.chunk));
    const stopped = (u: number) => index.structures[u]!.meshes.some((mesh) => chunks.has(index.meshChunk[mesh]!));
    const prune = (units: Set<number>) => {
      const out = [...units].filter(stopped);
      for (const u of out) units.delete(u);
      return out;
    };
    const level = this.model.level;
    const view = {
      scene: prune(this.model.scene),
      extra: prune(this.model.extra),
      level,
      after: level,
    };
    // A chosen level shows the selection and its surroundings whatever is on the scene: it steps
    // down to the highest level that needs nothing stopped, else back to automatic.
    let shown = this.model.explicitLevel;
    if (shown !== null) {
      const levels = this.model.levels();
      const selection = index.expand(this.model.selected, 'default').units;
      const needsStopped = (k: number) => [...(k === 0 ? selection : levels[k - 1]!.units)].some(stopped);
      while (shown !== null && needsStopped(shown)) shown = shown > 0 ? shown - 1 : null;
      if (shown === null) this.model.automaticLevel();
      else this.model.level = shown;
      view.after = this.model.level;
    }
    this.cancelledView = view;
    this.opSeq++;
    this.resolveWaiters();
    this.commit('api');
    this.events.emit('progress', this.resources.progress(this.currentQuality));
  }

  /** Whether `resumeLoading()` has something to load (after `cancelLoading()`). */
  get canResumeLoading(): boolean {
    return this.cancelledView !== null;
  }

  /**
   * Loads again what `cancelLoading()` stopped: the view as it was before the cancellation (the
   * structures it took off the scene and the chosen level). Any other operation in between drops
   * that view.
   */
  async resumeLoading(): Promise<OperationResult> {
    this.assertAlive();
    const view = this.cancelledView;
    this.cancelledView = null;
    if (!view) return EMPTY_RESULT();
    return this.runOperation('resumeLoading', 'api', () => {
      for (const u of view.scene) this.model.scene.add(u);
      for (const u of view.extra) this.model.extra.add(u);
      if (this.model.level === view.after) this.model.level = view.level;
    }, { focus: null });
  }

  /** Retries failed files of the current view; files that are already loaded are not requested again. */
  async retry(): Promise<OperationResult> {
    this.assertAlive();
    const seq = ++this.opSeq;
    this.resources.retryFailed();
    return this.waitForScene(seq);
  }

  // ---------------------------------------------------------------- state

  getState(): ViewState {
    const manifest = this.catalog.manifest;
    const snap = this.renderer?.rig.snapshot();
    const camera = snap ? { position: snap.position, target: snap.target, fov: snap.fov } : this.lastCamera;
    // The canonical form (rounded camera, fixed key order) is exactly what a link carries,
    // so getState() → link → setState() → getState() is stable.
    return canonicalizeState(
      this.model.toState(
        { model: manifest.model, version: manifest.version },
        { camera, lang: this.currentLang, latin: this.showLatin },
      ),
    );
  }

  /**
   * Applies a state (object or encoded link payload) to the loaded data; the required files load
   * automatically. The data version a state was made with does not matter: IDs do not change
   * between versions (renamed ones resolve through aliases), and IDs this data does not have are
   * skipped and reported with an `UNKNOWN_ID` error event. A state of another anatomical model is
   * rejected with `DATA_MISMATCH`.
   */
  async setState(input: ViewState | string, options: { source?: ChangeSource; animate?: boolean } = {}): Promise<OperationResult> {
    this.assertAlive();
    let state: ViewState;
    try {
      state = typeof input === 'string' ? await decodeState(input) : parseViewState(input);
    } catch (error) {
      throw toAtlasError(error, 'STATE_INVALID', 'Invalid state');
    }
    this.assertCompatible(state);
    const source = options.source ?? 'state';
    let unknown: string[] = [];
    const result = await this.runOperation('setState', source, () => {
      unknown = this.model.applyState(state).unknown;
      this.renderer?.setGhostOpacity(this.ghostOpacityFor(this.model.transparency));
      // A state with a language carries the whole names display (no `latin` = Latin hidden).
      const lang = state.lang ?? this.currentLang;
      const latin = state.lang ? state.latin === true : this.showLatin || state.latin === true;
      if (lang !== this.currentLang || latin !== this.showLatin) {
        this.currentLang = lang;
        this.showLatin = latin;
        this.events.emit('lang', { lang, latin });
      }
      if (state.camera) {
        this.lastCamera = state.camera;
        this.cameraSource = source;
        this.renderer?.rig.restore(state.camera, options.animate ?? false);
      }
    }, { focus: state.camera ? null : 'visible' });
    if (unknown.length > 0) {
      this.events.emit('error', {
        code: 'UNKNOWN_ID',
        message: `The state references structures that do not exist in data ${this.catalog.manifest.version}`,
        ids: unknown,
        recoverable: false,
      });
    }
    return result;
  }

  /**
   * Throws `DATA_MISMATCH` when a state belongs to another anatomical model than the loaded data.
   * Other versions of the same model are compatible: a state opens in the loaded data.
   */
  assertCompatible(state: ViewState): void {
    const manifest = this.catalog.manifest;
    if (state.data.model !== manifest.model) {
      throw new AtlasError(
        'DATA_MISMATCH',
        `The state was made for the model ${state.data.model}, the loaded data is ${manifest.model}@${manifest.version}`,
        { version: state.data.version },
      );
    }
  }

  /** The state `reset()` returns to (e.g. the state of the opened link); `null` = empty scene. */
  setInitialState(state: ViewState | null): void {
    this.initialState = state;
  }

  get hasInitialState(): boolean {
    return this.initialState !== null;
  }

  /** Returns to the initial state of the opened link, or to the empty scene. Cached files are kept. */
  async reset(): Promise<OperationResult> {
    this.assertAlive();
    if (this.initialState) return this.setState(this.initialState, { source: 'reset' });
    return this.runOperation('reset', 'reset', () => {
      this.model.clear();
      this.renderer?.setGhostOpacity(this.ghostOpacityFor(0));
      this.cameraSource = 'reset';
      this.renderer?.rig.view('anterior', this.modelBox(), true);
    }, { focus: null });
  }

  // ---------------------------------------------------------------- internals

  private async runOperation(
    name: string,
    source: ChangeSource,
    mutate: () => void,
    after: { focus: string[] | 'visible' | null; padding?: number },
  ): Promise<OperationResult> {
    const seq = ++this.opSeq;
    this.cancelledView = null;
    mutate();
    this.commit(source);
    const result = await this.waitForScene(seq);
    if (result.status === 'superseded' || this.disposed) return result;
    if (after.focus) {
      this.cameraSource = source;
      if (after.focus === 'visible') this.focusCamera(undefined, { animate: false });
      else this.focusCamera(after.focus, { padding: after.padding });
    }
    this.events.emit('ready', { kind: 'scene', request: name, complete: result.status === 'complete' });
    return result;
  }

  private waitForScene(seq: number): Promise<OperationResult> {
    return new Promise((resolve) => {
      this.waiters.push({ seq, resolve });
      this.resolveWaiters();
    });
  }

  private resolveWaiters(all = false) {
    if (this.waiters.length === 0) return;
    const settled = this.resources.isSettled();
    const progress = this.resources.progress(this.currentQuality);
    const remaining: typeof this.waiters = [];
    for (const waiter of this.waiters) {
      if (all || this.disposed) {
        waiter.resolve({ status: 'superseded', missing: [], failed: [] });
      } else if (waiter.seq !== this.opSeq) {
        waiter.resolve({ status: progress.phase === 'cancelled' ? 'cancelled' : 'superseded', missing: [], failed: [] });
      } else if (settled) {
        const failed = this.resources.failed().map((f) => f.source.id);
        waiter.resolve({ status: failed.length ? 'partial' : 'complete', missing: [], failed });
      } else {
        remaining.push(waiter);
      }
    }
    this.waiters = remaining;
  }

  /** Applies the logical state: display, files needed, events. */
  private commit(source: ChangeSource) {
    if (this.disposed) return;
    this.pendingSource = source;
    this.applyDisplay();
    this.resources.setDemand(this.demandSources());
    this.emitChanges(source);
  }

  private demandSources(): ChunkSource[] {
    const manifest = this.catalog.manifest;
    const chunks = this.catalog.index.chunksFor(this.display.visibleUnits);
    const out: ChunkSource[] = [];
    for (const c of chunks) {
      const entry = manifest.chunks[c]!;
      const file = entry.files[this.currentQuality];
      out.push({
        chunk: c,
        id: entry.id,
        quality: this.currentQuality,
        url: this.catalog.url(file.path),
        bytes: file.bytes,
        sha256: file.sha256,
        priority: entry.priority,
        meshStart: entry.meshStart,
        meshCount: entry.meshCount,
      });
    }
    return out;
  }

  private applyDisplay() {
    this.display = this.model.display();
    this.meshModes.fill(MODE_HIDDEN);
    this.meshFlags.fill(0);
    const structures = this.catalog.index.structures;
    for (const u of this.display.visibleUnits) {
      const mode = this.display.modes[u]!;
      const flags = (this.display.selectedUnits.has(u) ? 1 : 0) | (u === this.hoverUnit ? 2 : 0);
      for (const mesh of structures[u]!.meshes) {
        this.meshModes[mesh] = mode;
        this.meshFlags[mesh] = flags;
      }
    }
    this.renderer?.applyStates(this.meshModes, this.meshFlags);
  }

  private emitChanges(source: ChangeSource) {
    const info = this.surroundings;
    const surroundings = `${info.level}:${info.explicit}:${info.transparency}:${info.levels.map((l) => l?.join(',') ?? '*').join('/')}`;
    if (surroundings !== this.surroundingsSignature) {
      this.surroundingsSignature = surroundings;
      this.events.emit('surroundings', { ...info, source });
    }
    const selection = this.model.selected.join('|');
    if (selection !== this.selectionSignature) {
      this.selectionSignature = selection;
      this.returnCamera(source);
      this.events.emit('select', { ids: [...this.model.selected], primary: this.model.primary, source });
    }
    const visibility = [
      this.display.visibleCount,
      this.display.ghostCount,
      this.display.sceneUnits.size,
      this.model.hidden.size,
      this.model.isolate?.size ?? -1,
    ].join(':');
    if (visibility !== this.visibilitySignature) {
      this.visibilitySignature = visibility;
      const state = this.getState();
      this.events.emit('visibility', {
        visible: this.display.visibleCount,
        scene: state.scene,
        hidden: state.hidden ?? [],
        isolate: state.isolate ?? null,
        source,
      });
    }
    this.scheduleStateChange(source);
  }

  private scheduleStateChange(source: ChangeSource) {
    this.emitStateChange(source);
  }

  private onChunkLoaded(source: ChunkSource, geometry: ChunkGeometry) {
    if (source.quality !== this.currentQuality) {
      this.resources.release(source.chunk, source.quality);
      return;
    }
    this.renderer?.setChunk(source.chunk, geometry);
    const other: Quality = source.quality === 'standard' ? 'economy' : 'standard';
    if (this.resources.stateOf(source.chunk, other) === 'ready') this.resources.release(source.chunk, other);
    this.applyDisplay();
  }

  private releaseChunk(geometry: ChunkGeometry) {
    if (this.renderer && this.renderer.chunk(geometry.chunk) === geometry) this.renderer.removeChunk(geometry.chunk);
    geometry.geometry.dispose();
  }

  private chunkOfMesh = (mesh: number): ChunkGeometry | undefined => {
    const chunk = this.catalog.index.meshChunk[mesh];
    return chunk === undefined || chunk < 0 ? undefined : this.renderer?.chunk(chunk);
  };

  private boundsOf(ids: string[]): Box3 {
    const { units } = this.catalog.index.expand(ids, 'all');
    const meshes: number[] = [];
    for (const u of units) {
      if (!this.display.visibleUnits.has(u)) continue;
      meshes.push(...this.catalog.index.structures[u]!.meshes);
    }
    return meshBounds(meshes, this.chunkOfMesh);
  }

  /** The selection when it has visible geometry, else null (everything visible). */
  private defaultFocusIds(): string[] | null {
    const ids = this.model.selected.length ? this.model.selected : null;
    return ids && !this.boundsOf(ids).isEmpty() ? ids : null;
  }

  private visibleBox(): Box3 {
    const meshes: number[] = [];
    for (const u of this.display.visibleUnits) meshes.push(...this.catalog.index.structures[u]!.meshes);
    return meshBounds(meshes, this.chunkOfMesh);
  }

  /**
   * Camera clearance for a focus on `ids` (null: everything visible, nothing to clear). A ray
   * from the target centre towards the camera counts the surface crossings of every other
   * visible structure beyond the camera: an odd count means the camera would be inside that
   * structure, so it moves just past the structure's surface, until it is inside none.
   */
  private clearance(ids: string[] | null): ((center: Vector3, direction: Vector3, distance: number) => number) | undefined {
    const renderer = this.renderer;
    if (!ids || !renderer) return undefined;
    const own = new Set<number>();
    for (const u of this.catalog.index.expand(ids, 'all').units) for (const m of this.catalog.index.structures[u]!.meshes) own.add(m);
    return (center, direction, distance) => {
      const chunks = [...renderer.chunkData()];
      const crossings = rayCrossings(new Ray(center.clone(), direction.clone()), chunks, (mesh) => this.meshModes[mesh] !== MODE_HIDDEN && !own.has(mesh));
      if (!crossings.length) return distance;
      const byMesh = new Map<number, number[]>();
      for (const c of crossings) {
        const list = byMesh.get(c.mesh);
        if (list) list.push(c.distance);
        else byMesh.set(c.mesh, [c.distance]);
      }
      for (const [mesh, list] of byMesh) {
        // A ray along an edge hits both triangles that share it: one crossing, not two.
        list.sort((a, b) => a - b);
        byMesh.set(mesh, list.filter((t, i) => i === 0 || t - list[i - 1]! > 1e-5));
      }
      let d = distance;
      for (let step = 0; step < 16; step++) {
        let exit = -1;
        for (const list of byMesh.values()) {
          const beyond = list.filter((t) => t > d);
          if (beyond.length % 2 === 1) exit = Math.max(exit, beyond[0]!);
        }
        if (exit < 0) break;
        d = exit + Math.max(0.08, distance * 0.25);
      }
      return d;
    };
  }

  private modelBox(): Box3 {
    const b = this.catalog.manifest.bounds;
    return new Box3(new Vector3(...b.min), new Vector3(...b.max));
  }

  private readonly pickOpaque = (mesh: number): boolean => this.meshModes[mesh] === MODE_OPAQUE;
  private readonly pickGhost = (mesh: number): boolean => this.meshModes[mesh] === MODE_GHOST;
  private readonly pickAny = (mesh: number): boolean => this.meshModes[mesh] !== MODE_HIDDEN;

  /**
   * Structure under a viewport point (client coordinates), or null. An opaque structure under
   * the point wins over translucent surroundings in front of it (unless `pickGhost`).
   */
  pickAt(clientX: number, clientY: number): string | null {
    if (!this.renderer) return null;
    const hit = this.options.pickGhost
      ? this.renderer.pick(clientX, clientY, this.pickAny)
      : (this.renderer.pick(clientX, clientY, this.pickOpaque) ?? this.renderer.pick(clientX, clientY, this.pickGhost));
    if (!hit) return null;
    const owner = this.catalog.index.meshOwner[hit.mesh];
    return owner === undefined || owner < 0 ? null : this.catalog.index.structures[owner]!.id;
  }

  /** The orbit controls start a drag, a pinch or a wheel zoom. */
  private readonly onControlsStart = () => {
    this.cameraSource = 'pointer';
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.id !== event.pointerId || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const now = performance.now();
    if (moved > 6 || now - down.t > 700) return;
    // A click toggles the structure in the selection without moving the camera; empty space
    // does nothing. A double click (or double tap) selects the structure and zooms to it.
    const id = this.pickAt(event.clientX, event.clientY);
    const last = this.lastClick;
    if (id !== null && last && last.id === id && now - last.t < 400 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 16) {
      this.lastClick = null;
      const before = this.model.selected.filter((s) => s !== id);
      if (!this.model.selected.includes(id)) this.select([id], 'add', { source: 'pointer' });
      this.zoomTo(id, before, 'pointer');
      return;
    }
    this.lastClick = id === null ? null : { id, x: event.clientX, y: event.clientY, t: now };
    if (id !== null) this.select([id], 'toggle', { source: 'pointer' });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    this.hoverPoint = { x: event.clientX, y: event.clientY };
    if (!this.hoverFrame) {
      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = 0;
        if (!this.hoverPoint || this.disposed) return;
        const id = this.pickAt(this.hoverPoint.x, this.hoverPoint.y);
        this.setHover(id);
      });
    }
  };

  private readonly onPointerLeave = () => {
    this.hoverPoint = null;
    this.setHover(null);
  };

  private setHover(id: string | null) {
    const unit = id === null ? -1 : (this.catalog.get(id)?.index ?? -1);
    if (unit === this.hoverUnit) return;
    this.hoverUnit = unit;
    this.applyDisplay();
    this.events.emit('hover', { id });
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== this.container || !this.renderer) return;
    const step = Math.PI / 12;
    const rig = this.renderer.rig;
    let handled = true;
    this.cameraSource = 'keyboard';
    switch (event.key) {
      case 'ArrowLeft':
        if (event.shiftKey) rig.panBy(-0.08, 0);
        else rig.orbitBy(-step, 0);
        break;
      case 'ArrowRight':
        if (event.shiftKey) rig.panBy(0.08, 0);
        else rig.orbitBy(step, 0);
        break;
      case 'ArrowUp':
        if (event.shiftKey) rig.panBy(0, 0.08);
        else rig.orbitBy(0, -step);
        break;
      case 'ArrowDown':
        if (event.shiftKey) rig.panBy(0, -0.08);
        else rig.orbitBy(0, step);
        break;
      case '+':
      case '=':
        rig.zoomBy(0.85);
        break;
      case '-':
      case '_':
        rig.zoomBy(1 / 0.85);
        break;
      case 'f':
      case 'F':
        this.focusCamera();
        break;
      case 'Home':
      case '0':
        this.viewCamera('anterior');
        break;
      case 'Escape':
        if (this.model.selected.length) this.clearSelection({ source: 'keyboard' });
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };
}

export { isWebGL2Available };
