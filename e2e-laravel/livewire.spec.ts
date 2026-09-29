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
import { instrumentContexts } from '../e2e/helpers.js';

/**
 * Livewire 4 integration: Livewire updates (morphing) never touch a running scene, PHP drives the
 * atlas with commands, atlas events reach PHP, and `wire:navigate` / `@persist` do not leak or
 * lose WebGL scenes.
 */
type AtlasElement = HTMLElement & { viewer: { getState(): Record<string, unknown>; progress(): { phase: string }; select(ids: string[]): void } | null };

const stamp = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as AtlasElement & { __stamp?: number; __viewer?: unknown };
    el.__stamp ??= Math.random();
    el.__viewer = el.viewer;
    return el.__stamp;
  }, selector);
const sameScene = (page: Page, selector: string, value: number) =>
  page.evaluate(
    ([sel, v]) => {
      const el = document.querySelector(sel as string) as (AtlasElement & { __stamp?: number; __viewer?: unknown }) | null;
      return Boolean(el && el.__stamp === v && el.viewer && el.viewer === el.__viewer);
    },
    [selector, value],
  );
const idle = (page: Page, selector: string) =>
  page.waitForFunction((sel) => {
    const v = (document.querySelector(sel) as AtlasElement | null)?.viewer;
    return Boolean(v && v.progress().phase === 'complete');
  }, selector);
const stateOf = (page: Page, selector: string) =>
  page.evaluate((sel) => (document.querySelector(sel) as AtlasElement).viewer!.getState(), selector);

test.describe('Livewire', () => {
  test('an update of the component (morph) leaves a running embed alone', async ({ page }) => {
    await page.goto('/note');
    const embed = page.locator('article svitylo-anatomy');
    await expect(embed).toHaveAttribute('wire:ignore', '');
    await embed.getByRole('button', { name: 'Показати 3D: Серце' }).click();
    await idle(page, 'article svitylo-anatomy');
    const id = await stamp(page, 'article svitylo-anatomy');
    for (let i = 1; i <= 3; i++) {
      await page.locator('#increment').click();
      await expect(page.locator('#count')).toHaveText(String(i));
    }
    expect(await sameScene(page, 'article svitylo-anatomy', id)).toBe(true);
    await expect(embed.locator('.embed-chip')).toHaveText('Серце');
  });

  test('PHP commands drive the atlas and atlas events reach PHP', async ({ page }) => {
    await page.goto('/atlas');
    await page.waitForFunction(() => Boolean((document.querySelector('#atlas') as AtlasElement | null)?.viewer));
    await page.locator('#show-heart').click();
    await expect.poll(async () => (await stateOf(page, '#atlas')).scene).toEqual(['cardiovascular.heart']);
    const before = (await stateOf(page, '#atlas')).camera;
    await page.locator('#show-skeleton').click();
    await expect.poll(async () => (await stateOf(page, '#atlas')).scene).toEqual(['skeletal']);
    await expect.poll(async () => (await stateOf(page, '#atlas')).camera).not.toEqual(before);

    // A selection in the atlas is reported to the component.
    await page.evaluate(() => (document.querySelector('#atlas') as AtlasElement).viewer!.select(['skeletal.skull']));
    await expect(page.locator('#selected')).toHaveText('skeletal.skull');
    // A Livewire update keeps the scene.
    const id = await stamp(page, '#atlas');
    await page.locator('#increment').click();
    await expect(page.locator('#count')).toHaveText('1');
    expect(await sameScene(page, '#atlas', id)).toBe(true);
  });

  test('wire:navigate between pages does not accumulate WebGL contexts', async ({ page }) => {
    await instrumentContexts(page);
    await page.goto('/atlas');
    await page.waitForFunction(() => Boolean((document.querySelector('#atlas') as AtlasElement | null)?.viewer));
    for (let i = 0; i < 3; i++) {
      await page.locator('#to-note').click();
      await expect(page.locator('article svitylo-anatomy')).toBeVisible();
      await page.locator('#to-atlas').click();
      await page.waitForFunction(() => Boolean((document.querySelector('#atlas') as AtlasElement | null)?.viewer));
    }
    // Contexts of the pages left behind are released: at most the current one is alive.
    await page.waitForTimeout(300);
    const gl = await page.evaluate(() => (window as unknown as { __gl: { created: number; lost: number } }).__gl);
    expect(gl.created - gl.lost).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.querySelectorAll('svitylo-anatomy').length)).toBe(1);
  });

  test('@persist keeps the same atlas and its scene across wire:navigate', async ({ page }) => {
    await page.goto('/persist-a');
    await page.waitForFunction(() => Boolean((document.querySelector('#persisted') as AtlasElement | null)?.viewer));
    await page.evaluate(() => (document.querySelector('#persisted') as unknown as { showStructure(id: string): Promise<unknown> }).showStructure('cardiovascular.heart'));
    await idle(page, '#persisted');
    const id = await stamp(page, '#persisted');
    await page.locator('#next').click();
    await expect(page.locator('#page')).toHaveText('Сторінка b');
    expect(await sameScene(page, '#persisted', id)).toBe(true);
    expect((await stateOf(page, '#persisted')).scene).toEqual(['cardiovascular.heart']);
    await page.locator('#next').click();
    await expect(page.locator('#page')).toHaveText('Сторінка a');
    expect(await sameScene(page, '#persisted', id)).toBe(true);
  });

  test('the atlas follows the platform theme (the dark class on <html>), also atlases added later', async ({ page }) => {
    await page.goto('/atlas');
    const atlas = page.locator('svitylo-anatomy').first();
    await expect(atlas).toHaveAttribute('theme', 'light');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(atlas).toHaveAttribute('theme', 'dark');
    // The Svitylo dark surface.
    const header = await atlas.evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('header.bar')!).backgroundColor);
    expect(header).toBe('rgb(20, 25, 36)');
    await page.evaluate(() => {
      const el = document.createElement('svitylo-anatomy');
      el.id = 'later';
      el.setAttribute('data-url', '/test-data/1.0.0/');
      document.body.append(el);
    });
    await expect(page.locator('#later')).toHaveAttribute('theme', 'dark');
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await expect(page.locator('#later')).toHaveAttribute('theme', 'light');
  });
});
