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
import { Box3, MathUtils, PerspectiveCamera, Sphere, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Vec3 } from '../../schema/index.js';

export const STANDARD_VIEWS = ['anterior', 'posterior', 'left', 'right', 'superior', 'inferior'] as const;
export type StandardView = (typeof STANDARD_VIEWS)[number];

/*
 * Anatomical position: +Y up, the body faces +Z, the patient's left side is +X.
 * "left" views the patient's left side; superior/inferior keep the anterior side at the bottom/top.
 */
const VIEW_DIRECTIONS: Record<StandardView, Vector3> = {
  anterior: new Vector3(0, 0, 1),
  posterior: new Vector3(0, 0, -1),
  left: new Vector3(1, 0, 0),
  right: new Vector3(-1, 0, 0),
  superior: new Vector3(0, 1, 0.0001).normalize(),
  inferior: new Vector3(0, -1, 0.0001).normalize(),
};

export interface CameraSnapshot {
  position: Vec3;
  target: Vec3;
  fov: number;
}

interface Animation {
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  start: number;
  duration: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Orbit/pan/zoom from mouse, trackpad and touch (one finger rotates, two fingers zoom and pan),
 * focus on structures, standard views and keyboard control. Distance limits follow the size of
 * the model; with `prefers-reduced-motion` transitions are instant.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private animation: Animation | null = null;
  private modelRadius = 1;
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private readonly onMotionChange = () => {
    this.reducedMotion = this.motionQuery?.matches ?? false;
  };

  constructor(domElement: HTMLElement, private readonly onChange: () => void) {
    this.camera = new PerspectiveCamera(35, 1, 0.01, 50);
    this.camera.position.set(0, 1, 5);
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.rotateSpeed = 0.8;
    this.controls.target.set(0, 1, 0);
    this.controls.addEventListener('change', this.onChange);
    this.controls.addEventListener('start', this.cancelAnimation);
    if (typeof matchMedia === 'function') {
      this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener?.('change', this.onMotionChange);
    }
  }

  /** Sets distance limits and clipping planes from the dataset bounds. */
  setModelBounds(bounds: Box3): void {
    const sphere = bounds.getBoundingSphere(new Sphere());
    this.modelRadius = Math.max(sphere.radius, 0.05);
    this.controls.minDistance = 0.004;
    this.controls.maxDistance = this.modelRadius * 8;
    this.updateClipping();
  }

  get isAnimating(): boolean {
    return this.animation !== null;
  }

  readonly cancelAnimation = () => {
    this.animation = null;
  };

  /** Advances damping and transitions. Returns true while the camera is still moving. */
  update(now: number): boolean {
    let moving = false;
    if (this.animation) {
      const a = this.animation;
      const t = a.duration <= 0 ? 1 : Math.min((now - a.start) / a.duration, 1);
      const k = easeInOut(t);
      this.camera.position.lerpVectors(a.fromPos, a.toPos, k);
      this.controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
      if (t >= 1) this.animation = null;
      moving = true;
    }
    if (this.controls.update()) moving = true;
    this.updateClipping();
    return moving || this.animation !== null;
  }

  private updateClipping() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const near = MathUtils.clamp(distance * 0.01, 0.0005, 0.05);
    const far = distance + this.modelRadius * 6;
    if (Math.abs(near - this.camera.near) > 1e-6 || Math.abs(far - this.camera.far) > 1e-4) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Camera distance that fits a sphere into the view with some padding. */
  fitDistance(radius: number, padding = 1.2): number {
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const fov = Math.min(vFov, hFov);
    return Math.max((radius * padding) / Math.sin(fov / 2), this.controls.minDistance * 2);
  }

  /**
   * Focuses on bounds, keeping the current viewing direction unless `direction` is given.
   * `clearance` may move the camera further out along that direction (e.g. out of the
   * structures that would otherwise surround it).
   */
  focusBounds(
    bounds: Box3,
    options: {
      direction?: Vector3;
      padding?: number;
      animate?: boolean;
      clearance?: (center: Vector3, direction: Vector3, distance: number) => number;
    } = {},
  ): void {
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.003);
    const direction = options.direction?.clone() ?? this.viewDirection();
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
    direction.normalize();
    let distance = MathUtils.clamp(this.fitDistance(radius, options.padding), this.controls.minDistance, this.controls.maxDistance);
    if (options.clearance) distance = MathUtils.clamp(options.clearance(sphere.center, direction, distance), distance, this.controls.maxDistance);
    const position = sphere.center.clone().add(direction.multiplyScalar(distance));
    this.moveTo(position, sphere.center, options.animate ?? true);
  }

  view(view: StandardView, bounds: Box3, animate = true, clearance?: (center: Vector3, direction: Vector3, distance: number) => number): void {
    this.focusBounds(bounds, { direction: VIEW_DIRECTIONS[view], animate, clearance });
  }

  /** Unit vector from the orbit target to the camera (where the camera will be after a transition). */
  viewDirection(): Vector3 {
    const position = this.animation?.toPos ?? this.camera.position;
    const target = this.animation?.toTarget ?? this.controls.target;
    return position.clone().sub(target).normalize();
  }

  /** The standard view the camera looks from (within ~2°), or null. */
  currentView(): StandardView | null {
    const direction = this.viewDirection();
    for (const view of STANDARD_VIEWS) if (direction.dot(VIEW_DIRECTIONS[view]) > 0.9994) return view;
    return null;
  }

  moveTo(position: Vector3, target: Vector3, animate = true): void {
    const duration = animate && !this.reducedMotion ? 480 : 0;
    this.animation = {
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      start: performance.now(),
      duration,
    };
    if (duration === 0) this.update(performance.now());
    this.onChange();
  }

  snapshot(): CameraSnapshot {
    const p = this.animation?.toPos ?? this.camera.position;
    const t = this.animation?.toTarget ?? this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fov: this.camera.fov };
  }

  restore(snapshot: CameraSnapshot | { position: Vec3; target: Vec3; fov?: number }, animate = false): void {
    if (snapshot.fov !== undefined && snapshot.fov !== this.camera.fov) {
      this.camera.fov = snapshot.fov;
      this.camera.updateProjectionMatrix();
    }
    const target = new Vector3(...snapshot.target);
    const position = new Vector3(...snapshot.position);
    const offset = position.clone().sub(target);
    const distance = MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance);
    if (offset.lengthSq() < 1e-12) offset.set(0, 0, 1);
    position.copy(target).add(offset.setLength(distance));
    this.moveTo(position, target, animate);
  }

  /** Keyboard orbit/zoom/pan in small steps (arrow keys, +/-, shift+arrows). */
  orbitBy(deltaAzimuth: number, deltaPolar: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    s.theta += deltaAzimuth;
    s.phi = MathUtils.clamp(s.phi + deltaPolar, 0.01, Math.PI - 0.01);
    offset.setFromSpherical(s);
    this.moveTo(this.controls.target.clone().add(offset), this.controls.target.clone(), false);
  }

  zoomBy(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.moveTo(this.controls.target.clone().add(offset.setLength(distance)), this.controls.target.clone(), false);
  }

  panBy(dx: number, dy: number): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const move = right.multiplyScalar(dx * distance).add(up.multiplyScalar(dy * distance));
    this.moveTo(this.camera.position.clone().add(move), this.controls.target.clone().add(move), false);
  }

  dispose(): void {
    this.controls.removeEventListener('change', this.onChange);
    this.controls.removeEventListener('start', this.cancelAnimation);
    this.controls.dispose();
    this.motionQuery?.removeEventListener?.('change', this.onMotionChange);
  }
}
