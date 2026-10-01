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
import { expect, type Page, type Request } from '@playwright/test';

export interface Tracker {
  glb: string[];
  json: string[];
}

/** Records requests for geometry and metadata. */
export function track(page: Page): Tracker {
  const t: Tracker = { glb: [], json: [] };
  page.on('request', (r: Request) => {
    const url = new URL(r.url());
    if (url.pathname.endsWith('.glb')) t.glb.push(url.pathname);
    else if (url.pathname.endsWith('.json') && url.pathname.includes('/test-data/')) t.json.push(url.pathname);
  });
  return t;
}

/** Counts WebGL contexts created and released in the page (installed before scripts run). */
export async function instrumentContexts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __gl: { created: number; lost: number } };
    w.__gl = { created: 0, lost: 0 };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const ctx = (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      if (ctx && (type === 'webgl2' || type === 'webgl') && !(this as unknown as { __counted?: boolean }).__counted) {
        (this as unknown as { __counted?: boolean }).__counted = true;
        w.__gl.created++;
        this.addEventListener('webglcontextlost', () => w.__gl.lost++);
      }
      return ctx;
    } as typeof original;
  });
}

/**
 * Opens the demo. The atlas defaults to English; most scenarios run with the Ukrainian
 * interface and names (`uk: true`) because the fixture has reviewed Ukrainian names.
 */
export async function openAtlas(page: Page, query = '?data=fixture', hash = '', options: { uk?: boolean } = {}) {
  const q = options.uk === false || query.includes('ui=') ? query : `${query}${query.includes('?') ? '&' : '?'}ui=uk&lang=uk`;
  await page.goto(`/${q}${hash}`);
  await page.waitForFunction(() => Boolean((document.querySelector('svitylo-anatomy') as { catalog?: unknown } | null)?.catalog));
  await page.waitForFunction(() => Boolean((document.querySelector('svitylo-anatomy') as { viewer?: unknown } | null)?.viewer));
}

/** Opens the settings menu of the header. */
export async function openSettings(page: Page, label = 'Налаштування') {
  const button = page.locator('svitylo-anatomy').getByRole('button', { name: label, exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(page.locator('svitylo-anatomy #settings')).toBeVisible();
}

/** Evaluates code with `el` = the atlas element and `v` = its viewer. */
export function atlas<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(async () => { const el = document.querySelector('svitylo-anatomy'); const v = el.viewer; ${fn} })()`) as Promise<T>;
}

export async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const v = (document.querySelector('svitylo-anatomy') as { viewer?: { progress(): { phase: string } } } | null)?.viewer;
    const phase = v?.progress().phase;
    return phase === 'complete' || phase === 'idle' || phase === 'error' || phase === 'cancelled';
  });
}

export async function expectBrandVisible(page: Page) {
  const brand = page.locator('svitylo-anatomy a.brand');
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute('rel', /noopener/);
  await expect(brand).toHaveAttribute('aria-label', /Svitylo/);
  const box = await brand.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  // Nothing covers the centre of the logo.
  const covered = await page.evaluate(({ x, y }) => {
    const host = document.querySelector('svitylo-anatomy')!;
    const top = host.shadowRoot!.elementFromPoint(x, y);
    return top?.closest('a.brand') ? null : top?.outerHTML.slice(0, 80);
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  expect(covered).toBeNull();
}

/** A viewport point where `id` is picked (scans a grid; null when not visible). */
export async function pointOf(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  // The ID goes in as an argument, not into the code.
  return page.evaluate((id) => {
    type Viewer = { renderer: { canvas: HTMLCanvasElement }; pickAt(x: number, y: number): string | null };
    const v = (document.querySelector('svitylo-anatomy') as unknown as { viewer: Viewer }).viewer;
    const r = v.renderer.canvas.getBoundingClientRect();
    for (let y = 0.1; y < 0.95; y += 0.025)
      for (let x = 0.1; x < 0.95; x += 0.025) {
        const px = r.left + r.width * x;
        const py = r.top + r.height * y;
        if (v.pickAt(px, py) === id) return { x: px, y: py };
      }
    return null;
  }, id);
}
