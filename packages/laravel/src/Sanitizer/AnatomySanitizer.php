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

namespace Authorod\SvityloAnatomy\Sanitizer;

use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

/**
 * Symfony HtmlSanitizer rules. Recommended order: sanitize the note with `allowBlocks()` (the
 * ```anatomy blocks are plain `pre`/`code` elements), then turn the blocks into embeds with
 * `AnatomyHtml::transform()` — the embed markup is produced by this package after sanitizing.
 * `allowEmbeds()` is for pipelines that must sanitize already rendered embeds.
 */
final class AnatomySanitizer
{
    /** Attributes of <svitylo-anatomy> an embed may carry (all others are dropped). */
    public const EMBED_ATTRIBUTES = ['layout', 'data-url', 'structure', 'system', 'surroundings', 'view', 'state', 'label', 'height', 'lang', 'latin'];

    /** Keeps ```anatomy blocks: `pre` and `code` with its `class` (language-anatomy). */
    public static function allowBlocks(HtmlSanitizerConfig $config): HtmlSanitizerConfig
    {
        return $config->allowElement('pre')->allowElement('code', ['class']);
    }

    /**
     * Also keeps rendered embeds (`figure.svitylo-anatomy-embed` with <svitylo-anatomy>). An embed
     * in the input never chooses its own layout or data folder: `layout` is always `embed`, and
     * `data-url` is `$dataUrl` (the site's own folder, e.g. `config('svitylo-anatomy.data_url')`)
     * or, without it, dropped, so the atlas uses its default folder.
     */
    public static function allowEmbeds(HtmlSanitizerConfig $config, ?string $dataUrl = null): HtmlSanitizerConfig
    {
        $own = $dataUrl !== null && $dataUrl !== '';
        $config = self::allowBlocks($config)
            ->allowElement('figure', ['class'])
            ->allowElement('figcaption')
            ->allowElement('svitylo-anatomy', $own ? self::EMBED_ATTRIBUTES : array_values(array_diff(self::EMBED_ATTRIBUTES, ['data-url'])))
            ->forceAttribute('svitylo-anatomy', 'layout', 'embed');

        return $own ? $config->forceAttribute('svitylo-anatomy', 'data-url', $dataUrl) : $config;
    }
}
