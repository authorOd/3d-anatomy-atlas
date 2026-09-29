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

use Livewire\Component;

/**
 * Commands from a Livewire component to an atlas on the page, sent as the browser event
 * `anatomy-command` and run by the package's JavaScript bridge (`installLivewireBridge()` from
 * resources/js/livewire.js). Only the listed public methods of <svitylo-anatomy> can be called;
 * the bridge has the same list (checked by LivewireTest).
 */
final class AnatomyCommands
{
    public const METHODS = [
        'showStructure', 'showSystem', 'showSurroundings', 'setSurroundingsLevel', 'setTransparency',
        'exitSurroundings', 'select', 'focusOn', 'setView', 'setState', 'reset', 'loadAll', 'isolate',
        'clearIsolation', 'hide', 'show', 'showHidden',
    ];

    public function __construct(private readonly Component $component, private readonly ?string $atlas = null)
    {
    }

    public function showStructure(string $id): self
    {
        return $this->send('showStructure', [$id]);
    }

    public function showSystem(string $id): self
    {
        return $this->send('showSystem', [$id]);
    }

    public function showSurroundings(?string $id = null): self
    {
        return $this->send('showSurroundings', $id === null ? [] : [$id]);
    }

    /** 0 = only the selection … the whole body; null = automatic (everything placed on the scene). */
    public function setSurroundingsLevel(?int $level): self
    {
        return $this->send('setSurroundingsLevel', [$level]);
    }

    /** Transparency of everything that is not selected: 0 = opaque … 0.95. */
    public function setTransparency(float $value): self
    {
        return $this->send('setTransparency', [$value]);
    }

    public function exitSurroundings(): self
    {
        return $this->send('exitSurroundings', []);
    }

    /** @param list<string> $ids */
    public function select(array $ids): self
    {
        return $this->send('select', [array_values($ids)]);
    }

    /** @param list<string>|null $ids */
    public function focusOn(?array $ids = null): self
    {
        return $this->send('focusOn', $ids === null ? [] : [array_values($ids)]);
    }

    public function setView(string $view): self
    {
        return $this->send('setView', [$view]);
    }

    /** An encoded state (`z1.…`) or a state array (as returned by `getState()`). */
    public function setState(string|array $state): self
    {
        return $this->send('setState', [$state]);
    }

    public function reset(): self
    {
        return $this->send('reset', []);
    }

    public function loadAll(): self
    {
        return $this->send('loadAll', []);
    }

    /** @param list<string>|null $ids */
    public function isolate(?array $ids = null): self
    {
        return $this->send('isolate', $ids === null ? [] : [array_values($ids)]);
    }

    public function clearIsolation(): self
    {
        return $this->send('clearIsolation', []);
    }

    /** @param list<string> $ids */
    public function hide(array $ids): self
    {
        return $this->send('hide', [array_values($ids)]);
    }

    /** @param list<string> $ids */
    public function show(array $ids): self
    {
        return $this->send('show', [array_values($ids)]);
    }

    public function showHidden(): self
    {
        return $this->send('showHidden', []);
    }

    private function send(string $method, array $args): self
    {
        $this->component->dispatch('anatomy-command', atlas: $this->atlas, method: $method, args: $args);

        return $this;
    }
}
