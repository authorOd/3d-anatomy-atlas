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

/** The demo note: Markdown rendered with the markdown-it plugin, a share link and an HTML block. */
const embeds = (page: Page) => page.locator('figure.svitylo-anatomy-embed svitylo-anatomy');

async function start(page: Page, index: number) {
  const atlas = embeds(page).nth(index);
  await atlas.scrollIntoViewIfNeeded();
  await atlas.getByRole('button', { name: /Показати 3D/ }).click();
  await page.waitForFunction((i) => {
    const v = (document.querySelectorAll('figure.svitylo-anatomy-embed svitylo-anatomy')[i] as unknown as { viewer?: { progress(): { phase: string } } }).viewer;
    return Boolean(v && v.progress().phase === 'complete');
  }, index);
  return atlas;
}

test.describe('note with embeds', () => {
  test('blocks, a share link and an HTML block become embeds that load nothing until started', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/test-data/')) requests.push(r.url());
    });
    await page.goto('/notes.html?data=fixture');
    await expect(embeds(page)).toHaveCount(4);
    await expect(embeds(page).nth(0).getByRole('button', { name: 'Показати 3D: Серце' })).toBeVisible();
    await expect(embeds(page).nth(3).getByRole('button', { name: 'Показати 3D: Скелет' })).toBeVisible();
    await expect(page.locator('figure.svitylo-anatomy-embed figcaption').first()).toContainText('Вставка з конспекту');
    // The ```anatomy block with a wrong value would stay code; this note has none.
    await expect(page.locator('pre code.language-anatomy')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });

  test('a pasted share link opens exactly the linked view', async ({ page }) => {
    await page.goto('/notes.html?data=fixture');
    await start(page, 2);
    const state = await page.evaluate(() => (document.querySelectorAll('figure.svitylo-anatomy-embed svitylo-anatomy')[2] as unknown as { viewer: { getState(): Record<string, unknown> } }).viewer.getState());
    expect(state.scene).toEqual(['cardiovascular.heart']);
    expect(state.selected).toEqual(['cardiovascular.heart.left_ventricle']);
    expect(state.surroundings).toEqual({ level: 2, transparency: 0.78 });
  });

  test('on a wide screen the page shows "Open" in its own window, above the other embeds', async ({ page }) => {
    await page.goto('/notes.html?data=fixture');
    const atlas = await start(page, 1);
    await atlas.getByRole('button', { name: 'Відкрити' }).click();
    const win = page.getByRole('dialog', { name: 'Атлас' });
    await expect(win).toBeVisible();
    const full = win.locator('svitylo-anatomy');
    await expect(full.getByRole('tree')).toBeVisible();
    await page.waitForFunction(() => {
      const v = (document.querySelector('.atlas-window svitylo-anatomy') as unknown as { viewer?: { getState(): { surroundings?: unknown } } } | null)?.viewer;
      return Boolean(v?.getState().surroundings);
    });
    expect(await page.evaluate(() => (document.querySelector('.atlas-window svitylo-anatomy') as unknown as { viewer: { getState(): { surroundings: unknown } } }).viewer.getState().surroundings)).toEqual({
      level: 1,
      transparency: 0.78,
    });
    // The embed stays in place (no fullscreen) and its logo does not float over the window.
    await expect(atlas).not.toHaveAttribute('data-expanded', '');
    const box = (await win.boundingBox())!;
    const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.atlas-window') !== null, { x: box.x + box.width - 60, y: box.y + box.height / 2 });
    expect(topmost).toBe(true);
    await win.getByRole('button', { name: 'Закрити' }).click();
    await expect(win).toHaveCount(0);
  });
});
