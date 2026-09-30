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
import { describe, expect, it } from 'vitest';
import { ViewModel, normalizeSearchText } from '@authorod/svitylo-3d-anatomy-atlas/core';
import { MODE_GHOST, MODE_HIDDEN, MODE_OPAQUE } from '@authorod/svitylo-3d-anatomy-atlas/core';
import { fixtureFetch, loadFixtureCatalog, loadReleaseCatalog } from './helpers.js';

describe('catalog loading', () => {
  it('loads metadata and dictionaries without requesting geometry', async () => {
    const log: string[] = [];
    const catalog = await loadFixtureCatalog('1.0.0', fixtureFetch({ log }));
    expect(catalog.manifest.model).toBe('fixture');
    expect(log.every((p) => p.endsWith('.json'))).toBe(true);
    expect(log.some((p) => p.endsWith('.glb'))).toBe(false);
  });

  it('reports a missing manifest as unavailable and a damaged one as invalid', async () => {
    await expect(loadFixtureCatalog('9.9.9')).rejects.toMatchObject({ code: 'MANIFEST_UNAVAILABLE' });
    const broken = fixtureFetch({ fail: (p) => (p.endsWith('names/uk.json') ? 500 : undefined) });
    await expect(loadFixtureCatalog('1.0.0', broken)).rejects.toMatchObject({ code: 'MANIFEST_UNAVAILABLE' });
  });

  it('resolves another data version only through the site data folder', async () => {
    const catalog = await loadFixtureCatalog('1.1.0');
    const older = await catalog.loadVersion('1.0.0');
    expect(older.manifest.version).toBe('1.0.0');
    expect(older.base.href).toBe('http://fixture.test/1.0.0/');
    await expect(catalog.loadVersion('7.0.0')).rejects.toMatchObject({ code: 'DATA_VERSION_UNAVAILABLE', details: { version: '7.0.0' } });
    await expect(catalog.loadVersion('../../etc')).rejects.toMatchObject({ code: 'DATA_VERSION_UNAVAILABLE' });
  });
});

describe('structure index', () => {
  it('resolves renamed IDs through aliases', async () => {
    const { index } = await loadFixtureCatalog();
    expect(index.canonicalId('cardiovascular.cor')).toBe('cardiovascular.heart');
    expect(index.get('cardiovascular.cor')?.id).toBe('cardiovascular.heart');
    expect(index.canonicalId('cardiovascular.nothing')).toBeUndefined();
  });

  it('expands logical parents to descendants and keeps alternative decompositions out by default', async () => {
    const { index } = await loadFixtureCatalog();
    const ids = (units: Iterable<number>) => [...units].map((u) => index.structures[u]!.id).sort();
    expect(ids(index.expand(['cardiovascular.heart'], 'default').units)).toEqual([
      'cardiovascular.heart.left_ventricle',
      'cardiovascular.heart.right_ventricle',
    ]);
    expect(ids(index.expand(['respiratory.lung_l'], 'default').units)).toEqual(['respiratory.lung_l']);
    expect(ids(index.expand(['respiratory.lung_l'], 'all').units)).toEqual(['respiratory.lung_l', 'respiratory.lung_l.upper_part']);
    expect(ids(index.expand(['respiratory.lung_l.upper_part'], 'default').units)).toEqual(['respiratory.lung_l.upper_part']);
    expect(ids(index.expand(['=respiratory.lung_l'], 'all').units)).toEqual(['respiratory.lung_l']);
    expect(index.expand(['nope.nope'], 'all').unknown).toEqual(['nope.nope']);
  });

  it('compresses any set of structures so that expanding it gives the same set', async () => {
    const { index } = await loadFixtureCatalog();
    const units = index.units;
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const mode of ['default', 'all'] as const) {
      for (let round = 0; round < 200; round++) {
        const set = new Set(units.filter(() => random() < 0.5));
        if (mode === 'default') {
          // Scene sets are unions of default subtrees.
          for (const u of [...set]) for (const d of index.subtreeUnits(index.structures[u]!, 'default')) set.add(d);
        }
        const refs = index.compress(set, mode);
        const back = index.expand(refs, mode).units;
        expect([...back].sort()).toEqual([...set].sort());
      }
    }
    expect(index.compress(new Set(index.allDefaultUnits()), 'default')).toEqual(['integument', 'skeletal', 'cardiovascular', 'respiratory', 'nervous']);
  });
});

describe('visibility rules', () => {
  it('isolation restricts, hidden narrows, selection alone never shows hidden structures', async () => {
    const catalog = await loadFixtureCatalog();
    const vm = new ViewModel(catalog.index);
    const unit = (id: string) => catalog.get(id)!.index;
    vm.scene = catalog.index.allDefaultUnits();
    vm.isolate = catalog.index.expand(['cardiovascular.heart', 'respiratory'], 'all').units;
    vm.hidden = catalog.index.expand(['respiratory.lung_r'], 'all').units;
    vm.selected = ['respiratory.lung_r', 'skeletal.skull'];
    const d = vm.display();
    expect(d.modes[unit('cardiovascular.heart.left_ventricle')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('respiratory.lung_l')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('respiratory.lung_r')]).toBe(MODE_HIDDEN);
    expect(d.modes[unit('skeletal.skull')]).toBe(MODE_HIDDEN);
    expect(d.modes[unit('respiratory.lung_l.upper_part')]).toBe(MODE_HIDDEN);
  });

  it('builds the surroundings ladder from the hierarchy: parent group, system, whole body', async () => {
    const { index } = await loadFixtureCatalog();
    const ladder = (id: string) => index.surroundingsLadder(index.get(id)!).map((l) => l.id);
    expect(ladder('cardiovascular.heart.left_ventricle')).toEqual(['cardiovascular.heart', 'cardiovascular', null]);
    expect(ladder('cardiovascular.heart')).toEqual(['cardiovascular', null]);
    // Ancestors that add nothing are skipped (the lung group only adds an optional part).
    expect(ladder('respiratory.lung_l')).toEqual(['respiratory', null]);
    expect(ladder('skeletal')).toEqual([null]);
    // The whole body is every default system (the same set "load all" shows).
    const body = index.surroundingsLadder(index.get('skeletal.femur_l')!).at(-1)!;
    expect([...body.units].sort()).toEqual([...index.allDefaultUnits()].sort());
  });

  it('the level decides how much of the surroundings is shown; with transparency only the selection stays opaque', async () => {
    const catalog = await loadFixtureCatalog();
    const vm = new ViewModel(catalog.index);
    const unit = (id: string) => catalog.get(id)!.index;
    const lv = 'cardiovascular.heart.left_ventricle';
    vm.placeExplicitly([unit(lv)], false);
    vm.select([lv], 'add');
    // Automatic: what is placed is shown, here only the selection (level 0).
    let d = vm.display();
    expect(d.level).toBe(0);
    expect(d.modes[unit('cardiovascular.heart.right_ventricle')]).toBe(MODE_HIDDEN);
    // A chosen level shows the surroundings: 1 = the heart, 2 = the system, 3 = the whole body.
    vm.level = 1;
    d = vm.display();
    expect(d.level).toBe(1);
    expect(d.modes[unit('cardiovascular.heart.right_ventricle')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('cardiovascular.aorta')]).toBe(MODE_HIDDEN);
    vm.level = 2;
    expect(vm.display().modes[unit('cardiovascular.aorta')]).toBe(MODE_OPAQUE);
    vm.level = 3;
    expect(vm.display().modes[unit('integument.skin_of_trunk')]).toBe(MODE_OPAQUE);
    // Transparency: everything that is not selected turns translucent.
    vm.transparency = 0.6;
    d = vm.display();
    expect(d.modes[unit(lv)]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('integument.skin_of_trunk')]).toBe(MODE_GHOST);
    expect(d.ghostCount).toBe(d.visibleCount - 1);
    // Level 0: only the selection, plus what the eye shows meanwhile.
    vm.level = 0;
    vm.placeExplicitly([unit('skeletal.sternum')], true);
    d = vm.display();
    expect([...d.visibleUnits].sort()).toEqual([unit(lv), unit('skeletal.sternum')].sort());
    expect(d.modes[unit('skeletal.sternum')]).toBe(MODE_GHOST);
    // Isolation still restricts what is shown.
    vm.isolate = catalog.index.expand([lv], 'all').units;
    expect(vm.display().modes[unit('skeletal.sternum')]).toBe(MODE_HIDDEN);
    vm.isolate = null;
    // Back to automatic: what is placed is shown again, including what the eye showed.
    vm.automaticLevel();
    d = vm.display();
    expect(vm.level).toBeNull();
    expect(d.modes[unit('skeletal.sternum')]).toBe(MODE_GHOST);
    expect(d.modes[unit('cardiovascular.aorta')]).toBe(MODE_HIDDEN);
    // Without a selection everything shown is translucent.
    vm.select([], 'replace');
    expect(vm.display().modes[unit('skeletal.sternum')]).toBe(MODE_GHOST);
  });

  it('derives the level from what is visible until a level is chosen', async () => {
    const catalog = await loadFixtureCatalog();
    const index = catalog.index;
    const vm = new ViewModel(index);
    vm.scene = index.allDefaultUnits();
    vm.select(['cardiovascular.heart'], 'replace');
    // The heart's levels: the cardiovascular system, the whole body.
    expect(vm.display().level).toBe(2);
    for (const u of index.expand(['integument', 'skeletal', 'respiratory', 'nervous'], 'all').units) vm.hidden.add(u);
    expect(vm.display().level).toBe(1);
    for (const u of index.expand(['cardiovascular.aorta'], 'all').units) vm.hidden.add(u);
    expect(vm.display().level).toBe(0);
    vm.select([], 'replace');
    expect(vm.display().level).toBeNull();
  });

  it('builds the levels from every selected structure and keeps a chosen level for the next selections', async () => {
    const catalog = await loadFixtureCatalog();
    const index = catalog.index;
    const vm = new ViewModel(index);
    const unit = (id: string) => catalog.get(id)!.index;
    const lv = 'cardiovascular.heart.left_ventricle';
    const groups = () => vm.levels().map((l) => l.groups);
    vm.level = 2;
    // Nothing selected: no levels, the placed scene is shown.
    vm.scene = new Set(index.expand(['skeletal.femur_l'], 'default').units);
    expect(groups()).toEqual([]);
    expect(vm.explicitLevel).toBeNull();
    expect(vm.display().modes[unit('skeletal.femur_l')]).toBe(MODE_OPAQUE);
    // Level k joins the k-th group of each selected structure; shorter ladders keep their top group.
    vm.select([lv, 'skeletal.femur_l'], 'replace');
    const femurLadder = index.surroundingsLadder(index.get('skeletal.femur_l')!).map((l) => l.id).filter((id) => id !== null);
    expect(groups()[0]).toEqual(['cardiovascular.heart', femurLadder[0]]);
    expect(groups()[1]).toEqual(['cardiovascular', femurLadder[Math.min(1, femurLadder.length - 1)]]);
    expect(groups().at(-1)).toBeNull();
    expect(vm.explicitLevel).toBe(2);
    let d = vm.display();
    expect(d.modes[unit('cardiovascular.aorta')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit(lv)]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('skeletal.femur_l')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('respiratory.lung_r')]).toBe(MODE_HIDDEN);
    // The chosen level is kept and clamped to the ladder of a new selection.
    vm.select(['cardiovascular.heart'], 'replace');
    expect(groups()).toEqual([['cardiovascular'], null]);
    expect(vm.explicitLevel).toBe(2);
    vm.level = 5;
    expect(vm.explicitLevel).toBe(2);
    d = vm.display();
    expect(d.level).toBe(2);
    expect(d.modes[unit('integument.skin_of_trunk')]).toBe(MODE_OPAQUE);
  });

  it('a chosen level decides what is shown even when the whole body is placed; a link keeps the placed scene', async () => {
    const catalog = await loadFixtureCatalog();
    const index = catalog.index;
    const vm = new ViewModel(index);
    const unit = (id: string) => catalog.get(id)!.index;
    vm.scene = index.allDefaultUnits();
    for (const u of index.expand(['skeletal.skull'], 'all').units) vm.hidden.add(u);
    vm.select(['cardiovascular.heart'], 'replace');
    vm.level = 1;
    // Level 1 of the heart is the cardiovascular system: the rest of the placed body is not shown.
    let d = vm.display();
    expect(d.modes[unit('cardiovascular.heart.left_ventricle')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('cardiovascular.aorta')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('skeletal.femur_l')]).toBe(MODE_HIDDEN);
    expect(d.modes[unit('integument.skin_of_trunk')]).toBe(MODE_HIDDEN);
    // The whole-body level shows the body again (hidden structures stay hidden).
    vm.level = 2;
    d = vm.display();
    expect(d.modes[unit('skeletal.femur_l')]).toBe(MODE_OPAQUE);
    expect(d.modes[unit('skeletal.skull')]).toBe(MODE_HIDDEN);
    // A link keeps the placed scene and what is hidden in it even while the level does not show it.
    vm.level = 1;
    const state = vm.toState({ model: 'fixture', version: '1.0.0' }, {});
    expect(state.scene).toEqual(['integument', 'skeletal', 'cardiovascular', 'respiratory', 'nervous']);
    expect(state.hidden).toEqual(['skeletal.skull']);
    expect(state.surroundings).toEqual({ level: 1 });
    // Without a selection the placed scene is shown.
    vm.select([], 'replace');
    expect(vm.display().modes[unit('skeletal.femur_l')]).toBe(MODE_OPAQUE);
  });

  it('deselecting never takes anything off the scene; a chosen level decides what of it is shown', async () => {
    const catalog = await loadFixtureCatalog();
    const index = catalog.index;
    const vm = new ViewModel(index);
    const shown = () => [...vm.display().visibleUnits].map((u) => index.structures[u]!.id).sort();
    // What the viewer does for a tree row or a search result.
    const pick = (id: string) => {
      vm.placeExplicitly(index.subtreeUnits(index.get(id)!, 'default'), false);
      vm.select([id], 'add');
    };
    const lv = 'cardiovascular.heart.left_ventricle';
    const rv = 'cardiovascular.heart.right_ventricle';
    // The heart, then a lung, then "Clear selection": both stay.
    pick('cardiovascular.heart');
    pick('respiratory.lung_r');
    expect(shown()).toEqual([lv, rv, 'respiratory.lung_r']);
    vm.select([], 'replace');
    expect(shown()).toEqual([lv, rv, 'respiratory.lung_r']);
    // An organ, then one of its parts, then deselecting the part: the organ stays.
    vm.clear();
    pick('cardiovascular.heart');
    vm.select([lv], 'toggle');
    expect(vm.selected).toEqual([lv]);
    vm.select([lv], 'toggle');
    expect(vm.selected).toEqual([]);
    expect(shown()).toEqual([lv, rv]);
    // A chosen level shows the selection with its surroundings; the rest of the scene comes back
    // with the automatic level.
    pick('cardiovascular');
    pick('respiratory.lung_r');
    vm.select([lv], 'replace');
    vm.level = 1;
    expect(shown()).toEqual([lv, rv]);
    vm.select([], 'replace');
    expect(shown()).toEqual(['cardiovascular.aorta', lv, rv, 'respiratory.lung_r']);
    vm.automaticLevel();
    expect(shown()).toEqual(['cardiovascular.aorta', lv, rv, 'respiratory.lung_r']);
    // A link keeps the scene.
    expect(vm.toState({ model: 'fixture', version: '1.0.0' }, {}).scene).toEqual(['cardiovascular', 'respiratory.lung_r']);
  });

  it('never selects a structure together with its ancestors or descendants', async () => {
    const catalog = await loadFixtureCatalog();
    const vm = new ViewModel(catalog.index);
    const lv = 'cardiovascular.heart.left_ventricle';
    const rv = 'cardiovascular.heart.right_ventricle';
    vm.select([lv, rv, 'skeletal.femur_l'], 'replace');
    expect(vm.selected).toEqual([lv, rv, 'skeletal.femur_l']);
    // Selecting the parent drops its parts; selecting a part drops the parent.
    vm.select(['cardiovascular.heart'], 'toggle');
    expect(vm.selected).toEqual(['skeletal.femur_l', 'cardiovascular.heart']);
    vm.select([lv], 'add');
    expect(vm.selected).toEqual(['skeletal.femur_l', lv]);
    vm.select(['cardiovascular'], 'toggle');
    expect(vm.selected).toEqual(['skeletal.femur_l', 'cardiovascular']);
    // Within one list the later reference wins; aliases are resolved first.
    vm.select(['cardiovascular.cor', lv], 'replace');
    expect(vm.selected).toEqual([lv]);
    // Links made before the rule are normalised the same way.
    vm.applyState({
      v: 2,
      data: { model: 'fixture', version: '1.0.0' },
      scene: [],
      selected: [lv, 'cardiovascular.heart', 'skeletal.femur_l'],
    });
    expect(vm.selected).toEqual(['cardiovascular.heart', 'skeletal.femur_l']);
  });

  it('serialises and re-applies a state without changing the logical view', async () => {
    const catalog = await loadFixtureCatalog();
    const vm = new ViewModel(catalog.index);
    vm.scene = catalog.index.allDefaultUnits();
    for (const u of catalog.index.expand(['integument', 'respiratory.lung_l'], 'all').units) vm.hidden.add(u);
    vm.hidden.delete(catalog.get('respiratory.lung_l.upper_part')!.index);
    vm.isolate = null;
    vm.select(['cardiovascular.cor', 'skeletal.femur_l'], 'replace');
    vm.level = 1;
    vm.extra = catalog.index.expand(['respiratory.lung_r'], 'default').units;
    vm.transparency = 0.6;
    const data = { model: 'fixture', version: '1.0.0' };
    const state = vm.toState(data, { lang: 'la' });
    expect(state.v).toBe(2);
    expect(state.selected).toEqual(['cardiovascular.heart', 'skeletal.femur_l']);
    expect(state.surroundings).toEqual({ level: 1, extra: ['respiratory.lung_r'], transparency: 0.6 });
    const other = new ViewModel(catalog.index);
    expect(other.applyState(state).unknown).toEqual([]);
    expect(other.toState(data, { lang: 'la' })).toEqual(state);
    expect(other.display().modes).toEqual(vm.display().modes);
  });

  it('reports unknown references from a state instead of dropping them silently', async () => {
    const catalog = await loadFixtureCatalog();
    const vm = new ViewModel(catalog.index);
    const { unknown } = vm.applyState({
      v: 2,
      data: { model: 'fixture', version: '1.0.0' },
      scene: ['cardiovascular.heart', 'cardiovascular.unicorn'],
      selected: ['skeletal.imaginary_bone'],
    });
    expect(unknown.sort()).toEqual(['cardiovascular.unicorn', 'skeletal.imaginary_bone']);
  });
});

describe('names and search', () => {
  it('shows unreviewed Ukrainian names with their status, English only when there is no Ukrainian name', async () => {
    const catalog = await loadFixtureCatalog();
    expect(catalog.names.display('cardiovascular.heart', 'uk')).toMatchObject({ text: 'Серце', lang: 'uk', fallback: false, status: 'reviewed' });
    // A translation draft is shown with its status and origin, so the UI can mark it.
    expect(catalog.names.display('skeletal.femur_l', 'uk')).toMatchObject({
      text: 'Стегнова кістка',
      lang: 'uk',
      fallback: false,
      status: 'unreviewed',
      origin: 'draft',
    });
    // No Ukrainian name at all: English with its language (not Latin).
    expect(catalog.names.display('respiratory.lung_l.upper_part', 'uk')).toMatchObject({ lang: 'en', fallback: true });
    // The strict policy shows only reviewed Ukrainian names.
    const strict = await loadFixtureCatalog(undefined, undefined, { names: { ukrainian: 'reviewed' } });
    expect(strict.names.display('skeletal.femur_l', 'uk')).toMatchObject({ text: 'Femur', lang: 'en', fallback: true });
    expect(strict.names.display('cardiovascular.heart', 'uk')).toMatchObject({ text: 'Серце', lang: 'uk' });
    // Latin falls back to English too; English is the default and complete.
    expect(catalog.names.display('respiratory.lung_l.upper_part', 'la')).toMatchObject({ lang: 'en', fallback: true });
    expect(catalog.names.display('cardiovascular.heart', 'en')).toMatchObject({ text: 'Heart', lang: 'en', fallback: false });
  });

  it('normalises case, diacritics and apostrophes', () => {
    expect(normalizeSearchText('Шлуночо́к')).toBe('шлуночок');
    expect(normalizeSearchText('М’ЯЗ')).toBe(normalizeSearchText("м'яз"));
    expect(normalizeSearchText('Ventrículus  sinister')).toBe('ventriculus sinister');
    expect(normalizeSearchText('Її')).toBe('іі');
  });

  it('finds structures by any name, synonym or word prefix before geometry is loaded', async () => {
    const catalog = await loadFixtureCatalog();
    const first = (q: string, lang: 'uk' | 'la' | 'en' = 'uk') => catalog.search.search(q, { lang })[0]?.id;
    expect(first('серце')).toBe('cardiovascular.heart');
    expect(first('cor')).toBe('cardiovascular.heart');
    expect(first('LV')).toBe('cardiovascular.heart.left_ventricle');
    expect(first('лш')).toBe('cardiovascular.heart.left_ventricle');
    expect(first('ventric sin')).toBe('cardiovascular.heart.left_ventricle');
    expect(first('шлуноч')).toMatch(/cardiovascular\.heart\.(left|right)_ventricle/);
    expect(catalog.search.search('zzzz', { lang: 'uk' })).toEqual([]);
  });

  it('ranks a muscle above its attachment patches and shows Ukrainian drafts in the real data', async () => {
    const catalog = await loadReleaseCatalog();
    for (const [query, lang] of [['двоголовий', 'uk'], ['biceps', 'en']] as const) {
      const [first] = catalog.search.search(query, { lang });
      expect(catalog.get(first!.id)!.system).toBe('muscular');
    }
    const heart = catalog.search.search('серце', { lang: 'uk' })[0]!;
    expect(catalog.names.display(heart.id, 'uk')).toMatchObject({ text: 'Серце', lang: 'uk', origin: 'draft', status: 'unreviewed' });
  });

  it('keeps structures with identical names apart (selection is bound to IDs)', async () => {
    const catalog = await loadFixtureCatalog();
    const ids = catalog.search.search('femur', { lang: 'la' }).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['skeletal.femur_l', 'skeletal.femur_r']));
  });
});
