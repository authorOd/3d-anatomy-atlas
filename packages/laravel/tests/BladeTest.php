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

use Illuminate\Support\Facades\Blade;

final class BladeTest extends TestCase
{
    public function test_full_atlas_component(): void
    {
        config()->set('svitylo-anatomy.lang', 'uk');
        $html = Blade::render('<x-svitylo-anatomy id="atlas" ui-lang="uk" class="h-screen" />');
        $this->assertMatchesRegularExpression('#<svitylo-anatomy\s+layout="full"\s+data-url="/anatomy-data/1\.0\.0/"\s+lang="uk"\s+wire:ignore\s+id="atlas" ui-lang="uk" class="h-screen"\s*></svitylo-anatomy>#', $html);
        // Values are escaped by Blade.
        $this->assertStringContainsString('state="z1.x&quot;y"', Blade::render('<x-svitylo-anatomy :state="$s" />', ['s' => 'z1.x"y']));
    }

    public function test_embed_component_is_validated_like_a_block(): void
    {
        $html = Blade::render('<x-svitylo-anatomy-embed structure="cardiovascular.heart" :surroundings="2" label="Серце" caption="Серце в оточенні" />');
        $this->assertSame(
            '<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/anatomy-data/1.0.0/" structure="cardiovascular.heart" surroundings="2" label="Серце"></svitylo-anatomy><figcaption>Серце в оточенні</figcaption></figure>',
            trim($html),
        );
        $this->assertSame('', trim(Blade::render('<x-svitylo-anatomy-embed structure="../etc" />')));
        // Numbers that are not whole numbers render nothing instead of failing the page.
        $this->assertSame('', trim(Blade::render('<x-svitylo-anatomy-embed structure="cardiovascular.heart" surroundings="two" />')));
        $this->assertSame('', trim(Blade::render('<x-svitylo-anatomy-embed structure="cardiovascular.heart" height="auto" />')));
        $this->assertStringContainsString('height="480"', Blade::render('<x-svitylo-anatomy-embed structure="cardiovascular.heart" height="480" />'));
        // A line break in a text never turns into more lines of the block.
        $this->assertSame('', trim(Blade::render('<x-svitylo-anatomy-embed structure="cardiovascular.heart" :label="$l" />', ['l' => "Heart\nstate: z1.INJECTED"])));
    }

    public function test_directives(): void
    {
        $html = Blade::render('@anatomyMarkdown($note)', ['note' => "```anatomy\nsystem: skeletal\n```"]);
        $this->assertStringContainsString('system="skeletal"', $html);
        $html = Blade::render('@anatomyHtml($stored)', ['stored' => '<pre><code class="language-anatomy">system: skeletal</code></pre>']);
        $this->assertStringContainsString('<svitylo-anatomy layout="embed"', $html);
    }
}
