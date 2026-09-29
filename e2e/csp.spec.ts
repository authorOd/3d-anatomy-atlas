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
import { atlas, openSettings, waitIdle } from './helpers.js';

/** The component works under a strict Content-Security-Policy (documented in docs/integration.md). */
test('works under a strict CSP: no inline styles, no eval, WASM decoder allowed', async ({ page }) => {
  await page.goto('/test-pages/csp.html');
  await page.waitForFunction(() => Boolean((document.querySelector('svitylo-anatomy') as { viewer?: unknown } | null)?.viewer));
  await page.route('**/*.glb', async (route) => {
    await new Promise((r) => setTimeout(r, 80));
    await route.continue();
  });
  await page.locator('svitylo-anatomy .card .load-all').click();
  await expect(page.locator('svitylo-anatomy [role=progressbar]')).toBeVisible();
  await waitIdle(page);
  const stats = await atlas<{ readyChunks: number; failedChunks: number; render: { triangles: number } }>(
    page,
    'v.renderer.renderNow(); return v.getResourceStats();',
  );
  expect(stats.failedChunks).toBe(0);
  expect(stats.readyChunks).toBeGreaterThan(0);
  expect(stats.render.triangles).toBeGreaterThan(0);
  // Tree rows are positioned (styles applied through CSSOM, not inline attributes).
  const tops = await page.locator('svitylo-anatomy [role=treeitem]').evaluateAll((rows) => rows.slice(0, 3).map((r) => (r as HTMLElement).style.top));
  expect(tops).toEqual(['0px', '36px', '72px']);
  // The settings menu and the two-line rows with Latin names work the same way.
  await openSettings(page);
  await page.getByRole('switch', { name: 'Показувати латину' }).check();
  const latinTops = await page.locator('svitylo-anatomy [role=treeitem]').evaluateAll((rows) => rows.slice(0, 2).map((r) => (r as HTMLElement).style.top));
  expect(latinTops).toEqual(['0px', '48px']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Поділитися' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const violations = await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
  expect(violations).toEqual([]);
});
