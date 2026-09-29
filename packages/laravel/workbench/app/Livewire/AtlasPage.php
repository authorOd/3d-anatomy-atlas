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

namespace Workbench\App\Livewire;

use Authorod\SvityloAnatomy\Livewire\InteractsWithAnatomy;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\On;
use Livewire\Component;

/** The full atlas driven from PHP (commands) and reporting back (events). */
final class AtlasPage extends Component
{
    use InteractsWithAnatomy;

    public ?string $selected = null;

    public int $count = 0;

    public function showHeart(): void
    {
        $this->anatomy('atlas')->showStructure('cardiovascular.heart');
    }

    public function showSkeleton(): void
    {
        $this->anatomy('atlas')->showSystem('skeletal')->setView('posterior');
    }

    public function increment(): void
    {
        $this->count++;
    }

    #[On('anatomy-select')]
    public function onSelect(?string $primary = null, ?string $atlas = null): void
    {
        if ($atlas === 'atlas') {
            $this->selected = $primary;
        }
    }

    public function render(): View
    {
        return view('livewire.atlas-page');
    }
}
