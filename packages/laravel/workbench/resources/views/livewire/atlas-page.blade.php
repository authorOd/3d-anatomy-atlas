{{--
SPDX-License-Identifier: CPAL-1.0

The contents of this file are subject to the Common Public Attribution License
Version 1.0 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
https://opensource.org/license/CPAL-1.0 and in the accompanying LICENSE.md.
The License is based on the Mozilla Public License Version 1.1 but Sections 14
and 15 have been added to cover use of software over a computer network and
provide for limited attribution for the Original Developer. In addition,
Exhibit A has been modified to be consistent with Exhibit B.

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
the specific language governing rights and limitations under the License.

The Original Code is Svitylo 3D Anatomy Atlas.
The Original Developer is the Initial Developer.
The Initial Developer of the Original Code is authorOd.
All portions of the code written by authorOd are Copyright (c) 2026 authorOd.
All Rights Reserved.
Contributor(s): see the source history and accompanying copyright notices.
--}}
<div>
    <button id="show-heart" type="button" wire:click="showHeart">Серце</button>
    <button id="show-skeleton" type="button" wire:click="showSkeleton">Скелет ззаду</button>
    <button id="increment" type="button" wire:click="increment">+1</button>
    <output id="count">{{ $count }}</output>
    <output id="selected">{{ $selected ?? '—' }}</output>
    <a id="to-note" href="/note" wire:navigate>Конспект</a>
    <x-svitylo-anatomy id="atlas" style="display:block;height:520px" />
</div>
