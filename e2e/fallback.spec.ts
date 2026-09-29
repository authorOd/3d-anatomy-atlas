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
import { expectBrandVisible, openSettings, track } from './helpers.js';

/** Browser without WebGL2: a clear message, the rest of the interface keeps working. */
test.describe('without WebGL2', () => {
  test('shows a message; tree, search, names and sources still work; no geometry is requested', async ({ page }) => {
    const t = track(page);
    const errors: string[] = [];
    await page.exposeFunction('__atlasError', (code: string) => errors.push(code));
    await page.addInitScript(() => {
      document.addEventListener('anatomy:error', (e) => (window as unknown as { __atlasError(c: string): void }).__atlasError((e as CustomEvent<{ code: string }>).detail.code));
    });
    await page.goto('/?data=fixture&ui=uk&lang=uk');
    await expect(page.getByRole('alert').filter({ hasText: 'WebGL2 недоступний' })).toBeVisible();
    expect(errors).toContain('WEBGL2_UNAVAILABLE');
    await expectBrandVisible(page);

    // Tree: selection shows the info panel with names.
    await expect(page.getByRole('button', { name: 'Показати' })).toHaveCount(0);
    // Systems start collapsed.
    await page.getByRole('treeitem', { name: 'Серцево-судинна система', exact: true }).getByRole('button', { name: 'Розгорнути' }).click();
    await page.getByRole('treeitem', { name: 'Серце', exact: true }).click();
    const info = page.locator('svitylo-anatomy svitylo-anatomy-info');
    await expect(info.getByRole('heading', { level: 2 })).toContainText('Серце');
    await expect(info).toContainText('Cor');

    // Search works on the catalogue alone.
    const search = page.getByRole('combobox', { name: /Пошук/ });
    await search.fill('femur');
    await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
    await search.press('Enter');
    // The result is added to the selection (its card on top) and the field clears.
    await expect(search).toHaveValue('');
    await expect(info).toHaveCount(2);
    const femur = info.first();
    // An unreviewed Ukrainian name is shown with a dotted underline, without a hover tooltip
    // (screen readers hear the status).
    await expect(femur.getByRole('heading', { level: 2 })).toContainText('Стегнова кістка');
    await expect(femur.getByRole('heading', { level: 2 })).toContainText('переклад не перевірено');
    await expect(femur.locator('.unverified')).not.toHaveAttribute('title');

    // Sources and licences are available.
    await openSettings(page);
    await page.getByRole('button', { name: 'Джерела та ліцензії' }).click();
    await expect(page.getByRole('dialog')).toContainText('CC0');
    await page.keyboard.press('Escape');

    // 3D-only actions are not offered.
    await expect(info.getByRole('button', { name: /^(Ізолювати|Наблизити)/ })).toHaveCount(0);
    expect(t.glb).toEqual([]);
  });
});
