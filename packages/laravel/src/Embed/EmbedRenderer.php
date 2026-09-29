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

namespace Authorod\SvityloAnatomy\Embed;

/**
 * HTML of an embed — exactly the string of `renderAnatomyEmbed` (JavaScript) for the same spec:
 * `<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" …></svitylo-anatomy>
 * <figcaption>…</figcaption></figure>` without line breaks. Every value is escaped.
 */
final class EmbedRenderer
{
    public const CLASS_NAME = 'svitylo-anatomy-embed';

    private const ESCAPES = ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#39;'];

    /**
     * @param  array{data_url?: ?string, lang?: ?string, class?: ?string, attributes?: array<string, string|true>}  $options
     *                                                                                                                 `attributes` are added after the standard ones (e.g. `['wire:ignore' => true]`)
     */
    public static function render(EmbedSpec $spec, array $options = []): string
    {
        $html = '';
        foreach (self::attributes($spec, $options) as $name => $value) {
            $html .= $value === true ? " {$name}" : ' '.$name.'="'.self::escape($value).'"';
        }
        $caption = $spec->caption !== null ? '<figcaption>'.self::escape($spec->caption).'</figcaption>' : '';

        return '<figure class="'.self::escape($options['class'] ?? self::CLASS_NAME).'"><svitylo-anatomy'.$html.'></svitylo-anatomy>'.$caption.'</figure>';
    }

    /** @return array<string, string|true> */
    public static function attributes(EmbedSpec $spec, array $options = []): array
    {
        $attrs = ['layout' => 'embed'];
        $add = static function (string $name, string|int|null $value) use (&$attrs): void {
            if ($value !== null && $value !== '') {
                $attrs[$name] = (string) $value;
            }
        };
        $add('data-url', $options['data_url'] ?? null);
        $add('structure', $spec->structure);
        $add('system', $spec->system);
        $add('surroundings', $spec->surroundings);
        $add('view', $spec->view);
        $add('state', $spec->state);
        $add('label', $spec->label);
        $add('height', $spec->height);
        $add('lang', $spec->lang ?? ($options['lang'] ?? null));
        if ($spec->latin) {
            $attrs['latin'] = true;
        }
        foreach ($options['attributes'] ?? [] as $name => $value) {
            if ($value === false || $value === null) {
                continue;
            }
            if (preg_match('/^[a-z][a-z0-9:._-]*$/i', (string) $name) === 1 && ! isset($attrs[$name])) {
                $attrs[$name] = $value === true ? true : (string) $value;
            }
        }

        return $attrs;
    }

    public static function escape(string $text): string
    {
        return strtr($text, self::ESCAPES);
    }
}
