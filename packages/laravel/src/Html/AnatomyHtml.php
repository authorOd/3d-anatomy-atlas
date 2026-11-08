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

namespace Authorod\SvityloAnatomy\Html;

use Authorod\SvityloAnatomy\Embed\BlockParser;
use Authorod\SvityloAnatomy\Embed\EmbedRenderer;
use Authorod\SvityloAnatomy\Embed\EmbedSpec;
use Authorod\SvityloAnatomy\Embed\ShareLink;

/**
 * Turns parts of stored or rendered HTML (a rich text editor that stores HTML, any Markdown
 * renderer, sanitized content) into embeds:
 * - `<pre><code class="language-anatomy">…</code></pre>` blocks, where a `<br>` is a line break
 *   (CKEditor stores the lines of a code block so);
 * - with `share_urls`, paragraphs that hold nothing but one share link of those atlas pages (an
 *   autolink that shows its own address, or the address as text; spaces, `&nbsp;` and `<br>`
 *   around it do not count), as the league/commonmark extension does.
 * Run it after the HTML sanitizer: the blocks are plain `pre`/`code` elements until here.
 * Blocks whose code contains other markup, invalid blocks and other paragraphs are left unchanged.
 */
final class AnatomyHtml
{
    private const BLOCK = '#<pre\b[^>]*>\s*<code\b([^>]*)>(.*?)</code>\s*</pre>#is';

    /**
     * The content never runs past the next `<p>`: a paragraph without its end tag (HTML allows
     * that) ends there, and the text is scanned once, not once for every such paragraph.
     */
    private const PARAGRAPH = '#<p(?:\s[^<>]*)?>((?:(?!</?p[\s>]).)*+)</p>#is';

    /** `<br>`, `<br/>`, `<br />` and the line break right after it, if any. */
    private const BREAK = '#<br\s*/?>(?:\r?\n)?#i';

    /**
     * One `<a>` without markup in its text, between spaces and no-break spaces. Anchored, and every
     * repeat is possessive: the pattern matches in one way only (no polynomial backtracking).
     */
    private const LINK = '#^(?:\s|&(?:nbsp|\#160|\#xa0);)*+<a\s([^>]*+)>([^<]*+)</a>(?:\s|&(?:nbsp|\#160|\#xa0);)*+$#iu';

    /** @param array{data_url?: ?string, lang?: ?string, share_urls?: list<string>, attributes?: array<string, string|bool>} $options */
    public static function transform(string $html, array $options = []): string
    {
        $html = preg_replace_callback(self::BLOCK, static function (array $m) use ($options): string {
            // CKEditor stores the lines of a code block with <br>; other markup leaves the block alone.
            $code = preg_replace(self::BREAK, "\n", $m[2]) ?? $m[2];
            if (! self::hasAnatomyClass($m[1]) || str_contains($code, '<')) {
                return $m[0];
            }
            $spec = BlockParser::parse(self::decode($code))->spec;

            return $spec !== null ? EmbedRenderer::render($spec, $options) : $m[0];
        }, $html) ?? $html;

        $prefixes = $options['share_urls'] ?? [];
        if ($prefixes === []) {
            return $html;
        }

        return preg_replace_callback(self::PARAGRAPH, static function (array $m) use ($options, $prefixes): string {
            $url = self::loneUrl($m[1]);
            $token = $url !== null ? ShareLink::state($url, $prefixes) : null;

            return $token !== null ? EmbedRenderer::render(new EmbedSpec(state: $token), $options) : $m[0];
        }, $html) ?? $html;
    }

    /** URL of paragraph content that holds nothing but one link (an autolink or the address as text). */
    private static function loneUrl(string $content): ?string
    {
        // Line breaks around the link count as spaces.
        $content = preg_replace(self::BREAK, "\n", $content) ?? $content;
        if (preg_match(self::LINK, $content, $m) === 1) {
            $href = self::attribute($m[1], 'href');
            if ($href === null) {
                return null;
            }
            $href = self::decode($href);

            // Autolinks show their own address; a link with other text is kept.
            return rawurldecode(self::decode($m[2])) === rawurldecode($href) ? $href : null;
        }
        // The address as text: one word once the entities (`&amp;`, `&nbsp;`) are decoded.
        if (str_contains($content, '<') || preg_match('/^\s*+(\S++)\s*+$/u', self::decode($content), $m) !== 1) {
            return null;
        }

        return $m[1];
    }

    /** Value of an attribute. Attributes are read in order, so text inside another value never counts. */
    private static function attribute(string $attributes, string $name): ?string
    {
        preg_match_all('/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]*)))?/', $attributes, $all, PREG_SET_ORDER);
        foreach ($all as $a) {
            if (strtolower($a[1]) === $name) {
                return ($a[2] ?? '').($a[3] ?? '').($a[4] ?? '');
            }
        }

        return null;
    }

    private static function decode(string $html): string
    {
        return html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private static function hasAnatomyClass(string $attributes): bool
    {
        if (preg_match('/\bclass\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))/i', $attributes, $m) !== 1) {
            return false;
        }
        $classes = preg_split('/\s+/', trim(($m[1] ?? '').($m[2] ?? '').($m[3] ?? ''))) ?: [];

        return in_array('language-anatomy', $classes, true);
    }
}
