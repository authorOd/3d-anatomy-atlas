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

namespace Authorod\SvityloAnatomy;

use Authorod\SvityloAnatomy\View\Components\Atlas;
use Authorod\SvityloAnatomy\View\Components\Embed;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

final class SvityloAnatomyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/svitylo-anatomy.php', 'svitylo-anatomy');
        $this->app->singleton(SvityloAnatomy::class, fn ($app) => new SvityloAnatomy($app['config']->get('svitylo-anatomy', [])));
    }

    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__.'/../resources/views', 'svitylo-anatomy');
        Blade::component('svitylo-anatomy', Atlas::class);
        Blade::component('svitylo-anatomy-embed', Embed::class);
        // @anatomyMarkdown($note) — Markdown with embeds (escaped raw HTML, safe links).
        Blade::directive('anatomyMarkdown', fn (string $expression) => "<?php echo app(\\Authorod\\SvityloAnatomy\\SvityloAnatomy::class)->markdown({$expression}); ?>");
        // @anatomyHtml($sanitizedHtml) — embeds for ```anatomy blocks of stored, sanitized HTML.
        Blade::directive('anatomyHtml', fn (string $expression) => "<?php echo app(\\Authorod\\SvityloAnatomy\\SvityloAnatomy::class)->html({$expression}); ?>");

        if ($this->app->runningInConsole()) {
            $this->publishes([__DIR__.'/../config/svitylo-anatomy.php' => config_path('svitylo-anatomy.php')], 'svitylo-anatomy-config');
        }
    }
}
