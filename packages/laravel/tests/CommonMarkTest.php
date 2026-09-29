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

use Authorod\SvityloAnatomy\CommonMark\AnatomyExtension;
use Authorod\SvityloAnatomy\SvityloAnatomy;
use Illuminate\Support\Str;

final class CommonMarkTest extends TestCase
{
    private function anatomy(): SvityloAnatomy
    {
        return $this->app->make(SvityloAnatomy::class);
    }

    public function test_blocks_become_embeds_and_invalid_blocks_stay_code(): void
    {
        foreach (self::fixtures()['cases'] as $case) {
            $html = $this->anatomy()->markdown("Текст\n\n```anatomy\n{$case['block']}\n```\n");
            if (isset($case['html'])) {
                $this->assertStringContainsString($case['html']."\n", $html, $case['name']);
            } else {
                $this->assertStringNotContainsString('<svitylo-anatomy', $html, $case['name']);
                $this->assertStringContainsString('<pre><code class="language-anatomy">', $html, $case['name']);
            }
        }
    }

    public function test_a_paragraph_with_only_a_share_link_of_the_atlas_becomes_an_embed(): void
    {
        foreach (self::fixtures()['markdown'] as $case) {
            $html = $this->anatomy()->markdown($case['markdown']);
            if ($case['state'] !== null) {
                $this->assertStringContainsString(
                    '<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'" state="'.$case['state'].'"></svitylo-anatomy></figure>',
                    $html,
                    $case['name'],
                );
            } else {
                $this->assertStringNotContainsString('<svitylo-anatomy', $html, $case['name']);
            }
        }
    }

    public function test_raw_html_of_a_note_is_escaped(): void
    {
        $html = $this->anatomy()->markdown("<script>alert(1)</script>\n\n<svitylo-anatomy layout=\"embed\" data-url=\"https://evil.example/\"></svitylo-anatomy>");
        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringNotContainsString('<svitylo-anatomy', $html);
    }

    public function test_embeds_carry_wire_ignore_for_livewire(): void
    {
        config()->set('svitylo-anatomy.livewire', true);
        $this->app->forgetInstance(SvityloAnatomy::class);
        $html = $this->anatomy()->markdown("```anatomy\nstructure: cardiovascular.heart\n```");
        $this->assertStringContainsString('<svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'" structure="cardiovascular.heart" wire:ignore></svitylo-anatomy>', $html);
    }

    public function test_the_extension_works_with_laravel_str_markdown(): void
    {
        $html = Str::markdown("```anatomy\nsystem: skeletal\n```", [], [new AnatomyExtension(['data_url' => '/data/'])]);
        $this->assertSame('<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/data/" system="skeletal"></svitylo-anatomy></figure>'."\n", $html);
    }
}
