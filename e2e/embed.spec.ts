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
import { expect, test, type Page } from '@playwright/test';
import { track } from './helpers.js';

/** layout="embed" in a note: click to load, compact scene, "open" and the limit of active scenes. */
const embed = (page: Page, id: string) => page.locator(`#${id}`);

async function start(page: Page, id: string) {
  await embed(page, id).getByRole('button', { name: /Показати 3D/ }).click();
  await page.waitForFunction(
    (sel) => {
      const v = (document.querySelector(sel) as unknown as { viewer?: { progress(): { phase: string } } } | null)?.viewer;
      return Boolean(v && v.progress().phase === 'complete');
    },
    `#${id}`,
  );
}

const stateOf = (page: Page, id: string) =>
  page.evaluate((sel) => (document.querySelector(sel) as unknown as { viewer: { getState(): Record<string, unknown> } }).viewer.getState(), `#${id}`);

test.describe('embeds', () => {
  test('placeholders request nothing until the reader starts one; then only its files load', async ({ page }) => {
    const t = track(page);
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/test-data/')) requests.push(new URL(r.url()).pathname);
    });
    await page.goto('/test-pages/embed.html');
    const first = embed(page, 'e1');
    await expect(first.getByRole('button', { name: 'Показати 3D: Серце' })).toBeVisible();
    await expect(first.locator('a.brand')).toBeVisible();
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);

    await start(page, 'e1');
    expect(t.glb.sort()).toEqual([
      '/test-data/1.0.0/standard/cardiovascular/heart_left_ventricle.glb',
      '/test-data/1.0.0/standard/cardiovascular/heart_right_ventricle--aorta.glb',
    ]);
    expect((await stateOf(page, 'e1')).scene).toEqual(['cardiovascular.heart']);
    await expect(first.locator('.embed-chip')).toHaveText('Серце');
    // Latin alongside (the `latin` attribute, `latin: true` of a block).
    await page.evaluate(() => document.querySelector('#e1')!.setAttribute('latin', ''));
    await expect(first.locator('.embed-chip .embed-latin')).toHaveText('Cor');
    // The compact embed has no tree, search or cards.
    await expect(first.getByRole('tree')).toBeHidden();
    await expect(first.getByRole('combobox')).toBeHidden();

    // A second embed shares the metadata already loaded for the first one.
    await start(page, 'e2');
    expect(requests.filter((p) => p.endsWith('/manifest.json'))).toHaveLength(1);
    const second = await stateOf(page, 'e2');
    expect(second.surroundings).toEqual({ level: 1, transparency: 0.78 });
    expect(second.selected).toEqual(['cardiovascular.heart.left_ventricle']);
    expect((await embed(page, 'e2').boundingBox())!.height).toBeCloseTo(320, 0);
  });

  test('"Open" asks the page first, otherwise shows the full atlas on the whole screen and comes back', async ({ page }) => {
    await page.goto('/test-pages/embed.html');
    await start(page, 'e1');
    const viewerId = () => page.evaluate(() => {
      const el = document.querySelector('#e1') as unknown as { viewer: object & { __id?: number } };
      el.viewer.__id ??= Math.random();
      return el.viewer.__id;
    });
    const id = await viewerId();

    // A page can take over (e.g. its own window) and receives the current view.
    await page.evaluate(() => {
      document.addEventListener(
        'anatomy:expand',
        (e) => {
          (window as unknown as { expandState: unknown }).expandState = (e as CustomEvent).detail.state;
          e.preventDefault();
        },
        { once: true },
      );
    });
    const open = embed(page, 'e1').getByRole('button', { name: 'Відкрити' });
    await open.click();
    expect(await page.evaluate(() => (window as unknown as { expandState: { scene: string[] } }).expandState.scene)).toEqual(['cardiovascular.heart']);
    await expect(embed(page, 'e1')).not.toHaveAttribute('data-expanded', '');

    // Default: the same scene becomes the full atlas on the whole screen.
    await open.click();
    await expect(embed(page, 'e1')).toHaveAttribute('data-expanded', '');
    await expect(embed(page, 'e1').getByRole('tree')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement?.id ?? document.querySelector('[data-pseudo-fullscreen]')?.id)).toBe('e1');
    await embed(page, 'e1').getByRole('button', { name: 'Вийти з повноекранного режиму' }).first().click();
    await expect(embed(page, 'e1')).not.toHaveAttribute('data-expanded', '');
    await expect(embed(page, 'e1').getByRole('tree')).toBeHidden();
    expect(await viewerId()).toBe(id);
    expect((await stateOf(page, 'e1')).scene).toEqual(['cardiovascular.heart']);
  });

  test('only a limited number of embeds keep a 3D scene; the oldest returns to its placeholder with its view', async ({ page }) => {
    await page.goto('/test-pages/embed.html?max=2');
    await start(page, 'e1');
    await page.evaluate(() => (document.querySelector('#e1') as unknown as { viewer: { hide(ids: string[]): void } }).viewer.hide(['cardiovascular.heart.left_ventricle']));
    const before = await stateOf(page, 'e1');
    await start(page, 'e2');
    await start(page, 'e3');
    // e1 was used least recently: back to its placeholder, its WebGL context released.
    await expect(embed(page, 'e1').getByRole('button', { name: /Показати 3D/ })).toBeVisible();
    expect(await page.evaluate(() => (document.querySelector('#e1') as unknown as { viewer: unknown }).viewer)).toBeNull();
    expect(await page.evaluate(() => document.querySelectorAll('svitylo-anatomy').length)).toBe(3);
    // Starting it again restores the view it had.
    await start(page, 'e1');
    const after = await stateOf(page, 'e1');
    expect(after.scene).toEqual(before.scene);
    expect(after.hidden).toEqual(before.hidden);
    await expect(embed(page, 'e2').getByRole('button', { name: /Показати 3D/ })).toBeVisible();
    // "Reset" still returns to the embed's own view, not to an empty scene.
    await embed(page, 'e1').getByRole('button', { name: 'Скинути' }).click();
    await expect.poll(async () => (await stateOf(page, 'e1')).hidden).toBeUndefined();
    expect((await stateOf(page, 'e1')).scene).toEqual(before.scene);
  });

  test('"reset" returns an embed to its initial view', async ({ page }) => {
    await page.goto('/test-pages/embed.html');
    await start(page, 'e2');
    const initial = await stateOf(page, 'e2');
    await page.evaluate(() => (document.querySelector('#e2') as unknown as { viewer: { exitSurroundings(): void } }).viewer.exitSurroundings());
    expect((await stateOf(page, 'e2')).surroundings).toBeUndefined();
    await embed(page, 'e2').getByRole('button', { name: 'Скинути' }).click();
    await expect.poll(async () => (await stateOf(page, 'e2')).surroundings).toEqual(initial.surroundings);
  });
});
