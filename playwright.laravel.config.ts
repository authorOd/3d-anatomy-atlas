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
import { defineConfig } from '@playwright/test';

const PORT = 8010;
const swiftshader = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * Browser tests of the Laravel/Livewire integration against the package's Testbench workbench
 * (packages/laravel/workbench). Needs PHP 8.2+ and `composer install` in packages/laravel;
 * run with `pnpm test:laravel:e2e` (builds the workbench bundle first).
 */
export default defineConfig({
  testDir: 'e2e-laravel',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-laravel' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
    launchOptions: { args: swiftshader },
  },
  webServer: {
    command: `php vendor/bin/testbench serve --host=127.0.0.1 --port=${PORT}`,
    cwd: 'packages/laravel',
    url: `http://127.0.0.1:${PORT}/note`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
