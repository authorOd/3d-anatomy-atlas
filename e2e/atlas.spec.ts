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
import { expect, test } from '@playwright/test';
import { atlas, expectBrandVisible, instrumentContexts, openAtlas, openSettings, pointOf, track, waitIdle } from './helpers.js';

const LV = 'cardiovascular.heart.left_ventricle';
const RV = 'cardiovascular.heart.right_ventricle';

test.describe('start and loading', () => {
  test('S0: empty start shows search, tree and "load all" without requesting geometry', async ({ page }) => {
    const t = track(page);
    const ready: string[] = [];
    await page.exposeFunction('__ready', (kind: string) => ready.push(kind));
    await page.addInitScript(() => {
      document.addEventListener('anatomy:ready', (e) => (window as unknown as { __ready(k: string): void }).__ready((e as CustomEvent).detail.kind));
    });
    await openAtlas(page);
    await expect(page.getByRole('combobox', { name: /Пошук/ })).toBeVisible();
    await expect(page.getByRole('tree', { name: 'Системи та структури' })).toBeVisible();
    await expect(page.locator('svitylo-anatomy .card .load-all')).toBeVisible();
    await page.waitForTimeout(500);
    expect(t.glb).toEqual([]);
    expect(ready).toContain('ui');
    await expectBrandVisible(page);
  });

  test('English is the default for the interface and the names; systems start collapsed', async ({ page }) => {
    await openAtlas(page, '?data=fixture', '', { uk: false });
    await expect(page.getByRole('combobox', { name: /Search/ })).toBeVisible();
    await expect(page.locator('svitylo-anatomy .card .load-all')).toContainText('Load everything');
    const tree = page.getByRole('tree', { name: 'Systems and structures' });
    await expect(tree.getByRole('treeitem', { name: 'Cardiovascular system', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(tree.getByRole('treeitem', { name: 'Heart', exact: true })).toHaveCount(0);
    expect(await atlas(page, 'return v.lang;')).toBe('en');
    // Selecting reveals the branch in the tree.
    await atlas(page, `await v.showStructure('${LV}');`);
    await expect(tree.getByRole('treeitem', { name: 'Left ventricle', exact: true })).toHaveAttribute('aria-selected', 'true');
    // Unreviewed Ukrainian names are shown with their status (the interface marks them).
    expect(await atlas(page, "return v.catalog.names.display('skeletal.femur_l', 'uk');")).toMatchObject({
      text: 'Стегнова кістка',
      lang: 'uk',
      status: 'unreviewed',
    });
    // The data notice sits at the foot of the side column, not over the scene.
    await expect(page.locator('svitylo-anatomy aside.panel .panel-notice')).toContainText('anatomical review');
    await expect(page.locator('svitylo-anatomy .scene-controls')).not.toContainText('anatomical review');
  });

  test('the language control switches the interface too; Latin is a separate switch shown under the names', async ({ page }) => {
    await openAtlas(page, '?data=fixture', '', { uk: false });
    await openSettings(page, 'Settings');
    const lang = page.locator('svitylo-anatomy select.lang');
    await lang.selectOption('uk');
    await expect(page.getByRole('combobox', { name: /Пошук/ })).toBeVisible();
    const tree = page.getByRole('tree', { name: 'Системи та структури' });
    await expect(tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true })).toBeVisible();
    expect(await atlas(page, 'return v.lang;')).toBe('uk');
    // Unreviewed translations: a dotted underline and a legend, no hover tooltip — the word "draft" is never shown.
    const skeletal = tree.getByRole('treeitem', { name: 'Скелетна система', exact: true });
    await skeletal.getByRole('button', { name: 'Розгорнути' }).click();
    const draft = tree.getByRole('treeitem', { name: 'Хребтовий стовп (переклад не перевірено)' });
    await expect(draft.locator('.unverified')).toBeVisible();
    await expect(draft.locator('.unverified')).not.toHaveAttribute('title');
    await expect(page.locator('svitylo-anatomy .panel-notice .legend')).toContainText('переклад ще не перевірено фахівцем');
    await expect(page.locator('svitylo-anatomy')).not.toContainText(/чернетк/i);

    // Latin is not a language of the control: the switch adds the Latin name under each name.
    await openSettings(page);
    await expect(lang.locator('option')).toHaveText(['Українська', 'English']);
    const latin = page.locator('svitylo-anatomy').getByRole('switch', { name: 'Показувати латину' });
    const cardiovascularRow = tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true });
    const oneLine = (await cardiovascularRow.boundingBox())!.height;
    await latin.check();
    const cardiovascular = tree.getByRole('treeitem', { name: 'Серцево-судинна система, Systema cardiovasculare', exact: true });
    await expect(cardiovascular.locator('.latin')).toHaveText('Systema cardiovasculare');
    // With Latin every row has two lines: the name, then the Latin name.
    const rows = await cardiovascular.locator('.name, .latin').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(rows[1]!).toBeGreaterThan(rows[0]!);
    expect((await cardiovascular.boundingBox())!.height).toBeGreaterThan(oneLine + 8);
    expect(await atlas(page, 'return [v.lang, v.latin, v.getState().latin];')).toEqual(['uk', true, true]);
    await expect(page.getByRole('combobox', { name: /Пошук/ })).toBeVisible();
    await latin.uncheck();
    await expect(tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true })).toBeVisible();
    expect(await atlas(page, 'return v.getState().latin ?? false;')).toBe(false);
    // An older link with Latin as the language: the interface language plus Latin alongside.
    await atlas(page, "await v.setState({ ...v.getState(), lang: 'la' });");
    await expect(latin).toBeChecked();
    expect(await atlas(page, 'return [v.lang, v.latin];')).toEqual(['uk', true]);
    await latin.uncheck();

    await openSettings(page);
    await lang.selectOption('en');
    await expect(page.getByRole('tree', { name: 'Systems and structures' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Search/ })).toBeVisible();
    expect(await atlas(page, 'return v.lang;')).toBe('en');
  });

  test('"load all" shows progress, loads every file once and ends with the skin outside', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    await page.route('**/*.glb', async (route) => {
      await new Promise((r) => setTimeout(r, 120));
      await route.continue();
    });
    await page.locator('svitylo-anatomy .card .load-all').click();
    await expect(page.locator('svitylo-anatomy [role=progressbar]')).toBeVisible();
    await waitIdle(page);
    const state = await atlas<{ scene: string[] }>(page, 'return v.getState();');
    expect(state.scene).toEqual(['integument', 'skeletal', 'cardiovascular', 'respiratory', 'nervous']);
    expect(new Set(t.glb).size).toBe(t.glb.length);
    expect(t.glb.every((p) => p.includes('/standard/'))).toBe(true);
    // Every chunk of the default body (optional subdivisions such as lung segments stay unloaded).
    const expected = await atlas<number>(page, 'return v.catalog.index.chunksFor(v.catalog.index.allDefaultUnits()).size;');
    expect(expected).toBe(10);
    expect(t.glb.length).toBe(expected);
    expect(t.glb.some((p) => p.includes('lung_l_upper_part'))).toBe(false);
    // The skin (outer layer) has priority: its files are requested first.
    expect(t.glb[0]).toContain('/standard/integument/');
    await expect(page.locator('svitylo-anatomy .card .load-all')).toBeHidden();
    await expectBrandVisible(page);
  });

  test('cancelling "load all" stops requests and is not reported as a data error', async ({ page }) => {
    await openAtlas(page);
    await page.route('**/*.glb', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => undefined);
    });
    await page.locator('svitylo-anatomy .card .load-all').click();
    const cancel = page.locator('svitylo-anatomy aside.panel').getByRole('button', { name: 'Скасувати', exact: true });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(page.getByText('Завантаження скасовано')).toBeVisible();
    await expect(page.locator('svitylo-anatomy .banner[data-kind=error]')).toHaveCount(0);
    const stats = await atlas<{ loadingChunks: number; queuedChunks: number; failedChunks: number }>(page, 'return v.getResourceStats();');
    expect(stats).toMatchObject({ loadingChunks: 0, queuedChunks: 0, failedChunks: 0 });
    // "Continue" loads the rest of what was cancelled.
    await page.unroute('**/*.glb');
    await page.getByRole('button', { name: 'Продовжити' }).click();
    await waitIdle(page);
    expect((await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene).toEqual(['integument', 'skeletal', 'cardiovascular', 'respiratory', 'nervous']);
  });

  test('cancelling at a chosen level steps down to what is loaded; "Continue" goes back up', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}');`);
    await waitIdle(page);
    const stepper = page.getByRole('group', { name: 'Рівень оточення' });
    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await expect(stepper).toContainText('Рівень оточення 1 із 3');
    await page.route('**/*.glb', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => undefined);
    });
    // Up to the whole body, then cancel while its files load.
    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await expect(stepper).toContainText('Рівень оточення 3 із 3');
    const cancel = page.locator('svitylo-anatomy aside.panel').getByRole('button', { name: 'Скасувати', exact: true });
    await cancel.click();
    await expect(page.getByText('Завантаження скасовано')).toBeVisible();
    // Level 2 is loaded already (in the fixture the aorta shares its file with the right ventricle).
    await expect(stepper).toContainText('Рівень оточення 2 із 3');
    // Nothing is requested again.
    await page.waitForTimeout(300);
    const stats = await atlas<{ loadingChunks: number; queuedChunks: number }>(page, 'return v.getResourceStats();');
    expect(stats).toMatchObject({ loadingChunks: 0, queuedChunks: 0 });
    await page.unroute('**/*.glb');
    await page.getByRole('button', { name: 'Продовжити' }).click();
    await waitIdle(page);
    await expect(stepper).toContainText('Рівень оточення 3 із 3');
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('opaque');
  });

  test('a failed file shows an error with retry; retry does not reload files that are ready', async ({ page }) => {
    const t = track(page);
    let failing = true;
    await openAtlas(page);
    await page.route('**/standard/cardiovascular/heart_left_ventricle.glb', (route) =>
      failing ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue(),
    );
    await atlas(page, "await v.showStructure('cardiovascular.heart');");
    await expect(page.getByText('Файл моделі недоступний')).toBeVisible();
    const before = t.glb.length;
    failing = false;
    await page.getByRole('button', { name: 'Повторити' }).first().click();
    await waitIdle(page);
    expect(t.glb.slice(before)).toEqual(['/test-data/1.0.0/standard/cardiovascular/heart_left_ventricle.glb']);
    expect(await atlas(page, "return v.loadStateOf('cardiovascular.heart');")).toBe('ready');
  });
});

test.describe('selection, context and isolation', () => {
  test('a search result is selected like a click: only its files load, the field clears, the camera zooms in', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    const search = page.getByRole('combobox', { name: /Пошук/ });
    await search.fill('серце');
    await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Серце');
    const before = await atlas<number[]>(page, 'return v.getState().camera.position;');
    await search.press('Enter');
    await expect(search).toHaveValue('');
    await expect(page.getByRole('listbox')).toBeHidden();
    await waitIdle(page);
    expect(t.glb.sort()).toEqual([
      '/test-data/1.0.0/standard/cardiovascular/heart_left_ventricle.glb',
      '/test-data/1.0.0/standard/cardiovascular/heart_right_ventricle--aorta.glb',
    ]);
    const state = await atlas<{ scene: string[]; selected: string[]; isolate?: string[] }>(page, 'return v.getState();');
    expect(state.scene).toEqual(['cardiovascular.heart']);
    expect(state.selected).toEqual(['cardiovascular.heart']);
    expect(state.isolate).toBeUndefined();
    expect(await atlas<number[]>(page, 'return v.getState().camera.position;')).not.toEqual(before);
    const info = page.locator('svitylo-anatomy svitylo-anatomy-info');
    await expect(info.getByRole('heading', { name: 'Серце' })).toBeVisible();
    await expect(info).toContainText('Cor');
    await expect(page.getByRole('treeitem', { selected: true })).toContainText('Серце');
    // Another result is added to the selection (nothing is replaced); picking a selected one keeps it.
    const pick = async (query: string, name: string) => {
      await search.fill(query);
      await expect(page.getByRole('listbox').getByRole('option').first()).toContainText(name);
      await search.press('Enter');
    };
    await pick('аорта', 'Аорта');
    await waitIdle(page);
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.heart', 'cardiovascular.aorta']);
    await pick('серце', 'Серце');
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.aorta', 'cardiovascular.heart']);
  });

  test('the tree selects like a click on the model; deselecting right after a zoom brings the camera back', async ({ page }) => {
    await openAtlas(page);
    const tree = page.locator('svitylo-anatomy aside.panel');
    await tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).click();
    const heart = tree.getByRole('treeitem', { name: 'Серце', exact: true });
    const aorta = tree.getByRole('treeitem', { name: 'Аорта', exact: true });
    const camera = () => atlas<{ position: number[]; target: number[] }>(page, 'return v.getState().camera;');
    const settled = () => expect.poll(() => atlas(page, 'return v.renderer.rig.isAnimating;')).toBe(false);
    await heart.click();
    await waitIdle(page);
    await settled();
    expect((await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene).toEqual(['cardiovascular.heart']);
    const onHeart = await camera();
    // A second row is added to the selection and to the scene; the camera zooms to it.
    await aorta.click();
    await waitIdle(page);
    await settled();
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.heart', 'cardiovascular.aorta']);
    expect((await camera()).target).not.toEqual(onHeart.target);
    // Deselecting it right away (the row again) returns the camera to the heart.
    await aorta.click();
    await settled();
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.heart']);
    const back = await camera();
    for (let i = 0; i < 3; i++) {
      expect(back.position[i]).toBeCloseTo(onHeart.position[i]!, 3);
      expect(back.target[i]).toBeCloseTo(onHeart.target[i]!, 3);
    }
    // After the camera was moved by hand, deselecting leaves it where it is.
    await aorta.click();
    await waitIdle(page);
    await settled();
    await atlas(page, 'v.orbit(0.3, 0);');
    const moved = await camera();
    await aorta.click();
    await page.waitForTimeout(600);
    expect(await camera()).toEqual(moved);
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.heart']);
  });

  test('a structure covered by others turns the transparency on when selected from the tree', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, 'await v.loadAll();');
    await waitIdle(page);
    const tree = page.locator('svitylo-anatomy aside.panel');
    const slider = page.getByRole('toolbar', { name: 'Камера' }).getByRole('slider', { name: 'Прозорість оточення' });
    await expect(slider).toHaveValue('0');
    await tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).click();
    await tree.getByRole('treeitem', { name: 'Серце', exact: true }).click();
    await expect.poll(() => atlas(page, 'return v.transparency;')).toBe(0.78);
    await expect(slider).toHaveValue('0.78');
    // The level shows what is visible: the whole body is loaded, so it is the whole-body level.
    const stepper = page.getByRole('group', { name: 'Рівень оточення' });
    await expect(stepper).toContainText('Рівень оточення 2 із 2');
    await expect(stepper).toContainText('Усе тіло');
    expect(await atlas(page, 'return v.surroundings.explicit;')).toBe(false);
    const shown = () => atlas<string[]>(page, "return ['cardiovascular.heart', 'cardiovascular.aorta', 'integument.skin_of_trunk', 'skeletal.femur_l'].map((id) => v.displayOf(id));");
    expect(await shown()).toEqual(['opaque', 'ghost', 'ghost', 'ghost']);
    // A chosen level decides what is shown, although the whole body is loaded: level 1 of the
    // heart is the cardiovascular system.
    await stepper.getByRole('button', { name: 'Менше оточення' }).click();
    await expect(stepper).toContainText('Рівень оточення 1 із 2');
    await expect(stepper).toContainText('Серцево-судинна система');
    expect(await shown()).toEqual(['opaque', 'ghost', 'absent', 'absent']);
    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    expect(await shown()).toEqual(['opaque', 'ghost', 'ghost', 'ghost']);
    // The slider at its left end makes everything opaque again.
    await slider.fill('0');
    expect(await shown()).toEqual(['opaque', 'opaque', 'opaque', 'opaque']);
    // A structure that is not covered leaves the transparency as it is.
    await page.getByRole('button', { name: 'Скасувати вибір' }).click();
    await tree.getByRole('treeitem', { name: 'Покривна система', exact: true }).click();
    await waitIdle(page);
    await page.waitForTimeout(300);
    expect(await atlas(page, 'return v.transparency;')).toBe(0);
  });

  test('the surroundings level goes from the selection alone up to the whole body; the transparency is a slider', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}');`);
    await waitIdle(page);
    // The level is in the selection block and shows what is visible: only the selection.
    const stepper = page.getByRole('group', { name: 'Рівень оточення' });
    await expect(stepper).toContainText('Рівень оточення 0 із 3');
    await expect(stepper).toContainText('Лише вибране');
    await expect(stepper.getByRole('button', { name: 'Менше оточення' })).toBeDisabled();
    // The transparency slider is on the camera bar; moving it keeps the camera.
    const slider = page.getByRole('toolbar', { name: 'Камера' }).getByRole('slider', { name: 'Прозорість оточення' });
    const camera = await atlas(page, 'return v.getState().camera;');
    await slider.fill('0.6');
    await expect(page.locator('svitylo-anatomy .pill .transparency-value')).toHaveText('60%');
    expect(await atlas(page, 'return v.getState().camera;')).toEqual(camera);
    expect((await atlas<{ surroundings: unknown }>(page, 'return v.getState();')).surroundings).toEqual({ transparency: 0.6 });

    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await expect(stepper).toContainText('Рівень оточення 1 із 3');
    await expect(stepper).toContainText('Серце');
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('opaque');
    expect(await atlas(page, `return v.displayOf('${RV}');`)).toBe('ghost');
    expect(await atlas(page, "return v.displayOf('cardiovascular.aorta');")).toBe('absent');
    // Level 1 needs only the heart's files.
    expect(t.glb.every((p) => p.includes('/cardiovascular/heart_'))).toBe(true);

    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await expect(stepper).toContainText('Рівень оточення 2 із 3');
    expect(await atlas(page, "return v.displayOf('cardiovascular.aorta');")).toBe('ghost');
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('absent');

    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await expect(stepper).toContainText('Рівень оточення 3 із 3');
    await expect(stepper).toContainText('Усе тіло');
    await expect(stepper.getByRole('button', { name: 'Більше оточення' })).toBeDisabled();
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('ghost');
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('opaque');

    // "Isolate" (whole selection) removes the surroundings; ending it brings them back.
    const isolate = page.getByRole('group', { name: 'Усе вибране' }).getByRole('button', { name: 'Ізолювати' });
    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'true');
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('hidden');
    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'false');
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('ghost');
    await stepper.getByRole('button', { name: 'Менше оточення' }).click();
    await stepper.getByRole('button', { name: 'Менше оточення' }).click();
    await expect(stepper).toContainText('Рівень оточення 1 із 3');
    expect(await atlas(page, "return v.displayOf('integument.skin_of_trunk');")).toBe('absent');

    // The level belongs to the whole selection: the cards have no control of their own.
    await expect(page.locator('svitylo-anatomy svitylo-anatomy-info').getByRole('button', { name: /оточенн|в тілі/ })).toHaveCount(0);
    // Without a selection the level waits for one; everything shown is translucent.
    await page.getByRole('button', { name: 'Скасувати вибір' }).click();
    await expect(stepper).toContainText('Спершу виберіть структуру');
    await expect(stepper.getByRole('button', { name: 'Більше оточення' })).toBeDisabled();
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('ghost');
    expect(await atlas(page, 'return v.surroundings.level;')).toBeNull();
    expect((await atlas<{ surroundings?: unknown }>(page, 'return v.getState();')).surroundings).toEqual({ level: 1, transparency: 0.6 });
    await slider.fill('0');
    expect((await atlas<{ surroundings?: unknown }>(page, 'return v.getState();')).surroundings).toEqual({ level: 1 });
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('opaque');
  });

  test('deselecting keeps the scene; the chosen level shows the next selection', async ({ page }) => {
    await openAtlas(page);
    const tree = page.locator('svitylo-anatomy aside.panel');
    const empty = page.locator('svitylo-anatomy').getByText('Модель ще не завантажена');
    await expect(empty).toBeVisible();
    await tree.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).click();
    await tree.getByRole('treeitem', { name: 'Дихальна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).click();
    // Structures with geometry that are drawn (a lung with a hidden alternative part is 'mixed').
    const visible = () =>
      atlas<string[]>(page, "return v.catalog.index.units.map((u) => v.catalog.index.structures[u].id).filter((id) => ['opaque', 'ghost', 'mixed'].includes(v.displayOf(id)));");
    const selection = () => atlas<string[]>(page, 'return v.selection;');
    // The heart, then one of its parts: deselecting the part keeps the heart on the scene.
    const heartRow = tree.getByRole('treeitem', { name: 'Серце', exact: true });
    await heartRow.click();
    await waitIdle(page);
    await heartRow.getByRole('button', { name: 'Розгорнути' }).click();
    const lvRow = tree.getByRole('treeitem', { name: /^Лівий шлуночок/ });
    await lvRow.click();
    await waitIdle(page);
    await expect.poll(selection).toEqual([LV]);
    await lvRow.click();
    await expect.poll(selection).toEqual([]);
    expect(await visible()).toEqual([LV, RV]);
    await expect(empty).toBeHidden();
    // The heart with its level 1 (the cardiovascular system), then a lung.
    await heartRow.click();
    await waitIdle(page);
    const stepper = page.getByRole('group', { name: 'Рівень оточення' });
    await stepper.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await tree.getByRole('treeitem', { name: /^Права легеня/ }).click();
    await waitIdle(page);
    // Level 1 of the selection joins the systems of both.
    expect(await visible()).toEqual([LV, RV, 'cardiovascular.aorta', 'respiratory.lung_l', 'respiratory.lung_r']);
    // "Clear selection" keeps what the selection placed on the scene; the surroundings of the level go.
    await page.getByRole('button', { name: 'Скасувати вибір' }).click();
    await expect.poll(visible).toEqual([LV, RV, 'respiratory.lung_r']);
    // A ventricle then: it and its level 1 (the heart); the lung stays on the scene, but the level
    // does not show it.
    await lvRow.click();
    await waitIdle(page);
    expect(await visible()).toEqual([LV, RV]);
    await expect(stepper).toContainText('Рівень оточення 1 із 3');
    await expect(stepper).toContainText('Серце');
    // What the eye shows is shown too; Escape clears the selection, and the whole scene is back.
    await tree.getByRole('treeitem', { name: 'Скелетна система', exact: true }).getByRole('button', { name: 'Показати' }).click();
    await waitIdle(page);
    await page.locator('svitylo-anatomy .viewport').focus();
    await page.keyboard.press('Escape');
    await expect.poll(selection).toEqual([]);
    await expect.poll(async () => (await visible()).filter((id) => !id.startsWith('skeletal.'))).toEqual([LV, RV, 'respiratory.lung_r']);
    expect((await visible()).some((id) => id.startsWith('skeletal.'))).toBe(true);
    await expect(empty).toBeHidden();
  });

  test('the whole-selection tools keep their layout when the level or the transparency changes', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}');`);
    await waitIdle(page);
    const tools = page.locator('svitylo-anatomy .selection-tools');
    const positions = () =>
      tools.locator('.btn').evaluateAll((buttons) => buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width)];
      }));
    const before = await positions();
    await page.getByRole('slider', { name: 'Прозорість оточення' }).fill('0.5');
    expect(await positions()).toEqual(before);
    await tools.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    await tools.getByRole('button', { name: 'Більше оточення' }).click();
    await waitIdle(page);
    expect(await positions()).toEqual(before);
    await tools.getByRole('group', { name: 'Усе вибране' }).getByRole('button', { name: 'Ізолювати' }).click();
    expect(await positions()).toEqual(before);
  });

  test('a click toggles a structure in the selection; cards stack; the level and the transparency stay', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}'); await v.showSurroundings();`);
    await waitIdle(page);
    expect(await atlas(page, 'return [v.surroundings.level, v.transparency];')).toEqual([1, 0.78]);
    await atlas(page, "v.setView('anterior', { animate: false }); v.renderer.renderNow();");
    const rv = await pointOf(page, RV);
    expect(rv).not.toBeNull();
    const camera = await atlas(page, 'return v.getState().camera;');

    // A translucent neighbour becomes selected (opaque) and gets its own card on top.
    await page.mouse.click(rv!.x, rv!.y);
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([LV, RV]);
    expect(await atlas(page, `return v.displayOf('${RV}');`)).toBe('opaque');
    expect(await atlas(page, 'return v.getState().camera;')).toEqual(camera);
    const cards = page.locator('svitylo-anatomy aside.info svitylo-anatomy-info');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator('button.title')).toHaveAttribute('aria-expanded', 'true');
    await expect(cards.first().locator('button.title')).toContainText('Правий шлуночок');
    await expect(cards.first().locator('button.title .unverified')).not.toHaveAttribute('title');
    // The actions for one structure are icons next to its name.
    for (const name of [/^Наблизити:/, /^Ізолювати:/, /^Сховати:/, /^Зняти вибір:/]) {
      await expect(cards.first().getByRole('button', { name })).toBeVisible();
    }
    await expect(cards.nth(1).locator('button.title')).toHaveAttribute('aria-expanded', 'false');
    await expect(cards.nth(1)).toContainText('Лівий шлуночок');
    await expect(page.locator('svitylo-anatomy .selection-head')).toContainText('Вибрано: 2');

    // Clicking it again (later than a double click) deselects it; empty space changes nothing.
    await page.waitForTimeout(450);
    await page.mouse.click(rv!.x, rv!.y);
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([LV]);
    expect(await atlas(page, `return v.displayOf('${RV}');`)).toBe('ghost');
    const box = (await page.locator('svitylo-anatomy .viewport').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + 8);
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual([LV]);

    // Closing a card deselects too; the transparency stays without a selection.
    await page.waitForTimeout(450);
    await page.mouse.click(rv!.x, rv!.y);
    await expect(cards).toHaveCount(2);
    await cards.first().getByRole('button', { name: /Зняти вибір/ }).click();
    await expect(cards).toHaveCount(1);
    await page.getByRole('button', { name: 'Скасувати вибір' }).click();
    await expect(cards).toHaveCount(0);
    expect(await atlas(page, 'return v.transparency;')).toBe(0.78);
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('ghost');

    // A tree row toggles the selection too; the chosen level follows it.
    const rvRow = page.getByRole('treeitem', { name: 'Правий шлуночок (переклад не перевірено)' });
    await rvRow.click();
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([RV]);
    expect(await atlas(page, 'return v.surroundings.level;')).toBe(1);
    expect(await atlas(page, 'return v.surroundings.levels[0];')).toEqual(['cardiovascular.heart']);
    // A parent and its parts are never selected together.
    await page.getByRole('treeitem', { name: 'Серце', exact: true }).click();
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual(['cardiovascular.heart']);
    expect(await atlas(page, 'return v.surroundings.levels[0];')).toEqual(['cardiovascular']);
    await rvRow.click();
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([RV]);

    // The slider at its left end: everything opaque, the scene as it was.
    await page.getByRole('slider', { name: 'Прозорість оточення' }).fill('0');
    const state = await atlas<{ scene: string[]; surroundings?: unknown }>(page, 'return v.getState();');
    expect(state.surroundings).toEqual({ level: 1 });
    expect(state.scene).toEqual(['cardiovascular.heart']);
    expect(await atlas(page, `return v.displayOf('${LV}');`)).toBe('opaque');
  });

  test('the tree "eye" shows other systems whatever the level; they stay with the automatic level', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}'); await v.showSurroundings('${LV}');`);
    await waitIdle(page);
    const skeleton = page.getByRole('treeitem', { name: 'Скелетна система', exact: true });
    await skeleton.getByRole('button', { name: 'Показати' }).click();
    await waitIdle(page);
    expect(await atlas(page, "return v.displayOf('skeletal');")).toBe('ghost');
    expect((await atlas<{ surroundings: { extra: string[] } }>(page, 'return v.getState();')).surroundings.extra).toEqual(['skeletal']);
    await atlas(page, 'await v.setSurroundingsLevel(null);');
    expect(await atlas(page, "return v.displayOf('skeletal');")).toBe('ghost');
    const state = await atlas<{ scene: string[]; surroundings: unknown }>(page, 'return v.getState();');
    expect(state.scene).toContain('skeletal');
    expect(state.surroundings).toEqual({ transparency: 0.78 });
  });

  test('clicking visible structures adds them to the selection without moving the camera', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.loadAll(); v.setView('anterior', { animate: false });");
    await waitIdle(page);
    const before = await atlas<{ camera: unknown }>(page, 'return v.getState().camera;');
    const box = (await page.locator('svitylo-anatomy .viewport').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
    const selected = await atlas<string[]>(page, 'return v.selection;');
    expect(selected).toHaveLength(1);
    expect(await atlas(page, 'return v.getState().camera;')).toEqual(before);
    // The card column always keeps its space: the scene does not move when a card appears.
    await expect(page.locator('svitylo-anatomy aside.info svitylo-anatomy-info')).toHaveCount(1);
    expect((await page.locator('svitylo-anatomy .viewport').boundingBox())!).toEqual(box);
    const again = (await pointOf(page, selected[0]!))!;
    // Empty space changes nothing; a second click on the same structure deselects it.
    const stage = (await page.locator('svitylo-anatomy .viewport').boundingBox())!;
    await page.mouse.click(stage.x + 8, stage.y + 8);
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual(selected);
    await page.mouse.click(again.x, again.y);
    expect(await atlas<string[]>(page, 'return v.selection;')).toEqual([]);
  });

  test('a double click selects a structure and zooms to it; deselecting it right away brings the camera back', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.loadAll(); v.setView('anterior', { animate: false });");
    await waitIdle(page);
    const camera = () => atlas<{ position: number[]; target: number[] }>(page, 'return v.getState().camera;');
    const settled = () => expect.poll(() => atlas(page, 'return v.renderer.rig.isAnimating;')).toBe(false);
    const start = await camera();
    // The structure under the upper chest (the skin of the trunk in the fixture).
    const box = (await page.locator('svitylo-anatomy .viewport').boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height * 0.42 };
    const id = await atlas<string>(page, `return v.pickAt(${point.x}, ${point.y});`);
    expect(id).not.toBeNull();
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([id]);
    await settled();
    const zoomed = await camera();
    expect(zoomed.position).not.toEqual(start.position);
    // A single click on it (later than a double click) deselects it and the camera goes back.
    await page.waitForTimeout(450);
    const again = (await pointOf(page, id))!;
    await page.mouse.click(again.x, again.y);
    await expect.poll(() => atlas<string[]>(page, 'return v.selection;')).toEqual([]);
    await settled();
    const back = await camera();
    for (let i = 0; i < 3; i++) expect(back.position[i]).toBeCloseTo(start.position[i]!, 3);
  });

  test('"Hide" for the whole selection works both ways', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}'); await v.selectStructure('${RV}', { focus: false });`);
    await waitIdle(page);
    const hide = page.getByRole('group', { name: 'Усе вибране' }).getByRole('button', { name: 'Сховати' });
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    expect(await atlas(page, `return [v.displayOf('${LV}'), v.displayOf('${RV}')];`)).toEqual(['hidden', 'hidden']);
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'false');
    expect(await atlas(page, `return [v.displayOf('${LV}'), v.displayOf('${RV}')];`)).toEqual(['opaque', 'opaque']);
  });

  test('hiding keeps files loaded; "show hidden" restores without requests', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    await atlas(page, 'await v.loadAll();');
    await waitIdle(page);
    const n = t.glb.length;
    await atlas(page, "v.hide(['integument', 'skeletal.skull']);");
    await expect(page.getByRole('button', { name: /Показати приховане \(3\)/ })).toBeEnabled();
    await page.getByRole('button', { name: /Показати приховане/ }).click();
    expect(await atlas(page, "return v.displayOf('integument');")).toBe('opaque');
    expect(t.glb.length).toBe(n);
  });

  test('a fast second selection is not overwritten by the first request', async ({ page }) => {
    await openAtlas(page);
    await page.route('**/respiratory/**', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await atlas(page, "void v.showStructure('respiratory.lung_l'); await v.showStructure('skeletal.skull');");
    await page.waitForTimeout(1200);
    const state = await atlas<{ scene: string[]; selected: string[] }>(page, 'return v.getState();');
    expect(state.scene).toEqual(['skeletal.skull']);
    expect(state.selected).toEqual(['skeletal.skull']);
  });
});

test.describe('links and state', () => {
  test('a shared link restores the view without pressing "load"; reset returns to it', async ({ page, context }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}'); await v.showSurroundings('${LV}', { level: 2 }); v.setView('left', { animate: false });`);
    await waitIdle(page);
    await page.getByRole('button', { name: 'Поділитися' }).first().click();
    const url = await page.locator('svitylo-anatomy dialog.share input').inputValue();
    expect(url).toMatch(/#s=z1\./);
    const original = await atlas<Record<string, unknown>>(page, 'return v.getState();');

    const other = await context.newPage();
    const t = track(other);
    await other.goto(url);
    await other.waitForFunction(() => {
      const v = (document.querySelector('svitylo-anatomy') as { viewer?: { getState(): { scene: string[] }; progress(): { phase: string } } } | null)?.viewer;
      return v && v.getState().scene.length > 0 && v.progress().phase === 'complete';
    });
    const restored = await atlas<Record<string, unknown>>(other, 'return v.getState();');
    expect(restored.scene).toEqual(original.scene);
    expect(restored.selected).toEqual(original.selected);
    expect(restored.surroundings).toEqual({ level: 2, transparency: 0.78 });
    expect(restored.data).toEqual(original.data);
    expect(restored.camera).toEqual(original.camera);
    // Only what the view needs is loaded (not the whole body).
    expect(t.glb.some((p) => p.includes('/nervous/'))).toBe(false);

    await atlas(other, "v.hide(['cardiovascular.aorta']); v.exitSurroundings();");
    await other.getByRole('button', { name: 'Скинути' }).click();
    await other.waitForTimeout(300);
    expect((await atlas<Record<string, unknown>>(other, 'return v.getState();')).surroundings).toEqual(original.surroundings);
    expect((await atlas<Record<string, unknown>>(other, 'return v.getState();')).hidden).toBeUndefined();
  });

  test('reset without a link returns to the empty scene', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.showStructure('skeletal.skull');");
    await page.getByRole('button', { name: 'Скинути' }).click();
    await expect(page.locator('svitylo-anatomy .card .load-all')).toBeVisible();
    expect((await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene).toEqual([]);
  });

  test('a damaged link or a link of another model is reported; nothing loads', async ({ page }) => {
    const t = track(page);
    await openAtlas(page, '?data=fixture', '#s=j1.bm90LWEtc3RhdGU');
    await expect(page.locator('svitylo-anatomy .banner[data-kind=error]')).toContainText(/пошкоджене|неправильний/);
    expect(t.glb).toEqual([]);

    const state = { v: 2, data: { model: 'another-model', version: '1.0.0' }, scene: ['cardiovascular.heart'] };
    const page2 = await page.context().newPage();
    const t2 = track(page2);
    await openAtlas(page2, '?data=fixture', `#s=j1.${Buffer.from(JSON.stringify(state)).toString('base64url')}`);
    await expect(page2.locator('svitylo-anatomy .banner[data-kind=error]')).toContainText('інших даних');
    expect(t2.glb).toEqual([]);
  });

  test('a link made with older data opens in the loaded data: renamed IDs resolve, missing ones are listed', async ({ page }) => {
    const t = track(page);
    // Made with 1.0.0 (and its content hash), opened where the site has 1.1.0.
    const state = {
      v: 1,
      data: { model: 'fixture', version: '1.0.0', hash: '0123456789abcdef' },
      scene: ['cardiovascular.cor', 'cardiovascular.retired_structure'],
      selected: ['cardiovascular.cor'],
    };
    await openAtlas(page, '?data=fixture-next', `#s=j1.${Buffer.from(JSON.stringify(state)).toString('base64url')}`);
    await expect(page.locator('svitylo-anatomy .banner[data-kind=error]')).toContainText('cardiovascular.retired_structure');
    await waitIdle(page);
    expect(t.glb.length).toBeGreaterThan(0);
    expect(t.glb.every((p) => p.startsWith('/test-data/1.1.0/'))).toBe(true);
    const restored = await atlas<{ selected: string[]; data: { version: string; hash?: string } }>(page, 'return v.getState();');
    expect(restored.selected).toEqual(['cardiovascular.heart']);
    expect(restored.data).toEqual({ model: 'fixture', version: '1.1.0' });
  });

  test('a link made with newer data opens in the loaded data', async ({ page }) => {
    const t = track(page);
    const state = { v: 2, data: { model: 'fixture', version: '9.9.9' }, scene: ['cardiovascular.heart'], selected: ['cardiovascular.heart'] };
    await openAtlas(page, '?data=fixture', `#s=j1.${Buffer.from(JSON.stringify(state)).toString('base64url')}`);
    await expect.poll(() => atlas<string[]>(page, 'return v.getState().selected ?? [];')).toEqual(['cardiovascular.heart']);
    await waitIdle(page);
    expect(t.glb.length).toBeGreaterThan(0);
    expect(t.glb.every((p) => p.startsWith('/test-data/1.0.0/'))).toBe(true);
    await expect(page.locator('svitylo-anatomy .banner[data-kind=error]')).toHaveCount(0);
  });

  test('economy mode switches geometry, keeps camera and selection and frees the standard level', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    await atlas(page, "await v.showStructure('respiratory.lung_l');");
    await waitIdle(page);
    const before = await atlas<Record<string, unknown>>(page, 'const s = v.getState(); return { camera: s.camera, selected: s.selected, scene: s.scene };');
    const standardTris = await atlas<number>(page, 'v.renderer.renderNow(); return v.getResourceStats().render.triangles;');
    await openSettings(page);
    await page.getByRole('switch', { name: /Економний режим/ }).check();
    await waitIdle(page);
    await page.waitForTimeout(200);
    expect(t.glb.some((p) => p.includes('/economy/respiratory/'))).toBe(true);
    const after = await atlas<Record<string, unknown>>(page, 'const s = v.getState(); return { camera: s.camera, selected: s.selected, scene: s.scene };');
    expect(after).toEqual(before);
    const stats = await atlas<{ readyChunks: number; render: { triangles: number; pixelRatio: number } }>(page, 'v.renderer.renderNow(); return v.getResourceStats();');
    expect(stats.readyChunks).toBe(1);
    expect(stats.render.triangles).toBeLessThan(standardTris);
    expect(await atlas(page, 'return v.getState().quality;')).toBeUndefined();
  });
});

test.describe('keyboard and accessibility', () => {
  test('tree and search work from the keyboard; the viewport has keyboard camera control', async ({ page }) => {
    await openAtlas(page);
    const tree = page.getByRole('tree', { name: 'Системи та структури' });
    await tree.getByRole('treeitem').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await waitIdle(page);
    const scene = (await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene;
    expect(scene.length).toBe(1);
    await page.keyboard.press(' ');
    const displayOf = (id: string) =>
      page.evaluate((id) => (document.querySelector('svitylo-anatomy') as unknown as { viewer: { displayOf(id: string): string } }).viewer.displayOf(id), id);
    expect(await displayOf(scene[0]!)).toBe('hidden');

    const search = page.getByRole('combobox', { name: /Пошук/ });
    await search.focus();
    await page.keyboard.type('femur');
    await expect(page.getByRole('listbox').getByRole('option').nth(1)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await waitIdle(page);
    expect((await atlas<{ selected: string[] }>(page, 'return v.getState();')).selected.at(-1)).toMatch(/skeletal\.femur_[lr]/);
    await expect(search).toHaveValue('');
    await expect(page.locator('svitylo-anatomy .announcer')).toContainText('Вибрано');

    const viewport = page.locator('svitylo-anatomy .viewport');
    await viewport.focus();
    const before = await atlas<{ camera: { position: number[] } }>(page, 'return v.getState();');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Minus');
    await page.waitForTimeout(100);
    const after = await atlas<{ camera: { position: number[] } }>(page, 'return v.getState();');
    expect(after.camera.position).not.toEqual(before.camera.position);
  });

  test('camera changes name their source in state changes: keyboard, API or pointer', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, `await v.showStructure('${LV}');`);
    await waitIdle(page);
    await page.waitForTimeout(400);
    await atlas(page, "window.__sources = []; v.on('statechange', (e) => window.__sources.push(e.source));");
    const last = () => page.evaluate(() => (window as unknown as { __sources: string[] }).__sources.at(-1));
    const viewport = page.locator('svitylo-anatomy .viewport');
    await viewport.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(last).toBe('keyboard');
    await atlas(page, "v.setView('posterior', { animate: false });");
    await expect.poll(last).toBe('api');
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(last).toBe('pointer');
  });

  test('sources and licences are available independently of the brand link', async ({ page }) => {
    await openAtlas(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Джерела та ліцензії' }).click();
    const dialog = page.locator('svitylo-anatomy dialog.sources');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('CC0 1.0 Universal');
    await expect(dialog).toContainText('Blocked example asset');
    await expect(dialog).toContainText('не включено');
    await expect(dialog.getByRole('link', { name: 'ATTRIBUTION.md' })).toHaveAttribute('rel', /noopener/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the card shows known issues as notes and what the atlas corrected in its details', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.selectStructure('cardiovascular.aorta', { focus: false }); await v.selectStructure('skeletal.femur_l', { focus: false });");
    await waitIdle(page);
    const cards = page.locator('svitylo-anatomy aside.info svitylo-anatomy-info');
    await expect(cards).toHaveCount(2);
    // The femur card is on top (the most recent selection): its correction is not a note.
    const femur = cards.first();
    await expect(femur.locator('p.note')).toHaveCount(0);
    await femur.getByText('Докладніше').click();
    await expect(femur.locator('.corrected dt')).toHaveText('Виправлено в атласі');
    await expect(femur.locator('.corrected dd')).toHaveText('У тестовому наборі стегнову кістку підведено до таза.');
    // The aorta keeps its open issue as a note on the card.
    const aorta = cards.nth(1);
    await aorta.locator('button.title').click();
    await expect(aorta.locator('p.note')).toHaveText('Аорта у тестовому наборі — простий циліндр.');
    await expect(aorta.locator('.corrected')).toHaveCount(0);
  });

  test('the logo stays visible in fullscreen and while loading', async ({ page }) => {
    await openAtlas(page);
    await page.route('**/*.glb', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue().catch(() => undefined);
    });
    await page.locator('svitylo-anatomy .card .load-all').click();
    await expectBrandVisible(page);
    await page.getByRole('button', { name: 'На весь екран' }).first().click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fullscreenElement?.tagName ?? (document.querySelector('svitylo-anatomy')!.hasAttribute('data-pseudo-fullscreen') ? 'PSEUDO' : null))).not.toBeNull();
    await expectBrandVisible(page);
  });
});

test.describe('lifecycle', () => {
  test('remounting does not accumulate WebGL contexts or listeners and keeps the view', async ({ page }) => {
    await instrumentContexts(page);
    await openAtlas(page);
    await atlas(page, "await v.showStructure('skeletal.skull');");
    for (let i = 0; i < 5; i++) {
      await page.evaluate(async () => {
        const el = document.querySelector('svitylo-anatomy')!;
        const parent = el.parentElement!;
        el.remove();
        await new Promise((r) => setTimeout(r, 50));
        parent.append(el);
      });
      await page.waitForFunction(() => Boolean((document.querySelector('svitylo-anatomy') as { viewer?: unknown }).viewer));
      await waitIdle(page);
    }
    // Detection probes create one short-lived context per mount; live contexts must stay at one.
    // A lost context is reported by an event a little later (slower on software WebGL), so poll.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const gl = (window as unknown as { __gl: { created: number; lost: number } }).__gl;
          return gl.created - gl.lost;
        }),
      )
      .toBeLessThanOrEqual(2);
    expect(await page.locator('svitylo-anatomy canvas').count()).toBe(1);
    expect((await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene).toEqual(['skeletal.skull']);
    expect(await atlas<number>(page, 'return v.getResourceStats().listeners;')).toBeLessThanOrEqual(20);
  });

  test('a short DOM move keeps the same viewer', async ({ page }) => {
    await openAtlas(page);
    const same = await page.evaluate(() => {
      const el = document.querySelector('svitylo-anatomy') as HTMLElement & { viewer: unknown };
      const viewer = el.viewer;
      const wrapper = document.createElement('div');
      document.body.append(wrapper);
      wrapper.append(el);
      return el.viewer === viewer;
    });
    expect(same).toBe(true);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (document.querySelector('svitylo-anatomy') as unknown as { viewer: { isDisposed: boolean } }).viewer.isDisposed)).toBe(false);
  });

  test('a WebGL context that cannot be created works like missing WebGL2 and leaves no canvas', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        // The availability check passes; the atlas canvas itself gets no context.
        if (this.classList.contains('svitylo-anatomy-canvas')) return null;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof original;
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?data=fixture&ui=uk&lang=uk');
    await expect(page.getByRole('alert').filter({ hasText: 'WebGL2 недоступний' })).toBeVisible();
    await expect(page.getByRole('tree', { name: 'Системи та структури' })).toBeVisible();
    expect(await page.locator('svitylo-anatomy canvas').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('context loss keeps the logical view and offers restoration', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.showStructure('skeletal.skull');");
    await atlas(page, 'v.renderer.loseContext();');
    await expect(page.getByText('Графічний контекст втрачено').first()).toBeVisible();
    await page.getByRole('button', { name: 'Відновити' }).click();
    await page.waitForTimeout(500);
    expect(await atlas(page, 'return v.isContextLost;')).toBe(false);
    expect((await atlas<{ scene: string[] }>(page, 'return v.getState();')).scene).toEqual(['skeletal.skull']);
    expect(await atlas<number>(page, 'v.renderer.renderNow(); return v.getResourceStats().render.triangles;')).toBeGreaterThan(0);
  });
});

test.describe('layout and camera controls', () => {
  test('side panels collapse from the header; the right column keeps its width while empty', async ({ page }) => {
    await openAtlas(page);
    const viewport = page.locator('svitylo-anatomy .viewport');
    const info = page.locator('svitylo-anatomy aside.info');
    expect((await info.boundingBox())!.width).toBeGreaterThan(300);
    await expect(info).toContainText('Нічого не вибрано');
    await expect(info).toContainText('Виберіть структуру');
    await expect(page.getByRole('group', { name: 'Усе вибране' }).getByRole('button', { name: 'Центр' })).toBeDisabled();
    const before = (await viewport.boundingBox())!;
    await atlas(page, `await v.showStructure('${LV}');`);
    await waitIdle(page);
    // A card appears in the reserved column: the scene does not move.
    await expect(info.locator('svitylo-anatomy-info')).toHaveCount(1);
    expect((await viewport.boundingBox())!).toEqual(before);
    await page.getByRole('button', { name: 'Сховати панель структур' }).click();
    await page.getByRole('button', { name: 'Сховати панель вибраного' }).click();
    await expect(info).toBeHidden();
    await expect(page.locator('svitylo-anatomy aside.panel')).toBeHidden();
    const wide = (await viewport.boundingBox())!;
    expect(wide.width).toBeGreaterThan(before.width + 500);
    // The camera pill stays centred under the model.
    const pill = (await page.locator('svitylo-anatomy .pill').boundingBox())!;
    expect(pill.x + pill.width / 2).toBeCloseTo(wide.x + wide.width / 2, 0);
    // The hidden selection panel still tells how many structures are selected.
    await expect(page.locator('svitylo-anatomy .panel-toggle .badge-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Показати панель вибраного' }).click();
    await page.getByRole('button', { name: 'Показати панель структур' }).click();
    expect((await viewport.boundingBox())!).toEqual(before);
  });

  test('the structures panel is resized by dragging its edge or with the keyboard', async ({ page }) => {
    await openAtlas(page);
    const panel = page.locator('svitylo-anatomy aside.panel');
    const handle = page.locator('svitylo-anatomy .resize-handle');
    const width = async () => Math.round((await panel.boundingBox())!.width);
    const w0 = await width();
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + 200);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 120, h.y + 200, { steps: 4 });
    await page.mouse.up();
    await expect.poll(width).toBe(w0 + 120);
    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(width).toBe(w0 + 104);
    await expect(handle).toHaveAttribute('aria-valuenow', String(w0 + 104));
  });

  test('settings: language, Latin, economy mode and sources in one menu; Escape or a click outside closes it', async ({ page }) => {
    await openAtlas(page);
    await openSettings(page);
    const menu = page.locator('svitylo-anatomy #settings');
    await expect(menu.getByRole('switch', { name: 'Показувати латину' })).toBeVisible();
    await expect(menu.getByRole('switch', { name: /Економний режим/ })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Джерела та ліцензії' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Налаштування' })).toBeFocused();
    await openSettings(page);
    await page.locator('svitylo-anatomy .viewport').click({ position: { x: 10, y: 10 } });
    await expect(menu).toBeHidden();
  });

  test('camera bar: a menu of named views marks the current one; zoom; "overall view" ignores the selection', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, 'await v.loadAll();');
    await waitIdle(page);
    await atlas(page, `v.select(['${LV}']);`);
    const pill = page.getByRole('toolbar', { name: 'Камера' });
    // Centred under the model; on this 640px scene it slides left only as far as the logo needs.
    const stage = (await page.locator('svitylo-anatomy .viewport').boundingBox())!;
    const bar = (await page.locator('svitylo-anatomy .pill').boundingBox())!;
    const logo = (await page.locator('svitylo-anatomy a.brand').boundingBox())!;
    expect(Math.abs(bar.x + bar.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(60);
    expect(bar.x + bar.width).toBeLessThanOrEqual(logo.x - 8);
    expect(bar.x - stage.x).toBeGreaterThanOrEqual(16);
    const views = pill.locator('.views-button');
    await expect(views).toHaveText('Спереду');
    await views.click();
    const menu = page.locator('svitylo-anatomy #views-menu');
    await expect(menu.getByRole('button')).toHaveText(['Спереду', 'Ззаду', 'Ліворуч', 'Праворуч', 'Зверху', 'Знизу']);
    await expect(menu.getByRole('button', { name: 'Спереду' })).toHaveAttribute('aria-pressed', 'true');
    await menu.getByRole('button', { name: 'Ліворуч' }).click();
    await expect(menu).toBeHidden();
    await expect(views).toHaveText('Ліворуч');
    await expect(views).toHaveAccessibleName('Ракурс: Ліворуч');
    await expect.poll(() => atlas(page, 'return v.currentView;')).toBe('left');
    // The view frames the selection (the ventricle), not the whole body.
    const distance = () => atlas<number>(page, 'const c = v.getState().camera; return Math.hypot(...c.position.map((p, i) => p - c.target[i]));');
    await expect.poll(() => atlas(page, 'return v.renderer.rig.isAnimating;')).toBe(false);
    expect(await distance()).toBeLessThan(1);
    // Turning the model by hand clears the mark.
    await atlas(page, 'v.orbit(0.4, 0);');
    await expect(views).toHaveText('Ракурс');
    const before = await distance();
    await pill.getByRole('button', { name: 'Збільшити' }).click();
    await expect.poll(distance).toBeLessThan(before);
    // "Overall view" frames everything visible, not the selected ventricle.
    await pill.getByRole('button', { name: 'Загальний вигляд' }).click();
    await expect.poll(distance).toBeGreaterThan(before);
    expect(await atlas(page, 'return v.selection;')).toEqual([LV]);
  });

  test('"Centre" and "Zoom to" never leave the camera inside another structure', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.loadAll(); v.setView('anterior', { animate: false });");
    await waitIdle(page);
    // A tight frame of the brain would put the camera inside the skull; it stays outside the head.
    await atlas(page, "v.focus(['nervous.brain'], { padding: 0.05, animate: false });");
    const camera = await atlas<{ position: number[]; target: number[] }>(page, 'return v.getState().camera;');
    expect(camera.position[2]).toBeGreaterThan(0.12);
    expect(camera.target[2]).toBeCloseTo(0, 1);
    expect(camera.position[0]).toBeCloseTo(camera.target[0]!, 3);
    // The card button frames that one structure, the whole-selection "Centre" all selected.
    await atlas(page, `v.select(['${LV}', 'skeletal.femur_l']);`);
    const card = page.locator('svitylo-anatomy svitylo-anatomy-info').filter({ hasText: 'Стегнова кістка' });
    await expect(card.locator('button.title')).toHaveAttribute('aria-expanded', 'true');
    await card.getByRole('button', { name: /^Наблизити:/ }).click();
    // The femur spans 0.50–0.92 m; together with the ventricle the selection reaches 1.33 m.
    await expect.poll(() => atlas<number>(page, 'return v.getState().camera.target[1];')).toBeCloseTo(0.71, 1);
    await page.getByRole('group', { name: 'Усе вибране' }).getByRole('button', { name: 'Центр' }).click();
    await expect.poll(() => atlas<number>(page, 'return v.getState().camera.target[1];')).toBeCloseTo(0.915, 1);
  });
});

test.describe('reference views', () => {
  for (const view of ['anterior', 'left', 'superior'] as const) {
    test(`S3 full body, ${view} view`, async ({ page }) => {
      await openAtlas(page);
      await atlas(page, `await v.loadAll(); v.setView('${view}', { animate: false });`);
      await waitIdle(page);
      await page.waitForTimeout(300);
      await expect(page.locator('svitylo-anatomy .viewport')).toHaveScreenshot(`s3-${view}.png`);
    });
  }

  test('S2 organ in translucent surroundings (whole body level, several views)', async ({ page }) => {
    await openAtlas(page);
    await atlas(page, "await v.showStructure('cardiovascular.heart'); await v.showSurroundings('cardiovascular.heart', { level: 2 }); v.setView('anterior', { animate: false });");
    await waitIdle(page);
    await page.waitForTimeout(300);
    await expect(page.locator('svitylo-anatomy .viewport')).toHaveScreenshot('s2-anterior.png');
    await atlas(page, "v.setView('right', { animate: false });");
    await page.waitForTimeout(300);
    await expect(page.locator('svitylo-anatomy .viewport')).toHaveScreenshot('s2-right.png');
  });
});
