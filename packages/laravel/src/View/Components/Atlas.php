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

use Illuminate\Contracts\View\View;
use Illuminate\View\Component;

/**
 * `<x-svitylo-anatomy />` — the full atlas. Other attributes (class, style, id, ui-lang, latin,
 * quality, share-base-url…) are passed to <svitylo-anatomy>. The element carries `wire:ignore`:
 * Livewire updates never touch the 3D scene; talk to it with commands and events instead.
 */
final class Atlas extends Component
{
    public function __construct(
        public ?string $dataUrl = null,
        public ?string $lang = null,
        public ?string $state = null,
        public bool $livewire = true,
    ) {
        $this->dataUrl ??= config('svitylo-anatomy.data_url');
        $this->lang ??= config('svitylo-anatomy.lang');
    }

    public function render(): View
    {
        return view('svitylo-anatomy::components.atlas');
    }
}
