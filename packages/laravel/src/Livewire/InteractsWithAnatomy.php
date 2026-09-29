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

namespace Authorod\SvityloAnatomy\Livewire;

/**
 * For Livewire components: `$this->anatomy('atlas')->showStructure('cardiovascular.heart')`.
 * Events of the atlas reach components as Livewire events `anatomy-select`,
 * `anatomy-surroundings` and `anatomy-statechange` (listen with `#[On('anatomy-select')]`); their
 * parameters are the fields of the atlas event plus `atlas` (the element id).
 */
trait InteractsWithAnatomy
{
    /** Commands for the atlas with this element id (null: the first atlas on the page). */
    protected function anatomy(?string $atlas = null): AnatomyCommands
    {
        return new AnatomyCommands($this, $atlas);
    }
}
