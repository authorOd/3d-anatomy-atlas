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
 * One atlas embed, as described by an ```anatomy block (the same fields as `AnatomyEmbedSpec`
 * of @authorod/svitylo-anatomy-markdown). Values are validated by {@see BlockParser}.
 */
final class EmbedSpec
{
    public function __construct(
        public readonly ?string $structure = null,
        public readonly ?string $system = null,
        public readonly ?int $surroundings = null,
        public readonly ?string $view = null,
        public readonly ?string $state = null,
        public readonly ?string $label = null,
        public readonly ?string $caption = null,
        public readonly ?int $height = null,
        public readonly ?string $lang = null,
        public readonly bool $latin = false,
    ) {
    }

    /** @param array<string, mixed> $values */
    public static function fromArray(array $values): self
    {
        return new self(
            structure: $values['structure'] ?? null,
            system: $values['system'] ?? null,
            surroundings: isset($values['surroundings']) ? (int) $values['surroundings'] : null,
            view: $values['view'] ?? null,
            state: $values['state'] ?? null,
            label: $values['label'] ?? null,
            caption: $values['caption'] ?? null,
            height: isset($values['height']) ? (int) $values['height'] : null,
            lang: $values['lang'] ?? null,
            latin: (bool) ($values['latin'] ?? false),
        );
    }

    /** Fields that are set, in the JSON shape of the JavaScript spec. @return array<string, mixed> */
    public function toArray(): array
    {
        return array_filter([
            'structure' => $this->structure,
            'system' => $this->system,
            'surroundings' => $this->surroundings,
            'view' => $this->view,
            'state' => $this->state,
            'label' => $this->label,
            'caption' => $this->caption,
            'height' => $this->height,
            'lang' => $this->lang,
            'latin' => $this->latin ?: null,
        ], static fn ($value) => $value !== null);
    }
}
