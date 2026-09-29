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
import { atlas, expectBrandVisible, openAtlas, openSettings, track, waitIdle } from './helpers.js';

/** Phone layout (Pixel 7 viewport with touch). */
test.describe('phone layout', () => {
  test('search at the top, the tree in a drawer, the atlas actions in the menu; the logo stays visible', async ({ page }) => {
    const t = track(page);
    await openAtlas(page);
    const search = page.getByRole('combobox', { name: /Пошук/ });
    await expect(search).toBeVisible();
    expect((await search.boundingBox())!.y).toBeLessThan(80);
    await expectBrandVisible(page);
    expect(t.glb).toEqual([]);

    // The menu holds the atlas actions and the settings.
    await openSettings(page);
    const menu = page.locator('svitylo-anatomy #settings');
    for (const name of ['Завантажити все', 'Поділитися', 'Скинути', 'На весь екран', 'Джерела та ліцензії']) {
      await expect(menu.getByRole('button', { name })).toBeVisible();
    }
    await expect(menu.getByRole('switch', { name: 'Показувати латину' })).toBeVisible();
    // While it is open, the menu covers the logo in the top corner of the scene.
    const onTop = await page.evaluate(() => {
      const root = document.querySelector('svitylo-anatomy')!.shadowRoot!;
      const logo = root.querySelector('a.brand')!.getBoundingClientRect();
      return root.elementFromPoint(logo.x + logo.width / 2, logo.y + logo.height / 2)?.closest('#settings') !== null;
    });
    expect(onTop).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // The tree is not shown until the drawer is opened.
    const drawer = page.getByRole('button', { name: 'Структури' });
    await expect(page.locator('svitylo-anatomy aside.panel')).toBeHidden();
    await drawer.tap();
    await expect(drawer).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('svitylo-anatomy aside.panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('treeitem').first()).toBeVisible();

    // The drawer scrolls on its own; the page itself never scrolls.
    await panel.getByRole('treeitem').first().hover();
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);

    // A row selects a structure and closes the drawer so the model is visible.
    await panel.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).tap();
    await panel.getByRole('treeitem', { name: 'Серце', exact: true }).tap();
    await expect(panel).toBeHidden();
    await waitIdle(page);
    expect((await atlas<{ selected: string[] }>(page, 'return v.getState();')).selected).toEqual(['cardiovascular.heart']);
    // The selection stays in the bar until the user opens it.
    const toggle = page.locator('svitylo-anatomy .sheet-toggle');
    await expect(toggle).toContainText('Серце');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.tap();
    await expect(page.locator('svitylo-anatomy svitylo-anatomy-info').getByRole('heading', { level: 2 })).toContainText('Серце');
    await expectBrandVisible(page);
  });

  test('the 3D area takes the whole height but the header and the selection bar; the sheet opens over it', async ({ page }) => {
    await openAtlas(page);
    const box = (sel: string) => page.locator(`svitylo-anatomy ${sel}`).boundingBox().then((b) => b!);
    const height = page.viewportSize()!.height;
    const layout = async () => ({ viewport: await box('.viewport'), bar: await box('.sheet-bar'), header: await box('header.bar') });
    const empty = await layout();
    // The 64px header, the 3D area and the 56px selection bar under a 1px line, down to the
    // bottom edge; the camera pill and the logo float over the scene.
    expect(empty.header.height).toBeCloseTo(64, 0);
    expect(empty.bar.height).toBeCloseTo(56, 0);
    expect(empty.viewport.y).toBeCloseTo(empty.header.y + empty.header.height, 0);
    expect(empty.viewport.height).toBeCloseTo(height - empty.header.height - empty.bar.height - 1, 0);
    expect(empty.bar.y + empty.bar.height).toBeCloseTo(height, 0);
    expect(empty.viewport.height / height).toBeGreaterThan(0.84);
    const pill = await box('.scene-controls');
    expect(pill.y + pill.height).toBeLessThanOrEqual(empty.viewport.y + empty.viewport.height);
    await expect(page.locator('svitylo-anatomy .sheet-toggle')).toContainText('Нічого не вибрано');
    // The short logo (the mark) is in the top corner of the scene; the camera bar is one block
    // across the scene that ends with the level, where the full logo is on wide layouts.
    const brand = page.locator('svitylo-anatomy a.brand');
    await expect(brand).toHaveAttribute('data-short', '');
    const mark = await box('a.brand');
    expect(mark.y).toBeCloseTo(empty.viewport.y + 12, 0);
    expect(mark.x + mark.width).toBeCloseTo(empty.viewport.x + empty.viewport.width - 12, 0);
    expect(mark.width).toBeCloseTo(mark.height, 0);
    await expect(page.locator('svitylo-anatomy .scene-controls > .pill')).toHaveCount(1);
    const block = await box('.scene-controls > .pill');
    const level = await box('.scene-controls > .pill .level-bar');
    expect(block.x).toBeCloseTo(empty.viewport.x + 12, 0);
    expect(block.x + block.width).toBeCloseTo(empty.viewport.x + empty.viewport.width - 12, 0);
    expect(level.x + level.width).toBeLessThanOrEqual(block.x + block.width);
    expect(level.x + level.width).toBeGreaterThan(block.x + block.width - 8);

    // Selecting does not resize the scene; the sheet opens only on request, over the scene.
    await atlas(page, "await v.showStructure('cardiovascular.heart');");
    await waitIdle(page);
    expect((await layout()).viewport).toEqual(empty.viewport);
    const toggle = page.locator('svitylo-anatomy .sheet-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('svitylo-anatomy svitylo-anatomy-info')).toBeVisible();
    expect((await layout()).viewport).toEqual(empty.viewport);
    const sheet = await box('.sheet-body');
    expect(sheet.y).toBeLessThan(empty.viewport.y + empty.viewport.height);
    // The logo stays clear of the sheet; the sheet has no level (it is on the camera bar).
    const logo = await box('a.brand');
    expect(logo.y + logo.height).toBeLessThanOrEqual(sheet.y);
    await expectBrandVisible(page);
    await expect(page.locator('svitylo-anatomy aside.info').getByRole('group', { name: 'Рівень оточення' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect((await layout()).viewport).toEqual(empty.viewport);
    // Clearing the selection leaves the bar in place.
    await atlas(page, 'v.clearSelection();');
    await expect(toggle).toContainText('Нічого не вибрано');
    expect((await layout()).viewport).toEqual(empty.viewport);
  });

  test('tapping the model selects a structure; the camera bar holds the transparency and the surroundings level', async ({ page }) => {
    await openAtlas(page);
    await page.locator('svitylo-anatomy .card .load-all').tap();
    await waitIdle(page);
    const viewport = page.locator('svitylo-anatomy .viewport');
    const box = (await viewport.boundingBox())!;
    const before = await atlas<{ camera: unknown }>(page, 'return v.getState();');
    // The centre of the full-body view hits the trunk.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.42);
    await expect.poll(() => atlas<string[]>(page, 'return v.getState().selected ?? [];')).not.toEqual([]);
    const after = await atlas<{ camera: unknown }>(page, 'return v.getState();');
    expect(after.camera).toEqual(before.camera);
    await expect(page.locator('svitylo-anatomy .sheet-toggle')).toContainText('Вибрано: 1');
    await expectBrandVisible(page);
    // No zoom buttons on a phone (pinch zooms); the views are a menu with names.
    const bar = page.getByRole('toolbar', { name: 'Камера' });
    await expect(bar.getByRole('button', { name: 'Збільшити' })).toBeHidden();
    await expect(bar.locator('.views-button')).toHaveText('Спереду');
    // A button opens the transparency slider above the bar.
    const button = bar.getByRole('button', { name: 'Прозорість оточення' });
    await button.tap();
    const menu = page.locator('svitylo-anatomy .transparency-popover');
    await expect(menu).toBeVisible();
    const popover = (await menu.boundingBox())!;
    expect(popover.x).toBeGreaterThanOrEqual(0);
    expect(popover.x + popover.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const slider = menu.getByRole('slider', { name: 'Прозорість оточення' });
    await slider.fill('0.5');
    await expect.poll(() => atlas(page, 'return v.transparency;')).toBe(0.5);
    await expect(menu).toContainText('50%');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute('data-active', '');
    // The level is on the camera bar (a phone shows the short label and the level's name).
    const stepper = bar.getByRole('group', { name: 'Рівень оточення' });
    await expect(stepper).toContainText(/Рівень \d із \d/);
    const shown = await atlas<{ level: number; levels: unknown[] }>(page, 'return v.surroundings;');
    await expect(stepper).toContainText(`Рівень ${shown.level} із ${shown.levels.length}`);
    await stepper.getByRole('button', { name: 'Менше оточення' }).tap();
    await expect.poll(() => atlas(page, 'return v.surroundings.explicit;')).toBe(true);
    await expect(stepper).toContainText(`Рівень ${shown.level - 1} із ${shown.levels.length}`);
    // Back at the left end the slider turns the transparency off.
    await button.tap();
    await slider.fill('0');
    await expect.poll(() => atlas(page, 'return v.transparency;')).toBe(0);
    await expect(button).not.toHaveAttribute('data-active');
  });

  test('share is in the menu', async ({ page }) => {
    await openAtlas(page);
    await openSettings(page);
    await page.locator('svitylo-anatomy #settings').getByRole('button', { name: 'Поділитися' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue(/#s=/);
  });
});
