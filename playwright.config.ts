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
import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const swiftshader = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * End-to-end tests run the demo site against the synthetic fixture data (/test-data/…).
 * Software rendering (SwiftShader) checks logic and visual regressions; it does not replace
 * measurements on the agreed physical devices.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03 } },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: swiftshader },
  },
  webServer: {
    command: `pnpm --filter @svitylo-atlas/demo exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/?data=fixture`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: [/mobile\.spec/, /fallback\.spec/] },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args: swiftshader } }, testMatch: /mobile\.spec/ },
    { name: 'no-webgl', use: { launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } }, testMatch: /fallback\.spec/ },
  ],
});
