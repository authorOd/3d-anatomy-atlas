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
  AddEquation,
  Color,
  CustomBlending,
  DataTexture,
  DoubleSide,
  GLSL3,
  LessEqualDepth,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  SrcAlphaFactor,
  UnsignedByteType,
  type IUniform,
} from 'three';
import type { Quality } from '../../schema/index.js';

/** Width of the per-mesh state texture (mesh index -> mode and flags). */
export const STATE_TEXTURE_WIDTH = 256;

export const FLAG_SELECTED = 1;
export const FLAG_HOVER = 2;

const PASS_OPAQUE = 1;
const PASS_GHOST = 2;

/*
 * All chunk geometry is drawn with three shared materials. Every vertex carries its mesh
 * index and palette index (attribute `_id`); a small state texture tells the shaders whether
 * that mesh is hidden, opaque or ghost and whether it is selected or hovered. Changing
 * visibility, selection or ghosting therefore updates a few bytes instead of swapping or
 * cloning materials, and every chunk stays one draw call per pass.
 */
const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
in vec2 _id;
uniform highp sampler2D stateTex;
uniform highp sampler2D paletteTex;
uniform int stateWidth;
out vec3 vNormal;
out vec3 vViewPosition;
flat out vec3 vColor;
flat out float vFlags;
void main() {
  int idx = int(_id.x + 0.5);
  vec4 st = texelFetch(stateTex, ivec2(idx % stateWidth, idx / stateWidth), 0);
  int mode = int(st.r * 255.0 + 0.5);
  if (mode != PASS_MODE) {
    // Outside the clip volume: the whole triangle is discarded before rasterisation.
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    vNormal = vec3(0.0, 0.0, 1.0);
    vViewPosition = vec3(0.0);
    vColor = vec3(0.0);
    vFlags = 0.0;
    return;
  }
  vFlags = st.g * 255.0;
  vColor = texelFetch(paletteTex, ivec2(int(_id.y + 0.5), 0), 0).rgb;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vNormal;
in vec3 vViewPosition;
flat in vec3 vColor;
flat in float vFlags;
uniform vec3 highlightColor;
uniform vec3 hoverColor;
uniform vec3 ghostTint;
uniform float ghostOpacity;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 v = normalize(vViewPosition);
  vec3 n = normalize(vNormal);
  // Open sheets are seen from both sides and source winding is not always consistent:
  // always light the side that faces the viewer.
  if (dot(n, v) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.35, 0.55, 0.75));
  vec3 fill = normalize(vec3(-0.6, -0.25, 0.45));
  float hemi = 0.5 + 0.5 * n.y;
  vec3 color = vColor * (0.30 + 0.16 * hemi + 0.62 * max(dot(n, key), 0.0) + 0.16 * max(dot(n, fill), 0.0));
#ifndef ECONOMY
  vec3 h = normalize(key + v);
  color += vec3(0.10) * pow(max(dot(n, h), 0.0), 28.0);
#endif
  int flags = int(vFlags + 0.5);
  if ((flags & 1) != 0) {
    // A light tint keeps the tissue colour recognisable; the glowing rim marks the selection.
#ifdef ECONOMY
    color = mix(color, highlightColor, 0.3);
#else
    color = mix(color, highlightColor, 0.14);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    color += highlightColor * rim * 0.85;
#endif
  } else if ((flags & 2) != 0) {
    color = mix(color, hoverColor, 0.24);
  }
#if PASS_MODE == 2
  #ifdef ECONOMY
  float alpha = ghostOpacity;
  #else
  float fresnel = pow(1.0 - abs(dot(n, v)), 1.6);
  float alpha = clamp(ghostOpacity * (0.35 + 1.1 * fresnel), 0.02, 0.95);
  #endif
  fragColor = vec4(mix(color, ghostTint, 0.28), alpha);
#else
  fragColor = vec4(color, 1.0);
#endif
}
`;

export interface MaterialColors {
  highlight: string;
  hover: string;
  ghostTint: string;
}

/** Selection in the primary blue of the Svitylo design system; hover in its light blue. */
export const DEFAULT_MATERIAL_COLORS: MaterialColors = {
  highlight: '#3977ff',
  hover: '#a8c3ff',
  ghostTint: '#cfe0ea',
};

function hexToBytes(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Colour with raw sRGB components (no conversion to the linear working space). */
function displayColor(hex: string): Color {
  const [r, g, b] = hexToBytes(hex);
  return new Color().setRGB(r / 255, g / 255, b / 255, 'srgb-linear');
}

export class AtlasMaterials {
  readonly stateData: Uint8Array;
  readonly stateTexture: DataTexture;
  readonly paletteTexture: DataTexture;
  readonly opaque: ShaderMaterial;
  readonly ghostDepth: ShaderMaterial;
  readonly ghostColor: ShaderMaterial;
  private readonly uniforms: Record<string, IUniform>;
  private quality: Quality = 'standard';

  constructor(meshCount: number, palette: readonly string[], colors: MaterialColors = DEFAULT_MATERIAL_COLORS) {
    const rows = Math.max(1, Math.ceil(Math.max(meshCount, 1) / STATE_TEXTURE_WIDTH));
    this.stateData = new Uint8Array(STATE_TEXTURE_WIDTH * rows * 4);
    this.stateTexture = new DataTexture(this.stateData, STATE_TEXTURE_WIDTH, rows, RGBAFormat, UnsignedByteType);
    this.stateTexture.minFilter = NearestFilter;
    this.stateTexture.magFilter = NearestFilter;
    this.stateTexture.generateMipmaps = false;
    this.stateTexture.needsUpdate = true;

    const paletteData = new Uint8Array(256 * 4);
    palette.forEach((hex, i) => {
      const [r, g, b] = hexToBytes(hex);
      paletteData[i * 4] = r;
      paletteData[i * 4 + 1] = g;
      paletteData[i * 4 + 2] = b;
      paletteData[i * 4 + 3] = 255;
    });
    this.paletteTexture = new DataTexture(paletteData, 256, 1, RGBAFormat, UnsignedByteType);
    this.paletteTexture.minFilter = NearestFilter;
    this.paletteTexture.magFilter = NearestFilter;
    this.paletteTexture.generateMipmaps = false;
    this.paletteTexture.needsUpdate = true;

    // Palette and highlight colours are display (sRGB) values; the shaders write them unchanged.
    const hexToVec = displayColor;
    this.uniforms = {
      stateTex: { value: this.stateTexture },
      paletteTex: { value: this.paletteTexture },
      stateWidth: { value: STATE_TEXTURE_WIDTH },
      highlightColor: { value: hexToVec(colors.highlight) },
      hoverColor: { value: hexToVec(colors.hover) },
      ghostTint: { value: hexToVec(colors.ghostTint) },
      ghostOpacity: { value: 0.22 },
    };

    this.opaque = this.create(PASS_OPAQUE, {});
    this.ghostDepth = this.create(PASS_GHOST, { colorWrite: false, depthWrite: true });
    // Custom blending keeps the colour pass in the opaque render list, so the renderer can
    // interleave per-structure depth pre-passes and colour passes in its own order.
    this.ghostColor = this.create(PASS_GHOST, {
      transparent: false,
      depthWrite: false,
      depthFunc: LessEqualDepth,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
  }

  private create(pass: number, extra: Partial<ShaderMaterial>): ShaderMaterial {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      defines: this.defines(pass),
      side: DoubleSide,
    });
    Object.assign(material, extra);
    material.userData.pass = pass;
    return material;
  }

  private defines(pass: number): Record<string, string | number> {
    return this.quality === 'economy' ? { PASS_MODE: pass, ECONOMY: 1 } : { PASS_MODE: pass };
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    for (const m of [this.opaque, this.ghostDepth, this.ghostColor]) {
      m.defines = this.defines(m.userData.pass as number);
      m.needsUpdate = true;
    }
  }

  setGhostOpacity(opacity: number): void {
    this.uniforms.ghostOpacity!.value = opacity;
  }

  setColors(colors: Partial<MaterialColors>): void {
    if (colors.highlight) (this.uniforms.highlightColor!.value as Color).copy(displayColor(colors.highlight));
    if (colors.hover) (this.uniforms.hoverColor!.value as Color).copy(displayColor(colors.hover));
    if (colors.ghostTint) (this.uniforms.ghostTint!.value as Color).copy(displayColor(colors.ghostTint));
  }

  setMeshState(mesh: number, mode: number, flags: number): void {
    const o = mesh * 4;
    this.stateData[o] = mode;
    this.stateData[o + 1] = flags;
  }

  commit(): void {
    this.stateTexture.needsUpdate = true;
  }

  dispose(): void {
    this.stateTexture.dispose();
    this.paletteTexture.dispose();
    this.opaque.dispose();
    this.ghostDepth.dispose();
    this.ghostColor.dispose();
  }
}
