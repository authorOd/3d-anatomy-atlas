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

use Authorod\SvityloAnatomy\Embed\EmbedRenderer;
use Authorod\SvityloAnatomy\Embed\EmbedSpec;
use Authorod\SvityloAnatomy\Html\AnatomyHtml;
use Authorod\SvityloAnatomy\Sanitizer\AnatomySanitizer;
use Authorod\SvityloAnatomy\SvityloAnatomy;
use League\CommonMark\GithubFlavoredMarkdownConverter;
use Symfony\Component\HtmlSanitizer\HtmlSanitizer;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

/** Stored HTML (rich text editors, other renderers). */
final class HtmlTransformTest extends TestCase
{
    private const OPTIONS = ['data_url' => '/d/', 'share_urls' => ['https://svitylo.com/3d-anatomy-atlas', 'https://svitylo.com/atlas']];

    private const LINK = 'https://svitylo.com/3d-anatomy-atlas#s=z1.eJx-abc_09';

    private static function embed(string $state): string
    {
        return EmbedRenderer::render(new EmbedSpec(state: $state), self::OPTIONS);
    }

    public function test_blocks_of_stored_html_become_embeds(): void
    {
        $html = "<p>Текст</p><pre><code class=\"language-anatomy\">system: skeletal\nlabel: Скелет &amp; м&#039;язи</code></pre><p>Кінець</p>";
        $this->assertSame(
            '<p>Текст</p><figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/d/" system="skeletal" label="Скелет &amp; м&#39;язи"></svitylo-anatomy></figure><p>Кінець</p>',
            AnatomyHtml::transform($html, ['data_url' => '/d/']),
        );
    }

    public function test_other_blocks_markup_and_invalid_blocks_are_left_alone(): void
    {
        foreach ([
            '<pre><code class="language-js">let a;</code></pre>',
            '<pre><code class="language-anatomy"><b>structure: cardiovascular.heart</b></code></pre>',
            '<pre><code class="language-anatomy">structure: ../etc</code></pre>',
            '<pre><code>structure: cardiovascular.heart</code></pre>',
        ] as $html) {
            $this->assertSame($html, AnatomyHtml::transform($html));
        }
    }

    public function test_attribute_order_and_extra_classes_do_not_matter(): void
    {
        $html = "<pre class=\"x\"><code data-a=\"1\" class='hljs language-anatomy'>structure: cardiovascular.heart\n</code></pre>";
        $this->assertStringContainsString('structure="cardiovascular.heart"', AnatomyHtml::transform($html));
    }

    public function test_br_in_a_block_is_a_line_break(): void
    {
        $expected = AnatomyHtml::transform("<pre><code class=\"language-anatomy\">system: skeletal\nlabel: Скелет</code></pre>");
        $this->assertStringContainsString('system="skeletal" label="Скелет"', $expected);
        // CKEditor stores the lines of a code block with <br>; a line break right after it is the same one.
        foreach (['<br>', '<br/>', '<br />', '<BR>', "<br>\n", "<br />\r\n"] as $br) {
            $html = "<pre><code class=\"language-anatomy\">system: skeletal{$br}label: Скелет{$br}</code></pre>";
            $this->assertSame($expected, AnatomyHtml::transform($html), addcslashes($br, "\r\n"));
        }
        // Any other markup still leaves the block unchanged.
        $html = '<pre><code class="language-anatomy">system: skeletal<br><b>label: Скелет</b></code></pre>';
        $this->assertSame($html, AnatomyHtml::transform($html));
    }

    public function test_a_paragraph_with_only_a_share_link_becomes_an_embed(): void
    {
        // CKEditor's AutoLink: a link that shows its own address.
        $html = '<p>Текст</p><p><a href="'.self::LINK.'">'.self::LINK.'</a></p><p>Кінець</p>';
        $this->assertSame('<p>Текст</p>'.self::embed('z1.eJx-abc_09').'<p>Кінець</p>', AnatomyHtml::transform($html, self::OPTIONS));
    }

    public function test_share_links_as_text_with_entities_spaces_and_attributes(): void
    {
        $query = 'https://svitylo.com/atlas/?lang=uk&amp;x=1#v=2&amp;s=j1.eyJ2IjoxfQ';
        foreach ([
            'the address as text' => ['<p>'.self::LINK.'</p>', 'z1.eJx-abc_09'],
            '&amp; in the query of a link' => ['<p><a href="'.$query.'">'.$query.'</a></p>', 'j1.eyJ2IjoxfQ'],
            '&amp; in the query of the text' => ['<p>'.$query.'</p>', 'j1.eyJ2IjoxfQ'],
            'spaces, &nbsp; and <br> around a link' => ["<p>\n  &nbsp;<a href=\"".self::LINK.'">'.self::LINK."</a>\u{00A0}<br>\n</p>", 'z1.eJx-abc_09'],
            'spaces, &nbsp; and <br /> around the text' => ['<p><br /> &nbsp;'.self::LINK.'&nbsp;&#160;<br/></p>', 'z1.eJx-abc_09'],
            'attributes of the paragraph' => ['<p class="x" style="text-align:center">'.self::LINK.'</p>', 'z1.eJx-abc_09'],
            'other attributes, single quotes, capitals' => ['<P><A target="_blank" rel="noopener noreferrer" HREF=\''.self::LINK.'\'>'.self::LINK.'</A></P>', 'z1.eJx-abc_09'],
            'a percent-encoded address' => ['<p><a href="https://svitylo.com/atlas/%D1%81%D0%B5%D1%80%D1%86%D0%B5#s=z1.AAAA">https://svitylo.com/atlas/серце#s=z1.AAAA</a></p>', 'z1.AAAA'],
            'entities of Symfony HtmlSanitizer' => ['<p><a href="https://svitylo.com/atlas#s&#61;z1.AAAA">https://svitylo.com/atlas#s&#61;z1.AAAA</a></p>', 'z1.AAAA'],
        ] as $name => [$html, $state]) {
            $this->assertSame(self::embed($state), AnatomyHtml::transform($html, self::OPTIONS), $name);
        }
    }

    public function test_other_paragraphs_are_left_unchanged(): void
    {
        $link = '<a href="'.self::LINK.'">'.self::LINK.'</a>';
        foreach ([
            'a link with other text' => '<p><a href="'.self::LINK.'">Серце</a></p>',
            'a link to another address' => '<p><a href="https://svitylo.com/atlas#s=z1.AAAA">'.self::LINK.'</a></p>',
            'the address in other attributes' => '<p><a data-href="'.self::LINK.'" title=\'x href='.self::LINK.' y\' href="https://svitylo.com/atlas">'.self::LINK.'</a></p>',
            'a link without an address' => '<p><a id="x">'.self::LINK.'</a></p>',
            'two links' => '<p>'.$link.' '.$link.'</p>',
            'two links on two lines' => '<p>'.$link.'<br>'.$link.'</p>',
            'two addresses' => '<p>'.self::LINK.'<br>'.self::LINK.'</p>',
            'extra text' => '<p>Дивіться '.$link.'</p>',
            'extra text after a no-break space' => '<p>'.self::LINK.'&nbsp;тут</p>',
            'punctuation after the link' => '<p>'.$link.'.</p>',
            'punctuation after the address' => '<p>'.self::LINK.'.</p>',
            'markup in the link' => '<p><a href="'.self::LINK.'"><strong>'.self::LINK.'</strong></a></p>',
            'markup around the link' => '<p><strong>'.$link.'</strong></p>',
            'a foreign host' => '<p><a href="https://example.org/atlas#s=z1.AAAA">https://example.org/atlas#s=z1.AAAA</a></p>',
            'a page outside the prefixes' => '<p>https://svitylo.com/atlas-old#s=z1.AAAA</p>',
            'not a share fragment' => '<p>https://svitylo.com/atlas#structure=cardiovascular.heart</p>',
            'an empty paragraph' => '<p>&nbsp;</p>',
        ] as $name => $html) {
            $this->assertSame($html, AnatomyHtml::transform($html, self::OPTIONS), $name);
        }
        // Without share_urls no paragraph changes.
        foreach ([[], ['share_urls' => []]] as $options) {
            $this->assertSame('<p>'.$link.'</p>', AnatomyHtml::transform('<p>'.$link.'</p>', $options));
        }
    }

    public function test_long_paragraphs(): void
    {
        // Every pattern matches in one way only: long runs of spaces never reach the PCRE backtrack limit.
        $spaces = str_repeat(" \u{00A0}&nbsp;<br>", 20000);
        $link = '<a href="'.self::LINK.'">'.self::LINK.'</a>';
        $this->assertSame(self::embed('z1.eJx-abc_09'), AnatomyHtml::transform('<p>'.$spaces.$link.$spaces.'</p>', self::OPTIONS));
        $this->assertSame(self::embed('z1.eJx-abc_09'), AnatomyHtml::transform('<p>'.$spaces.self::LINK.$spaces.'</p>', self::OPTIONS));
        foreach (['<p>'.$link.$spaces.'x</p>', '<p>'.self::LINK.$spaces.'x</p>'] as $html) {
            $this->assertSame($html, AnatomyHtml::transform($html, self::OPTIONS));
        }
        // A paragraph without its end tag ends where the next one starts.
        $open = str_repeat('<p>Текст', 20000);
        $this->assertSame($open.self::embed('z1.eJx-abc_09'), AnatomyHtml::transform($open.'<p>'.$link.'</p>', self::OPTIONS));
    }

    public function test_html_of_another_markdown_renderer_gives_what_the_extension_renders(): void
    {
        // TestCase: share_urls https://svitylo.com/atlas.
        $anatomy = $this->app->make(SvityloAnatomy::class);
        foreach (self::fixtures()['markdown'] as $case) {
            $html = $anatomy->html((string) (new GithubFlavoredMarkdownConverter())->convert($case['markdown']));
            $this->assertSame($anatomy->markdown($case['markdown']), $html, $case['name']);
            if ($case['state'] !== null) {
                $this->assertStringContainsString(' state="'.$case['state'].'"', $html, $case['name']);
            }
        }
    }

    public function test_a_sanitized_note_of_a_rich_text_editor(): void
    {
        // CKEditor: an AutoLink paragraph and a code block with <br>. The sanitizer writes `=` as
        // `&#61;`, `&nbsp;` as U+00A0 and `<br>` as `<br />`.
        $note = '<p><a href="https://svitylo.com/atlas/?lang=uk&amp;x=1#s=z1.AAAA">https://svitylo.com/atlas/?lang=uk&amp;x=1#s=z1.AAAA</a>&nbsp;</p>'
            .'<pre><code class="language-anatomy">structure: cardiovascular.heart<br>label: Серце</code></pre>';
        $clean = (new HtmlSanitizer(AnatomySanitizer::allowBlocks((new HtmlSanitizerConfig())->allowSafeElements())))->sanitize($note);
        $this->assertStringContainsString('s&#61;z1.AAAA', $clean);
        $embed = '<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="'.self::DATA_URL.'"';
        $this->assertSame(
            $embed.' state="z1.AAAA"></svitylo-anatomy></figure>'.$embed.' structure="cardiovascular.heart" label="Серце"></svitylo-anatomy></figure>',
            $this->app->make(SvityloAnatomy::class)->html($clean),
        );
    }
}
