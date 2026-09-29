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
import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Frustum,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three';
import type { Quality } from '../../schema/index.js';
import { AtlasError } from '../errors.js';
import { CameraRig } from './camera-rig.js';
import type { ChunkGeometry } from './chunk-geometry.js';
import { AtlasMaterials, type MaterialColors } from './materials.js';
import { pickChunks, type PickHit } from './picking.js';

const LAYER_OPAQUE = 0;
const LAYER_GHOST = 1;

/**
 * Up to this many ghost structures are drawn layer by layer (each structure keeps its nearest
 * surface and the layers are blended back to front). Beyond it a single nearest-surface pass
 * over all ghost geometry is used, which keeps "load all" + ghost affordable.
 */
export const MAX_LAYERED_GHOSTS = 300;

interface GhostItem {
  view: ChunkView;
  start: number;
  count: number;
  center: Vector3;
  radius: number;
  depth: number;
}

const _v = new Vector3();
const _forward = new Vector3();
const _frustum = new Frustum();
const _projScreen = new Matrix4();
const _sphere = new Sphere();

export function isWebGL2Available(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const ok = Boolean(gl);
    (gl as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export interface RendererOptions {
  container: HTMLElement;
  meshCount: number;
  palette: readonly string[];
  background: string;
  quality: Quality;
  colors?: Partial<MaterialColors>;
  onCameraChange: () => void;
  onContextLost: () => void;
  onContextRestored: () => void;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  chunksOnScene: number;
  pixelRatio: number;
}

interface ChunkView {
  mesh: Mesh;
  data: ChunkGeometry;
}

/**
 * Three.js rendering of chunk geometry: an opaque pass, then — only when something is ghosted —
 * a depth pre-pass and a colour pass for ghost geometry. The pre-pass keeps only the nearest
 * ghost surface per pixel, so the result does not depend on draw order (no sorting flicker
 * between nested or intersecting structures); the trade-off is that ghost structures behind
 * other ghost structures are not blended in. Rendering happens on demand and pauses when the
 * page or the component is not visible.
 */
export class AtlasRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig: CameraRig;
  readonly materials: AtlasMaterials;
  readonly canvas: HTMLCanvasElement;
  private readonly chunks = new Map<number, ChunkView>();
  private readonly raycaster = new Raycaster();
  private hasGhost = false;
  private ghostLayered = false;
  private ghostItems: GhostItem[] = [];
  private readonly sentinel: Mesh;
  private needsRender = true;
  private raf = 0;
  private hiddenPage = false;
  private offscreen = false;
  private contextLost = false;
  private disposed = false;
  private quality: Quality;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private lastFrameMs = 0;
  private frameTimes: number[] = [];

  constructor(private readonly options: RendererOptions) {
    this.quality = options.quality;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'svitylo-anatomy-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    options.container.appendChild(this.canvas);

    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch (error) {
      // No context (a blocked GPU, too many contexts): leave no canvas behind.
      this.canvas.remove();
      throw new AtlasError('WEBGL2_UNAVAILABLE', 'The WebGL2 context could not be created', { recoverable: false }, { cause: error });
    }
    this.renderer.autoClear = false;
    this.renderer.setClearColor(new Color(options.background), 1);
    this.renderer.setPixelRatio(this.pixelRatioFor(this.quality));

    this.materials = new AtlasMaterials(options.meshCount, options.palette);
    if (options.colors) this.materials.setColors(options.colors);
    this.materials.setQuality(this.quality);
    // Runs last in the opaque render (transparent list) and draws layered ghost geometry there,
    // while three.js render state is valid.
    const sentinelGeometry = new BufferGeometry();
    sentinelGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    this.sentinel = new Mesh(
      sentinelGeometry,
      new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }),
    );
    this.sentinel.frustumCulled = false;
    this.sentinel.renderOrder = Number.MAX_SAFE_INTEGER;
    this.sentinel.onAfterRender = (renderer, scene, camera) => this.drawLayeredGhosts(renderer, scene, camera);
    this.scene.add(this.sentinel);

    this.rig = new CameraRig(this.canvas, () => {
      this.requestRender();
      options.onCameraChange();
    });

    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.hiddenPage = document.visibilityState === 'hidden';

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(options.container);
    }
    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        this.offscreen = entry ? !entry.isIntersecting : false;
        if (!this.offscreen) this.requestRender();
      });
      this.intersectionObserver.observe(options.container);
    }
    this.resize();
  }

  private pixelRatioFor(quality: Quality): number {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    return quality === 'economy' ? Math.min(dpr, 1) : Math.min(dpr, 2);
  }

  setBackground(color: string): void {
    this.renderer.setClearColor(new Color(color), 1);
    this.requestRender();
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.materials.setQuality(quality);
    this.renderer.setPixelRatio(this.pixelRatioFor(quality));
    this.resize();
  }

  setModelBounds(bounds: Box3): void {
    this.rig.setModelBounds(bounds);
  }

  /** Places (or replaces) the geometry of one chunk on the scene. The caller owns the geometry. */
  setChunk(chunk: number, data: ChunkGeometry): void {
    this.removeChunk(chunk);
    const mesh = new Mesh(data.geometry, this.materials.opaque);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(data.matrix);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.name = `chunk-${chunk}`;
    mesh.visible = false;
    this.scene.add(mesh);
    this.chunks.set(chunk, { mesh, data });
  }

  removeChunk(chunk: number): void {
    const view = this.chunks.get(chunk);
    if (!view) return;
    this.scene.remove(view.mesh);
    this.chunks.delete(chunk);
    this.requestRender();
  }

  chunk(chunk: number): ChunkGeometry | undefined {
    return this.chunks.get(chunk)?.data;
  }

  chunkData(): IterableIterator<ChunkGeometry> {
    return [...this.chunks.values()].map((c) => c.data)[Symbol.iterator]();
  }

  /**
   * Writes per-mesh display modes (0 hidden, 1 opaque, 2 ghost) and flags into the state
   * texture and updates which chunks take part in which pass.
   */
  applyStates(modes: Uint8Array, flags: Uint8Array): void {
    let ghostCount = 0;
    for (let i = 0; i < modes.length; i++) {
      this.materials.setMeshState(i, modes[i]!, flags[i]!);
      if (modes[i] === 2) ghostCount++;
    }
    this.materials.commit();
    this.ghostLayered = ghostCount > 0 && ghostCount <= MAX_LAYERED_GHOSTS;
    this.ghostItems = [];
    let anyGhost = false;
    for (const view of this.chunks.values()) {
      const { mesh, data } = view;
      let opaque = false;
      let ghost = false;
      for (let m = data.meshStart; m < data.meshStart + data.meshCount; m++) {
        const mode = modes[m];
        if (mode === 1) opaque = true;
        else if (mode === 2) {
          ghost = true;
          const local = m - data.meshStart;
          if (this.ghostLayered && data.triCount[local]! > 0) {
            const b = local * 6;
            const box = new Box3(
              new Vector3(data.bounds[b], data.bounds[b + 1], data.bounds[b + 2]),
              new Vector3(data.bounds[b + 3], data.bounds[b + 4], data.bounds[b + 5]),
            ).applyMatrix4(data.matrix);
            const sphere = box.getBoundingSphere(new Sphere());
            this.ghostItems.push({
              view,
              start: data.triStart[local]! * 3,
              count: data.triCount[local]! * 3,
              center: sphere.center,
              radius: sphere.radius,
              depth: 0,
            });
          }
        }
      }
      mesh.layers.disableAll();
      // Layered ghosts are drawn with renderBufferDirect; keeping the chunk in the regular pass
      // makes three.js upload and update its geometry (its non-opaque vertices are culled).
      if (opaque || (ghost && this.ghostLayered)) mesh.layers.enable(LAYER_OPAQUE);
      if (ghost && !this.ghostLayered) mesh.layers.enable(LAYER_GHOST);
      mesh.visible = opaque || ghost;
      anyGhost ||= ghost;
    }
    this.hasGhost = anyGhost;
    this.requestRender();
  }

  /**
   * Layered ghost rendering: structures are ordered back to front by the depth of their
   * bounding-sphere centre (smaller structures first on ties, so nested shells are blended
   * over their contents). Each structure gets a depth pre-pass and a colour pass, so only its
   * nearest surface is blended — no self-sorting artefacts within a structure — while the
   * layers of different structures stay visible through each other.
   */
  private drawLayeredGhosts(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    if (!this.ghostLayered || this.ghostItems.length === 0) return;
    camera.getWorldDirection(_forward);
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    const items: GhostItem[] = [];
    for (const item of this.ghostItems) {
      _sphere.set(item.center, item.radius);
      if (!_frustum.intersectsSphere(_sphere)) continue;
      item.depth = _v.copy(item.center).sub(camera.position).dot(_forward);
      items.push(item);
    }
    items.sort((a, b) => b.depth - a.depth || a.radius - b.radius);
    const updated = new Set<ChunkView>();
    for (const item of items) {
      const { mesh } = item.view;
      if (!updated.has(item.view)) {
        mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
        mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
        updated.add(item.view);
      }
      const group = { start: item.start, count: item.count, materialIndex: 0 };
      renderer.renderBufferDirect(camera, scene, mesh.geometry, this.materials.ghostDepth, mesh, group);
      renderer.renderBufferDirect(camera, scene, mesh.geometry, this.materials.ghostColor, mesh, group);
    }
  }

  setGhostOpacity(opacity: number): void {
    this.materials.setGhostOpacity(opacity);
    this.requestRender();
  }

  pick(clientX: number, clientY: number, pickable: (mesh: number) => boolean): PickHit | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.rig.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const visibleChunks = [...this.chunks.values()].filter((c) => c.mesh.visible).map((c) => c.data);
    return pickChunks(this.raycaster.ray, visibleChunks, pickable);
  }

  requestRender(): void {
    this.needsRender = true;
    this.schedule();
  }

  private schedule() {
    if (this.raf || this.disposed || this.hiddenPage || this.offscreen || this.contextLost) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.contextLost) return;
    const moving = this.rig.update(now);
    if (this.needsRender || moving) this.render();
    if (moving) this.schedule();
  };

  private render() {
    const started = performance.now();
    this.needsRender = false;
    const camera = this.rig.camera;
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    camera.layers.set(LAYER_OPAQUE);
    this.renderer.render(this.scene, camera);
    if (this.hasGhost && !this.ghostLayered) {
      camera.layers.set(LAYER_GHOST);
      this.scene.overrideMaterial = this.materials.ghostDepth;
      this.renderer.render(this.scene, camera);
      this.scene.overrideMaterial = this.materials.ghostColor;
      this.renderer.render(this.scene, camera);
      this.scene.overrideMaterial = null;
      camera.layers.set(LAYER_OPAQUE);
    }
    this.lastFrameMs = performance.now() - started;
    this.frameTimes.push(this.lastFrameMs);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
  }

  /** Renders immediately (used by tests and after state changes that must be visible now). */
  renderNow(): void {
    if (this.disposed || this.contextLost) return;
    this.rig.update(performance.now());
    this.render();
  }

  /** CPU time spent in the last frames (submission only; GPU time is not measurable here). */
  frameTimeStats(): { p50: number; p95: number; samples: number } {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    return { p50: q(0.5), p95: q(0.95), samples: sorted.length };
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.options.container;
    const w = Math.max(1, clientWidth);
    const h = Math.max(1, clientHeight);
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
    this.requestRender();
  }

  stats(): RenderStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      chunksOnScene: this.chunks.size,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  /** Asks the browser to restore a lost WebGL context. */
  restoreContext(): void {
    try {
      this.renderer.forceContextRestore();
    } catch {
      // Restoration is up to the browser; the viewer offers a full re-creation otherwise.
    }
  }

  /** Test hook: simulates a context loss through WEBGL_lose_context. */
  loseContext(): void {
    this.renderer.forceContextLoss();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.options.onContextLost();
  };

  private readonly onContextRestored = () => {
    this.contextLost = false;
    this.materials.stateTexture.needsUpdate = true;
    this.materials.paletteTexture.needsUpdate = true;
    this.options.onContextRestored();
    this.requestRender();
  };

  private readonly onVisibilityChange = () => {
    this.hiddenPage = document.visibilityState === 'hidden';
    if (!this.hiddenPage) this.requestRender();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    for (const chunk of [...this.chunks.keys()]) this.removeChunk(chunk);
    this.ghostItems = [];
    this.scene.remove(this.sentinel);
    this.sentinel.geometry.dispose();
    (this.sentinel.material as MeshBasicMaterial).dispose();
    this.rig.dispose();
    this.materials.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    // Release the context now instead of waiting for garbage collection (browsers cap live contexts).
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
