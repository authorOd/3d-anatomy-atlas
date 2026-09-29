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

namespace Authorod\SvityloAnatomy\Tests;

use Authorod\SvityloAnatomy\Livewire\AnatomyCommands;
use Illuminate\Support\Facades\View;
use Livewire\Livewire;
use Workbench\App\Livewire\AtlasPage;
use Workbench\App\Livewire\NotePage;

/** Livewire 4: commands to the atlas, its events, and markup that morphing leaves alone. */
final class LivewireTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Views of the workbench components (the same ones the browser tests use).
        View::addLocation(__DIR__.'/../workbench/resources/views');
    }

    public function test_the_javascript_bridge_allows_exactly_the_php_commands(): void
    {
        $lists = [];
        foreach (['livewire.js', 'livewire.d.ts'] as $file) {
            $source = (string) file_get_contents(__DIR__.'/../resources/js/'.$file);
            $this->assertSame(1, preg_match('/LIVEWIRE_METHODS[^\\[]*\\[([^\\]]*)\\]/', $source, $m), $file);
            preg_match_all("/'([A-Za-z]+)'/", $m[1], $names);
            $lists[$file] = $names[1];
        }
        $this->assertSame(AnatomyCommands::METHODS, $lists['livewire.js']);
        $this->assertSame(AnatomyCommands::METHODS, $lists['livewire.d.ts']);
        // Every allowed command has its PHP method.
        foreach (AnatomyCommands::METHODS as $method) {
            $this->assertTrue(method_exists(AnatomyCommands::class, $method), $method);
        }
    }

    public function test_commands_are_dispatched_to_the_browser(): void
    {
        Livewire::test(AtlasPage::class)
            ->call('showHeart')
            ->assertDispatched('anatomy-command', atlas: 'atlas', method: 'showStructure', args: ['cardiovascular.heart'])
            ->call('showSkeleton')
            ->assertDispatched('anatomy-command', method: 'showSystem', args: ['skeletal'])
            ->assertDispatched('anatomy-command', method: 'setView', args: ['posterior']);
    }

    public function test_atlas_events_reach_the_component(): void
    {
        Livewire::test(AtlasPage::class)
            ->dispatch('anatomy-select', ids: ['cardiovascular.heart'], primary: 'cardiovascular.heart', added: ['cardiovascular.heart'], removed: [], source: 'pointer', atlas: 'atlas')
            ->assertSet('selected', 'cardiovascular.heart')
            // Events of another atlas on the page are ignored by this component.
            ->dispatch('anatomy-select', ids: [], primary: null, atlas: 'other')
            ->assertSet('selected', 'cardiovascular.heart');
    }

    public function test_rendered_atlas_and_embeds_are_ignored_by_morphing(): void
    {
        config()->set('svitylo-anatomy.livewire', true);
        $this->app->forgetInstance(\Authorod\SvityloAnatomy\SvityloAnatomy::class);
        $note = Livewire::test(NotePage::class);
        $note->assertSeeHtml('<svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'" structure="cardiovascular.heart" label="Серце" wire:ignore></svitylo-anatomy>');
        $article = static fn (string $html): string => preg_match('#<article>.*</article>#s', $html, $m) === 1 ? $m[0] : '';
        $before = $article($note->html());
        $this->assertNotSame('', $before);
        // A re-render produces exactly the same embed markup.
        $note->call('increment')->assertSet('count', 1)->assertSeeHtml('<output id="count">1</output>');
        $this->assertSame($before, $article($note->html()));
        Livewire::test(AtlasPage::class)->assertSeeHtml('wire:ignore');
    }
}
