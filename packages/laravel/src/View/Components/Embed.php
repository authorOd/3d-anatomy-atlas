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

namespace Authorod\SvityloAnatomy\View\Components;

use Authorod\SvityloAnatomy\Embed\EmbedSpec;
use Authorod\SvityloAnatomy\SvityloAnatomy;
use Illuminate\Contracts\View\View;
use Illuminate\View\Component;

/**
 * `<x-svitylo-anatomy-embed structure="cardiovascular.heart" surroundings="2" label="Heart" />`
 * — one embed (placeholder until the reader starts it), rendered like an ```anatomy block.
 * Invalid values render nothing.
 */
final class Embed extends Component
{
    public ?string $html;

    public function __construct(
        SvityloAnatomy $anatomy,
        ?string $structure = null,
        ?string $system = null,
        int|string|null $surroundings = null,
        ?string $view = null,
        ?string $state = null,
        ?string $label = null,
        ?string $caption = null,
        int|string|null $height = null,
        ?string $lang = null,
        bool $latin = false,
    ) {
        $level = self::wholeNumber($surroundings);
        $size = self::wholeNumber($height);
        if ($level === false || $size === false) {
            $this->html = null;

            return;
        }
        // Validated like an ```anatomy block (PHP 8.2 syntax: no member access on `new` without parentheses).
        $spec = new EmbedSpec($structure, $system, $level, $view, $state, $label, $caption, $size, $lang, $latin);
        $this->html = $anatomy->embed($spec->toArray());
    }

    /** A number attribute: null when absent, false when it is not a whole number. */
    private static function wholeNumber(int|string|null $value): int|false|null
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value)) {
            return $value;
        }

        return preg_match('/^\d+$/', $value) === 1 ? (int) $value : false;
    }

    public function render(): View
    {
        return view('svitylo-anatomy::components.embed');
    }
}
