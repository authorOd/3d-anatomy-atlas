<?php
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

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::view('/note', 'page', ['component' => 'note-page']);
Route::view('/atlas', 'page', ['component' => 'atlas-page']);
Route::view('/persist-a', 'persist', ['page' => 'a']);
Route::view('/persist-b', 'persist', ['page' => 'b']);

/** Static files of the test application: the JS bundle and the synthetic test data. */
$serve = static function (string $root, string $path) {
    $file = realpath($root.'/'.$path);
    abort_unless($file !== false && str_starts_with($file, realpath($root).DIRECTORY_SEPARATOR) && is_file($file), 404);
    $types = ['js' => 'text/javascript', 'json' => 'application/json', 'glb' => 'model/gltf-binary', 'css' => 'text/css', 'map' => 'application/json', 'md' => 'text/markdown'];

    return response()->file($file, ['Content-Type' => $types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream', 'Cache-Control' => 'no-cache']);
};
Route::get('/assets/{path}', fn (string $path) => $serve(__DIR__.'/../dist', $path))->where('path', '.*');
Route::get('/test-data/{path}', fn (string $path) => $serve(__DIR__.'/../../../../test/fixtures/anatomy-data', $path))->where('path', '.*');
