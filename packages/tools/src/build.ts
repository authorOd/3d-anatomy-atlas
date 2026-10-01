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
 * Builds a data release from the pinned Z-Anatomy snapshot export.
 *
 *   pnpm data:source    # fetch + verify the snapshot (pinned commit and checksums)
 *   pnpm data:export    # Blender headless export (packages/tools/blender/export_zanatomy.py)
 *   pnpm data:build     # this script: hierarchy, IDs, licences, two quality levels, chunks, manifest
 *
 * Options: --version <semver> (default: data package version), --channel preview|release,
 *          --work <dir> (default .work/zanatomy), --previous <release dir> (chunk files whose
 *          decoded content is unchanged are copied from it byte for byte)
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type {
  AssetEntry,
  DictionaryEntry,
  IssueEntry,
  Lang,
  LocalizedText,
  Manifest,
  SystemEntry,
} from '@authorod/svitylo-3d-anatomy-atlas/schema';
import { ExportGeometryReader, blenderToAtlas, readExport } from './lib/export-data.js';
import { appliedFixes, type CoverageCorrection, type GeometryFixSource } from './lib/geometry-fixes.js';
import { compact, geometryReady, simplify, splitByMaterial, triangleCount, type MeshData, type SimplifyOptions } from './lib/geometry.js';
import { IdRegistry } from './lib/ids.js';
import { DATA_PACKAGE, DATA_RELEASES, DATA_SOURCES, WORK_DIR, fileExists, log, readJson } from './lib/io.js';
import { Palette, type PaletteConfig } from './lib/palette.js';
import { writeRelease, type ReleaseInput, type ReleaseNode } from './lib/release.js';
import { applyReviews, parseReviewsFile } from './lib/reviews.js';
import { readTa2, readUkDrafts, ukTermLookup, ukrainianDraft } from './lib/terms.js';
import { buildTree, walk, type LicenseRule, type OptionalRule, type SourceNode, type SystemConfig } from './lib/tree.js';
import { validateRelease, type JunctionCheck, type OpeningCheck, type OrientationCheck } from './lib/validate.js';

export const STANDARD: SimplifyOptions = {
  maxError: 0.0002,
  maxRelativeError: 0.004,
  ratio: 0.1,
  keepBelow: 400,
  minTriangles: 60,
};

export const ECONOMY: SimplifyOptions = {
  maxError: 0.0007,
  maxRelativeError: 0.02,
  ratio: 0.03,
  keepBelow: 80,
  minTriangles: 16,
};

interface Lock {
  repository: string;
  revision: string;
  revisionDate: string;
  files: Record<string, string>;
  extracted: Record<string, string>;
  tools: { blender: string; subsurfMax: number; threads: number };
}

type SourceRef = [collection: string, name: string];

async function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      channel: { type: 'string', default: 'preview' },
      work: { type: 'string', default: join(WORK_DIR, 'zanatomy') },
      previous: { type: 'string' },
    },
  });
  const pkg = readJson<{ version: string }>(join(DATA_PACKAGE, 'package.json'));
  const version = values.version ?? pkg.version;
  const channel = values.channel as Manifest['channel'];
  const work = values.work!;
  const exportDir = join(work, 'export');
  const ta2Path = join(work, 'source', 'TA2.csv');
  const existing = join(DATA_RELEASES, version, 'manifest.json');
  if (fileExists(existing) && readJson<{ channel: string }>(existing).channel === 'release') {
    // Published data versions are immutable: old links and caches rely on their exact files.
    throw new Error(`Data ${version} is a published release; bump the version in packages/data/package.json (or pass --version)`);
  }
  if (!fileExists(join(exportDir, 'export.json'))) throw new Error(`No export in ${exportDir}; run pnpm data:export first`);
  if (!fileExists(ta2Path)) throw new Error(`TA2.csv not found in ${ta2Path}; run pnpm data:source first`);

  const lock = readJson<Lock>(join(DATA_SOURCES, 'zanatomy.lock.json'));
  const systemsFile = readJson<{ systems: SystemConfig[] }>(join(DATA_SOURCES, 'systems.json'));
  const licenses = readJson<{ defaultAsset: string; assets: Omit<AssetEntry, 'included'>[]; rules: LicenseRule[] }>(
    join(DATA_SOURCES, 'licenses.json'),
  );
  const overrides = readJson<{ optional: OptionalRule[] }>(join(DATA_SOURCES, 'overrides.json'));
  const issuesFile = readJson<{ issues: (Omit<IssueEntry, 'status'> & { targets: SourceRef[]; status?: IssueEntry['status'] })[] }>(
    join(DATA_SOURCES, 'issues.json'),
  );
  const checks = readJson<{
    orientation: OrientationCheck[];
    heightRange: [number, number];
    openings: OpeningCheck[];
    junctions: JunctionCheck[];
  }>(join(DATA_SOURCES, 'checks.json'));
  const fixes = readJson<{ fixes: GeometryFixSource[] }>(join(DATA_SOURCES, 'geometry-fixes.json')).fixes;
  const paletteConfig = readJson<PaletteConfig>(join(DATA_SOURCES, 'materials.json'));

  const exp = readExport(exportDir);
  if (exp.subsurfMax !== lock.tools.subsurfMax) throw new Error(`Export used subsurfMax=${exp.subsurfMax}, lock requires ${lock.tools.subsurfMax}`);
  const fixReports = appliedFixes(fixes, exp.fixes);
  if (!exp.blender.startsWith(lock.tools.blender)) log(`warning: export made with Blender ${exp.blender}, lock records ${lock.tools.blender}`);

  await geometryReady();
  const registry = new IdRegistry(join(DATA_SOURCES, 'ids.json'));
  const tree = buildTree(exp, systemsFile.systems, licenses.rules, licenses.defaultAsset, overrides.optional, registry);
  log(`hierarchy: ${tree.nodes.length} structures, ${tree.prunedGroups.length} label groups without geometry dropped`);

  // Origin between the heels on the floor (Blender coordinates: Z up, -Y front).
  const heel = (name: string) => exp.objects.find((o) => o.name === name && o.system.startsWith('1:'));
  const left = heel('Calcaneus.l');
  const right = heel('Calcaneus.r');
  if (!left || !right) throw new Error('Calcaneus.l/.r not found: cannot place the origin between the heels');
  const cx = (b: number[]) => (b[0]! + b[3]!) / 2;
  const cy = (b: number[]) => (b[1]! + b[4]!) / 2;
  const floor = Math.min(...exp.objects.map((o) => o.bboxBlender[2]));
  const heelX = (cx(left.bboxBlender) + cx(right.bboxBlender)) / 2;
  const heelY = (cy(left.bboxBlender) + cy(right.bboxBlender)) / 2;
  // atlas = (x - heelX, z - floor, -(y - heelY))
  const origin: [number, number, number] = [-heelX, -floor, heelY];
  const reader = new ExportGeometryReader(exportDir, origin);

  const resolveRef = ([collection, name]: SourceRef): string => {
    const node = tree.byCollectionName.get(`${collection}|${name}`);
    if (!node) throw new Error(`Source reference not found (or pruned): ${collection} / ${name}`);
    return node.id;
  };
  const palette = new Palette(paletteConfig);
  const ta2 = readTa2(ta2Path);
  const ukTerm = ukTermLookup(
    readUkDrafts(join(DATA_SOURCES, 'terms', 'uk.draft.json')),
    readUkDrafts(join(DATA_SOURCES, 'terms', 'uk.machine.json')),
  );
  const allowed = new Map(licenses.assets.map((a) => [a.id, a.commercialUse === 'allowed']));

  const names: Record<Lang, Map<string, DictionaryEntry>> = { uk: new Map(), la: new Map(), en: new Map() };
  const releaseNodes: ReleaseNode[] = [];
  let simplifiedStandard = 0;
  let simplifiedEconomy = 0;
  let sourceTriangles = 0;
  let processed = 0;
  const byId = new Map<string, SourceNode>();

  for (const root of tree.roots) {
    walk(root, (node) => {
      byId.set(node.id, node);
      const isSource = node.sourceName !== null && !node.external;
      names.en.set(node.id, {
        name: node.englishName,
        status: 'unreviewed',
        origin: isSource && node.englishName === node.parsed.base ? 'source' : 'editorial',
        source: isSource ? `Z-Anatomy ${node.object ? 'object' : 'group label'} “${node.sourceName}”` : 'Atlas editors',
      });
      if (node.object?.external?.la) {
        names.la.set(node.id, { name: node.object.external.la, status: 'unreviewed', origin: 'editorial', source: 'Atlas editors' });
      } else if (node.termKey) {
        const latin = ta2.latin(node.termKey);
        if (latin) names.la.set(node.id, { name: latin, status: 'unreviewed', origin: 'source', source: 'Z-Anatomy TA2.csv' });
      }
      // Ukrainian: drafts only (editors' first, then machine-assisted); never shown as reviewed.
      const uk = ukrainianDraft(node, ukTerm);
      if (uk) {
        names.uk.set(node.id, {
          name: uk.name,
          ...(uk.synonyms?.length ? { synonyms: uk.synonyms } : {}),
          status: 'unreviewed',
          origin: 'draft',
          source: uk.source,
        });
      }
    });
  }

  for (const node of tree.nodes) {
    const rn: ReleaseNode = {
      id: node.id,
      parent: node.parent?.id ?? null,
      system: node.system.id,
      kind: node.kind,
      review: { status: 'unreviewed' },
    };
    if (node.parsed.side) rn.side = node.parsed.side;
    if (node.optional) rn.optional = true;
    if (node.object) {
      rn.sourceObject = node.object.name.trim();
      const asset = node.asset ?? licenses.defaultAsset;
      if (!allowed.get(asset)) {
        rn.gap = { reason: 'licence', asset };
      } else {
        rn.asset = asset;
        const raw = reader.read(node.object);
        const slots = node.object.materials.map((m) => palette.indexOf(m));
        const fallback = palette.indexOf(null);
        const mesh: MeshData = splitByMaterial(raw.positions, raw.normals, raw.indices, (t) => slots[raw.triangleSlots[t]!] ?? fallback);
        if (triangleCount(mesh) === 0) {
          rn.gap = { reason: 'missing', note: { en: 'The source object has only degenerate triangles.' } };
        } else {
          const base = compact(mesh);
          const standard = simplify(base, STANDARD).mesh;
          const economy = simplify(standard, ECONOMY).mesh;
          sourceTriangles += triangleCount(base);
          simplifiedStandard += triangleCount(standard);
          simplifiedEconomy += triangleCount(economy);
          rn.geometry = { standard, economy };
        }
      }
      processed++;
      if (processed % 500 === 0) log(`  geometry: ${processed} objects`);
    }
    releaseNodes.push(rn);
  }
  log(`geometry: ${sourceTriangles.toLocaleString('en')} source triangles → standard ${simplifiedStandard.toLocaleString('en')}, economy ${simplifiedEconomy.toLocaleString('en')}`);

  // Human review records: the only way anything becomes "reviewed" or "needs correction".
  const reviewsPath = join(DATA_SOURCES, 'reviews.json');
  if (fileExists(reviewsPath)) {
    const applied = applyReviews(parseReviewsFile(readJson(reviewsPath)), { nodes: releaseNodes, names });
    log(`reviews: ${applied.structures} structures, ${applied.names} names`);
  }

  const issues: IssueEntry[] = [];
  const attach = (issueId: string, targets: SourceRef[]) => {
    for (const target of targets) {
      const rn = releaseNodes.find((n) => n.id === resolveRef(target))!;
      rn.issues = [...(rn.issues ?? []), issueId];
    }
  };
  for (const issue of issuesFile.issues) {
    const { targets, ...rest } = issue;
    issues.push({ ...rest, status: issue.status ?? 'open' } as IssueEntry);
    attach(issue.id, targets);
  }
  // Declared geometry corrections: a resolved geometry issue in the card of each target, and an
  // entry (with the seam in atlas coordinates) in the coverage report.
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const corrections: CoverageCorrection[] = fixes.map((fix) => {
    issues.push({ id: fix.id, kind: 'geometry', status: 'resolved', text: fix.note });
    attach(fix.id, fix.targets);
    const done = fixReports.get(fix.id)!;
    return {
      id: fix.id,
      kind: fix.kind,
      structures: fix.targets.map(resolveRef),
      reason: fix.reason,
      ...(done.gapBefore && done.gapAfter ? { gapBefore: done.gapBefore.max, gapAfter: done.gapAfter.max } : {}),
      ...(done.maxDisplacement !== undefined ? { maxDisplacement: done.maxDisplacement } : {}),
      seam: done.seam.map(([x, y, z]) => blenderToAtlas(x, y, z, origin).map(round) as [number, number, number]),
    };
  });

  const systems: SystemEntry[] = systemsFile.systems.map((s) => ({
    id: s.id,
    order: s.order,
    color: s.color,
    loadPriority: s.loadPriority,
    ...(s.hiddenByDefault ? { hiddenByDefault: true } : {}),
  }));

  const skippedByReason = new Map<string, number>();
  for (const s of exp.skipped) skippedByReason.set(s.reason, (skippedByReason.get(s.reason) ?? 0) + 1);
  const reviewNotice: LocalizedText = {
    uk: 'Дані походять із відкритого атласу Z-Anatomy і не пройшли повної незалежної анатомічної рецензії. Статуси перевірки показано для кожної структури; «не перевірено» не означає «помилково».',
    en: 'The data comes from the open Z-Anatomy atlas and has not had a complete independent anatomical review. Review statuses are shown per structure; “unreviewed” does not mean “wrong”.',
  };
  const input: ReleaseInput = {
    outDir: join(DATA_RELEASES, version),
    model: 'adult-male',
    version,
    channel,
    title: { uk: 'Тіло дорослого чоловіка (Z-Anatomy)', en: 'Adult male body (Z-Anatomy)' },
    generator: { name: '@svitylo-atlas/tools', version: '0.1.0' },
    generatedAt: lock.revisionDate,
    source: {
      name: 'Z-Anatomy',
      repository: lock.repository,
      revision: lock.revision,
      date: lock.revisionDate,
      files: [
        ...Object.entries(lock.files).map(([path, hash]) => ({ path, sha256: hash })),
        ...Object.entries(lock.extracted).map(([path, hash]) => ({ path, sha256: hash })),
      ],
    },
    systems,
    nodes: releaseNodes,
    palette: palette.entries,
    assets: licenses.assets,
    nonGeometryAssets: ['z-anatomy-terms', ...(names.uk.size ? ['atlas-uk-drafts'] : [])],
    aliases: Object.fromEntries(registry.aliases),
    issues,
    names,
    notices: {
      review: reviewNotice,
      ...(channel !== 'release'
        ? {
            data: {
              uk: 'Попередній реліз даних: ліцензійний аудит активів ще не завершено.',
              en: 'Preview data release: the licence audit of the assets is not complete yet.',
            },
          }
        : {}),
    },
    chunking: { targetTriangles: 60_000, maxTriangles: 110_000 },
    coverageNotes: [
      `Source: ${lock.repository} at ${lock.revision}; Blender ${exp.blender}; subdivision capped at level ${exp.subsurfMax}.`,
      'Structures follow the source hierarchy; label groups without geometry and text labels of sub-regions are not imported.',
      'Economy geometry is derived from the standard level; both levels keep every selectable structure.',
      `Standard simplification: max error ${STANDARD.maxError * 1000} mm (≤ ${STANDARD.maxRelativeError * 100}% of the structure size); economy: ${ECONOMY.maxError * 1000} mm (≤ ${ECONOMY.maxRelativeError * 100}%).`,
    ],
    excludedSummary: [
      ...[...skippedByReason.entries()].map(([reason, count]) => ({ reason: `Blender objects skipped (${reason})`, count })),
      { reason: 'Label groups without geometry', count: tree.prunedGroups.length },
      { reason: 'Label anchor objects (".j")', count: tree.skippedAnchors.length },
    ],
    corrections,
    ...(values.previous ? { previous: values.previous } : {}),
  };
  const summary = await writeRelease(input);
  registry.save();
  log(`summary: ${JSON.stringify(summary)}`);
  if (registry.created) log(`ID registry: ${registry.created} new IDs`);
  const unused = registry.unused();
  if (unused.length) log(`warning: ${unused.length} registry IDs no longer produced by the source (add aliases or keep them retired)`);

  const report = await validateRelease(input.outDir, {
    heightRange: checks.heightRange,
    orientation: checks.orientation,
    openings: checks.openings,
    junctions: checks.junctions,
  });
  for (const w of report.warnings.slice(0, 20)) log(`warning: ${w}`);
  for (const e of report.errors) log(`error: ${e}`);
  if (report.errors.length) process.exitCode = 1;
  else log(`validation passed (${report.stats.files} files, ${report.stats.chunks} chunks)`);
  void byId;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
