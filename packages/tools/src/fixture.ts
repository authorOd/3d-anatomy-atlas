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
/**
 * Generates the synthetic test dataset (not anatomy): simple primitives arranged like a body,
 * with the same manifest, dictionaries, chunking, quality levels, aliases, gaps and
 * licence records as a real release. Used by unit and end-to-end tests and safe to publish
 * (own work, CC0).
 *
 *   pnpm data:fixture
 */
import { join } from 'node:path';
import type {
  AssetEntry,
  DictionaryEntry,
  Lang,
  MaterialEntry,
  Review,
  SystemEntry,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { compact, geometryReady, type MeshData } from './lib/geometry.js';
import { REPO_ROOT, log } from './lib/io.js';
import { writeRelease, type ReleaseNode } from './lib/release.js';
import { validateRelease } from './lib/validate.js';

const OUT_ROOT = join(REPO_ROOT, 'test/fixtures/anatomy-data');

type V3 = [number, number, number];

/** Ellipsoid centred at `c` with radii `r`, as a UV sphere. */
function ellipsoid(c: V3, r: V3, material: number, segments: number, rings: number): MeshData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      pos.push(c[0] + r[0] * nx, c[1] + r[1] * ny, c[2] + r[2] * nz);
      const n = [nx / r[0], ny / r[1], nz / r[2]];
      const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      nrm.push(n[0]! / len, n[1]! / len, n[2]! / len);
    }
  }
  const row = segments + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * row + x;
      const b = a + row;
      if (y !== 0) idx.push(a, a + 1, b);
      if (y !== rings - 1) idx.push(a + 1, b + 1, b);
    }
  }
  return compact({
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    materials: new Uint8Array(pos.length / 3).fill(material),
    indices: Uint32Array.from(idx),
  });
}

/** Cylinder along Y from y0 to y1 (a long bone or a vessel). */
function cylinder(c: V3, radius: number, y0: number, y1: number, material: number, segments: number): MeshData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    const x = Math.cos(t);
    const z = Math.sin(t);
    pos.push(c[0] + x * radius, y0, c[2] + z * radius, c[0] + x * radius, y1, c[2] + z * radius);
    nrm.push(x, 0, z, x, 0, z);
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // caps
  for (const [y, ny] of [
    [y0, -1],
    [y1, 1],
  ] as const) {
    const center = pos.length / 3;
    pos.push(c[0], y, c[2]);
    nrm.push(0, ny, 0);
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      pos.push(c[0] + Math.cos(t) * radius, y, c[2] + Math.sin(t) * radius);
      nrm.push(0, ny, 0);
    }
    for (let s = 0; s < segments; s++) {
      if (ny > 0) idx.push(center, center + s + 1, center + s + 2);
      else idx.push(center, center + s + 2, center + s + 1);
    }
  }
  return compact({
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    materials: new Uint8Array(pos.length / 3).fill(material),
    indices: Uint32Array.from(idx),
  });
}

const unreviewed: Review = { status: 'unreviewed' };
const reviewed: Review = { status: 'reviewed', reviewer: 'Fixture reviewer', date: '2026-09-25', scope: 'Synthetic test fixture only' };

interface Spec {
  id: string;
  parent: string | null;
  kind?: ReleaseNode['kind'];
  side?: 'left' | 'right';
  optional?: boolean;
  gap?: boolean;
  issues?: string[];
  shape?: (quality: 'standard' | 'economy') => MeshData;
  names: { en: string; la?: string; uk?: string; ukStatus?: 'reviewed' | 'draft'; synonyms?: { en?: string[]; uk?: string[] } };
}

const hi = (q: 'standard' | 'economy') => (q === 'standard' ? 1 : 0);

// Palette indices
const SKIN = 0;
const BONE = 1;
const HEART = 2;
const ARTERY = 3;
const LUNG = 4;
const BRAIN = 5;

function specs(version: string): Spec[] {
  const s = (q: 'standard' | 'economy', segs: [number, number]) => (hi(q) ? segs[0] : segs[1]);
  const list: Spec[] = [
    { id: 'integument', parent: null, kind: 'system', names: { en: 'Integumentary system', la: 'Integumentum commune', uk: 'Покривна система', ukStatus: 'reviewed' } },
    { id: 'integument.skin', parent: 'integument', kind: 'group', names: { en: 'Skin', la: 'Cutis', uk: 'Шкіра', ukStatus: 'reviewed' } },
    {
      id: 'integument.skin_of_trunk',
      parent: 'integument.skin',
      shape: (q) => ellipsoid([0, 1.25, 0], [0.19, 0.36, 0.13], SKIN, s(q, [40, 14]), s(q, [28, 10])),
      names: { en: 'Skin of trunk', la: 'Cutis trunci', uk: 'Шкіра тулуба', ukStatus: 'draft' },
    },
    {
      id: 'integument.skin_of_head',
      parent: 'integument.skin',
      shape: (q) => ellipsoid([0, 1.66, 0.01], [0.1, 0.13, 0.11], SKIN, s(q, [32, 12]), s(q, [22, 8])),
      names: { en: 'Skin of head', la: 'Cutis capitis' },
    },
    { id: 'skeletal', parent: null, kind: 'system', names: { en: 'Skeletal system', la: 'Systema skeletale', uk: 'Скелетна система', ukStatus: 'reviewed' } },
    {
      id: 'skeletal.skull',
      parent: 'skeletal',
      shape: (q) => ellipsoid([0, 1.66, 0], [0.085, 0.11, 0.1], BONE, s(q, [28, 10]), s(q, [20, 8])),
      names: { en: 'Skull', la: 'Cranium', uk: 'Череп', ukStatus: 'reviewed' },
    },
    {
      id: 'skeletal.vertebral_column',
      parent: 'skeletal',
      shape: (q) => cylinder([0, 0, -0.07], 0.022, 0.95, 1.52, BONE, s(q, [18, 8])),
      names: { en: 'Vertebral column', la: 'Columna vertebralis', uk: 'Хребтовий стовп', ukStatus: 'draft' },
    },
    {
      id: 'skeletal.sternum',
      parent: 'skeletal',
      shape: (q) => cylinder([0, 0, 0.1], 0.018, 1.2, 1.42, BONE, s(q, [12, 6])),
      names: { en: 'Sternum', la: 'Sternum', uk: 'Груднина', ukStatus: 'reviewed' },
    },
    {
      id: 'skeletal.humerus_l',
      parent: 'skeletal',
      side: 'left',
      shape: (q) => cylinder([0.22, 0, 0], 0.016, 1.12, 1.42, BONE, s(q, [14, 6])),
      names: { en: 'Humerus', la: 'Humerus', uk: 'Плечова кістка', ukStatus: 'reviewed' },
    },
    {
      id: 'skeletal.humerus_r',
      parent: 'skeletal',
      side: 'right',
      shape: (q) => cylinder([-0.22, 0, 0], 0.016, 1.12, 1.42, BONE, s(q, [14, 6])),
      names: { en: 'Humerus', la: 'Humerus', uk: 'Плечова кістка', ukStatus: 'reviewed' },
    },
    {
      id: 'skeletal.femur_l',
      parent: 'skeletal',
      side: 'left',
      issues: ['femur-joined'],
      shape: (q) => cylinder([0.09, 0, 0], 0.02, 0.5, 0.92, BONE, s(q, [14, 6])),
      names: { en: 'Femur', la: 'Femur', uk: 'Стегнова кістка', ukStatus: 'draft' },
    },
    {
      id: 'skeletal.femur_r',
      parent: 'skeletal',
      side: 'right',
      shape: (q) => cylinder([-0.09, 0, 0], 0.02, 0.5, 0.92, BONE, s(q, [14, 6])),
      names: { en: 'Femur', la: 'Femur', uk: 'Стегнова кістка', ukStatus: 'draft' },
    },
    {
      id: 'skeletal.calcaneus_l',
      parent: 'skeletal',
      side: 'left',
      shape: (q) => ellipsoid([0.09, 0.03, -0.02], [0.025, 0.03, 0.04], BONE, s(q, [16, 8]), s(q, [10, 6])),
      names: { en: 'Calcaneus', la: 'Calcaneus' },
    },
    {
      id: 'skeletal.calcaneus_r',
      parent: 'skeletal',
      side: 'right',
      shape: (q) => ellipsoid([-0.09, 0.03, -0.02], [0.025, 0.03, 0.04], BONE, s(q, [16, 8]), s(q, [10, 6])),
      names: { en: 'Calcaneus', la: 'Calcaneus' },
    },
    { id: 'cardiovascular', parent: null, kind: 'system', names: { en: 'Cardiovascular system', la: 'Systema cardiovasculare', uk: 'Серцево-судинна система', ukStatus: 'reviewed' } },
    { id: 'cardiovascular.heart', parent: 'cardiovascular', kind: 'group', names: { en: 'Heart', la: 'Cor', uk: 'Серце', ukStatus: 'reviewed', synonyms: { en: ['Cardiac muscle organ'] } } },
    {
      id: 'cardiovascular.heart.left_ventricle',
      parent: 'cardiovascular.heart',
      shape: (q) => ellipsoid([0.035, 1.28, 0.04], [0.035, 0.05, 0.035], HEART, s(q, [24, 10]), s(q, [16, 8])),
      names: { en: 'Left ventricle', la: 'Ventriculus sinister', uk: 'Лівий шлуночок', ukStatus: 'reviewed', synonyms: { en: ['LV'], uk: ['ЛШ'] } },
    },
    {
      id: 'cardiovascular.heart.right_ventricle',
      parent: 'cardiovascular.heart',
      shape: (q) => ellipsoid([-0.02, 1.29, 0.05], [0.03, 0.045, 0.03], HEART, s(q, [24, 10]), s(q, [16, 8])),
      names: { en: 'Right ventricle', la: 'Ventriculus dexter', uk: 'Правий шлуночок', ukStatus: 'draft', synonyms: { en: ['RV'] } },
    },
    {
      id: 'cardiovascular.heart.valves',
      parent: 'cardiovascular.heart',
      kind: 'group',
      gap: true,
      names: { en: 'Valves of heart', la: 'Valvae cordis' },
    },
    {
      id: 'cardiovascular.aorta',
      parent: 'cardiovascular',
      issues: ['aorta-simplified'],
      shape: (q) => cylinder([0.01, 0, 0.0], 0.012, 1.0, 1.36, ARTERY, s(q, [16, 6])),
      names: { en: 'Aorta', la: 'Aorta', uk: 'Аорта', ukStatus: 'reviewed' },
    },
    { id: 'respiratory', parent: null, kind: 'system', names: { en: 'Respiratory system', la: 'Systema respiratorium', uk: 'Дихальна система', ukStatus: 'reviewed' } },
    {
      id: 'respiratory.lung_l',
      parent: 'respiratory',
      side: 'left',
      shape: (q) => ellipsoid([0.09, 1.3, 0.0], [0.07, 0.13, 0.08], LUNG, s(q, [28, 10]), s(q, [20, 8])),
      names: { en: 'Left lung', la: 'Pulmo sinister', uk: 'Ліва легеня', ukStatus: 'reviewed' },
    },
    {
      id: 'respiratory.lung_l.upper_part',
      parent: 'respiratory.lung_l',
      optional: true,
      shape: (q) => ellipsoid([0.09, 1.36, 0.0], [0.06, 0.06, 0.07], LUNG, s(q, [20, 8]), s(q, [14, 6])),
      names: { en: 'Upper part of left lung (alternative decomposition)' },
    },
    {
      id: 'respiratory.lung_r',
      parent: 'respiratory',
      side: 'right',
      shape: (q) => ellipsoid([-0.09, 1.3, 0.0], [0.075, 0.13, 0.08], LUNG, s(q, [28, 10]), s(q, [20, 8])),
      names: { en: 'Right lung', la: 'Pulmo dexter', uk: 'Права легеня', ukStatus: 'reviewed' },
    },
    { id: 'nervous', parent: null, kind: 'system', names: { en: 'Nervous system', la: 'Systema nervosum', uk: 'Нервова система', ukStatus: 'reviewed' } },
    {
      id: 'nervous.brain',
      parent: 'nervous',
      shape: (q) => ellipsoid([0, 1.68, 0], [0.07, 0.07, 0.085], BRAIN, s(q, [26, 10]), s(q, [18, 8])),
      names: { en: 'Brain', la: 'Encephalon', uk: 'Головний мозок', ukStatus: 'reviewed' },
    },
    {
      id: 'nervous.cortex',
      parent: 'nervous',
      gap: true,
      names: { en: 'Cerebral cortex', la: 'Cortex cerebri' },
    },
  ];
  if (version !== '1.0.0') {
    list.push({
      id: 'cardiovascular.pulmonary_trunk',
      parent: 'cardiovascular',
      shape: (q) => cylinder([-0.01, 0, 0.05], 0.01, 1.3, 1.38, ARTERY, s(q, [12, 6])),
      names: { en: 'Pulmonary trunk', la: 'Truncus pulmonalis' },
    });
  }
  return list;
}

const palette: MaterialEntry[] = [
  { key: 'skin', kind: 'skin', color: '#e2b095' },
  { key: 'bone', kind: 'bone', color: '#e6dcc2' },
  { key: 'heart', kind: 'muscle', color: '#b54a40' },
  { key: 'artery', kind: 'artery', color: '#c8322f' },
  { key: 'lung', kind: 'organ', color: '#e7a6a3' },
  { key: 'brain', kind: 'brain', color: '#e3a898' },
];

const assets: Omit<AssetEntry, 'included'>[] = [
  {
    id: 'synthetic-fixture',
    title: 'Synthetic test geometry (not anatomy)',
    authors: ['Svitylo 3D Anatomy Atlas contributors'],
    source: { name: 'packages/tools/src/fixture.ts', url: 'https://github.com/authorOd/3d-anatomy-atlas', version: 'generated' },
    license: { id: 'CC0-1.0', name: 'CC0 1.0 Universal', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    changes: 'Generated primitives.',
    attribution: 'Synthetic fixture geometry, CC0.',
    permissionBasis: 'Own work generated by the test tooling.',
    commercialUse: 'allowed',
    audit: { status: 'approved', reviewer: 'Fixture', date: '2026-09-25', notes: 'Synthetic data' },
  },
  {
    id: 'fixture-blocked',
    title: 'Blocked example asset (non-commercial)',
    authors: ['Example author'],
    source: { name: 'Example', url: 'https://example.org/', version: 'n/a' },
    license: { id: 'CC-BY-NC-4.0', name: 'Creative Commons Attribution-NonCommercial 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    changes: 'Not included.',
    attribution: 'Not included.',
    permissionBasis: 'Non-commercial terms: blocked from the standard set (tests the declared-gap path).',
    commercialUse: 'not-allowed',
    audit: { status: 'pending' },
  },
];

async function build(version: string) {
  const list = specs(version);
  const names: Record<Lang, Map<string, DictionaryEntry>> = { uk: new Map(), la: new Map(), en: new Map() };
  const nodes: ReleaseNode[] = list.map((spec) => {
    const system = spec.parent === null ? spec.id : spec.id.split('.')[0]!;
    names.en.set(spec.id, {
      name: spec.names.en,
      status: 'unreviewed',
      origin: 'source',
      source: 'Fixture',
      ...(spec.names.synonyms?.en ? { synonyms: spec.names.synonyms.en } : {}),
    });
    if (spec.names.la) names.la.set(spec.id, { name: spec.names.la, status: 'unreviewed', origin: 'source', source: 'Fixture' });
    if (spec.names.uk) {
      const isReviewed = spec.names.ukStatus === 'reviewed';
      names.uk.set(spec.id, {
        name: spec.names.uk,
        status: isReviewed ? 'reviewed' : 'unreviewed',
        origin: isReviewed ? 'editorial' : 'draft',
        source: 'Fixture',
        ...(isReviewed ? { review: reviewed } : {}),
        ...(spec.names.synonyms?.uk ? { synonyms: spec.names.synonyms.uk } : {}),
      });
    }
    const node: ReleaseNode = {
      id: spec.id,
      parent: spec.parent,
      system,
      kind: spec.kind ?? 'structure',
      review: spec.id === 'cardiovascular.heart.left_ventricle' ? reviewed : unreviewed,
    };
    if (spec.side) node.side = spec.side;
    if (spec.optional) node.optional = true;
    if (spec.issues) node.issues = spec.issues;
    if (spec.gap) node.gap = { reason: 'licence', asset: 'fixture-blocked', note: { en: 'Example of a declared gap.' } };
    if (spec.shape) {
      node.asset = 'synthetic-fixture';
      node.geometry = { standard: spec.shape('standard'), economy: spec.shape('economy') };
    }
    return node;
  });
  const systems: SystemEntry[] = [
    { id: 'integument', order: 0, color: '#e2b095', loadPriority: 0 },
    { id: 'skeletal', order: 1, color: '#e6dcc2', loadPriority: 1 },
    { id: 'cardiovascular', order: 2, color: '#c8322f', loadPriority: 2 },
    { id: 'respiratory', order: 3, color: '#e7a6a3', loadPriority: 3 },
    { id: 'nervous', order: 4, color: '#f0cf5a', loadPriority: 4 },
  ];
  const outDir = join(OUT_ROOT, version);
  await writeRelease({
    outDir,
    model: 'fixture',
    version,
    channel: 'fixture',
    title: { uk: 'Тестовий набір (синтетичні примітиви)', en: 'Test fixture (synthetic primitives)' },
    generator: { name: '@svitylo-atlas/tools fixture', version: '0.1.0' },
    generatedAt: '2026-09-25T00:00:00Z',
    systems,
    nodes,
    palette,
    assets,
    nonGeometryAssets: [],
    aliases: { 'cardiovascular.cor': 'cardiovascular.heart' },
    issues: [
      {
        id: 'aorta-simplified',
        kind: 'geometry',
        status: 'open',
        text: { uk: 'Аорта у тестовому наборі — простий циліндр.', en: 'The fixture aorta is a plain cylinder.' },
      },
      {
        id: 'femur-joined',
        kind: 'geometry',
        status: 'resolved',
        text: { uk: 'У тестовому наборі стегнову кістку підведено до таза.', en: 'In the fixture the femur is joined to the pelvis.' },
      },
    ],
    names,
    notices: {
      review: { uk: 'Синтетичний тестовий набір: це не анатомічні дані.', en: 'Synthetic test fixture: this is not anatomical data.' },
    },
    chunking: { targetTriangles: 900, maxTriangles: 1400 },
    coverageNotes: ['Synthetic fixture for automated tests.'],
    excludedSummary: [],
  });
  const report = await validateRelease(outDir, {
    orientation: [{ left: 'skeletal.femur_l', right: 'skeletal.femur_r' }, { front: 'skeletal.sternum', behind: 'skeletal.vertebral_column' }],
  });
  for (const e of report.errors) log(`error: ${e}`);
  if (report.errors.length) process.exitCode = 1;
  else log(`fixture ${version}: validation passed (${report.stats.chunks} chunks)`);
}

await geometryReady();
await build('1.0.0');
await build('1.1.0');
