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

namespace Authorod\SvityloAnatomy\CommonMark;

use Authorod\SvityloAnatomy\Embed\BlockParser;
use League\CommonMark\Environment\EnvironmentBuilderInterface;
use League\CommonMark\Event\DocumentParsedEvent;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\ConfigurableExtensionInterface;
use League\Config\ConfigurationBuilderInterface;
use Nette\Schema\Expect;

/**
 * league/commonmark extension: ```anatomy blocks and paragraphs holding only an atlas share link
 * (from `share_urls`) become embeds; invalid blocks stay ordinary code blocks. The output is the
 * same as that of the markdown-it plugin.
 *
 *     $environment->addExtension(new AnatomyExtension(['data_url' => '/anatomy-data/1.1.0/']));
 *
 * Options (defaults given to the constructor, overridable with the `svitylo_anatomy` key of the
 * environment configuration): `data_url`, `lang`, `share_urls`, `attributes`.
 */
final class AnatomyExtension implements ConfigurableExtensionInterface
{
    /** @param array{data_url?: ?string, lang?: ?string, share_urls?: list<string>, attributes?: array<string, string|bool>} $defaults */
    public function __construct(private readonly array $defaults = [])
    {
    }

    public function configureSchema(ConfigurationBuilderInterface $builder): void
    {
        $builder->addSchema('svitylo_anatomy', Expect::structure([
            'data_url' => Expect::anyOf(Expect::string(), Expect::null())->default($this->defaults['data_url'] ?? null),
            'lang' => Expect::anyOf(...[...BlockParser::LANGS, null])->default($this->defaults['lang'] ?? null),
            'share_urls' => Expect::listOf('string')->default($this->defaults['share_urls'] ?? []),
            'attributes' => Expect::arrayOf(Expect::anyOf(Expect::string(), Expect::bool()), Expect::string())->default($this->defaults['attributes'] ?? []),
        ]));
    }

    public function register(EnvironmentBuilderInterface $environment): void
    {
        $renderer = new AnatomyRenderer();
        $environment->addRenderer(FencedCode::class, $renderer, 10);
        $environment->addRenderer(AnatomyEmbed::class, $renderer);
        $environment->addEventListener(DocumentParsedEvent::class, [$renderer, 'onDocumentParsed']);
    }
}
