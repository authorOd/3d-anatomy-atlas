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

/**
 * Turns `<pre><code class="language-anatomy">…</code></pre>` blocks of stored or rendered HTML
 * (a rich text editor that stores HTML, any Markdown renderer, sanitized content) into embeds.
 * Run it after the HTML sanitizer: the blocks are plain `pre`/`code` elements until here.
 * Blocks whose code contains markup, and invalid blocks, are left unchanged.
 */
final class AnatomyHtml
{
    private const BLOCK = '#<pre\b[^>]*>\s*<code\b([^>]*)>(.*?)</code>\s*</pre>#is';

    /** @param array{data_url?: ?string, lang?: ?string, attributes?: array<string, string|bool>} $options */
    public static function transform(string $html, array $options = []): string
    {
        return preg_replace_callback(self::BLOCK, static function (array $m) use ($options): string {
            if (! self::hasAnatomyClass($m[1]) || str_contains($m[2], '<')) {
                return $m[0];
            }
            $text = html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $spec = BlockParser::parse($text)->spec;

            return $spec !== null ? EmbedRenderer::render($spec, $options) : $m[0];
        }, $html) ?? $html;
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
