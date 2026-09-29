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

use Authorod\SvityloAnatomy\Html\AnatomyHtml;
use Authorod\SvityloAnatomy\Sanitizer\AnatomySanitizer;
use Authorod\SvityloAnatomy\SvityloAnatomy;
use Symfony\Component\HtmlSanitizer\HtmlSanitizer;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

/** Symfony HtmlSanitizer: sanitize first, then turn the blocks into embeds. */
final class SanitizerTest extends TestCase
{
    private const NOTE = '<p onclick="alert(1)">Текст<img src="x" onerror="alert(2)"></p>'
        ."<pre><code class=\"language-anatomy\">structure: cardiovascular.heart\nlabel: Серце</code></pre>"
        .'<script>alert(3)</script>'
        .'<svitylo-anatomy layout="embed" data-url="https://evil.example/" state="z1.AAAA"></svitylo-anatomy>';

    public function test_sanitized_blocks_become_embeds_and_injected_markup_is_removed(): void
    {
        $config = AnatomySanitizer::allowBlocks((new HtmlSanitizerConfig())->allowSafeElements());
        $clean = (new HtmlSanitizer($config))->sanitize(self::NOTE);
        $html = $this->app->make(SvityloAnatomy::class)->html($clean);

        $this->assertStringContainsString('<svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'" structure="cardiovascular.heart" label="Серце"></svitylo-anatomy>', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('onerror', $html);
        $this->assertStringNotContainsString('<script', $html);
        // An embed written into the note by hand never survives (no foreign data URL).
        $this->assertStringNotContainsString('evil.example', $html);
        $this->assertSame(1, substr_count($html, '<svitylo-anatomy'));
    }

    public function test_rendered_embeds_can_be_sanitized_with_their_attributes_only(): void
    {
        $embed = $this->app->make(SvityloAnatomy::class)->embed("structure: cardiovascular.heart\ncaption: Серце");
        $config = AnatomySanitizer::allowEmbeds((new HtmlSanitizerConfig())->allowSafeElements(), self::DATA_URL);
        $dirty = str_replace('<svitylo-anatomy ', '<svitylo-anatomy onclick="alert(1)" style="position:fixed" ', $embed);
        $clean = (new HtmlSanitizer($config))->sanitize($dirty);

        $this->assertStringContainsString('<svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'" structure="cardiovascular.heart"', $clean);
        $this->assertStringContainsString('<figcaption>Серце</figcaption>', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('position:fixed', $clean);
    }

    public function test_an_embed_in_the_input_never_chooses_its_layout_or_data_folder(): void
    {
        $dirty = '<svitylo-anatomy layout="full" data-url="https://evil.example/d/" structure="cardiovascular.heart"></svitylo-anatomy>';
        $sanitize = static fn (?string $dataUrl) => (new HtmlSanitizer(AnatomySanitizer::allowEmbeds((new HtmlSanitizerConfig())->allowSafeElements(), $dataUrl)))->sanitize($dirty);

        $own = $sanitize(self::DATA_URL);
        $this->assertStringContainsString('layout="embed" data-url="'.self::DATA_URL.'"', $own);
        $this->assertStringNotContainsString('evil.example', $own);
        $this->assertStringNotContainsString('layout="full"', $own);
        // Without the site's folder the attribute is dropped: the atlas uses its default folder.
        $default = $sanitize(null);
        $this->assertStringNotContainsString('data-url', $default);
        $this->assertStringContainsString('layout="embed"', $default);
    }

    public function test_the_html_transform_is_idempotent(): void
    {
        $once = AnatomyHtml::transform("<pre><code class=\"language-anatomy\">system: skeletal</code></pre>");
        $this->assertSame($once, AnatomyHtml::transform($once));
    }
}
