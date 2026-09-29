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
use Authorod\SvityloAnatomy\Embed\EmbedRenderer;
use Authorod\SvityloAnatomy\Embed\EmbedSpec;
use Authorod\SvityloAnatomy\Embed\ShareLink;
use League\CommonMark\Event\DocumentParsedEvent;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Inline\Link;
use League\CommonMark\Extension\CommonMark\Renderer\Block\FencedCodeRenderer;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;
use League\Config\ConfigurationAwareInterface;
use League\Config\ConfigurationInterface;

/** @internal Renders embeds and finds share-link paragraphs. */
final class AnatomyRenderer implements NodeRendererInterface, ConfigurationAwareInterface
{
    private ConfigurationInterface $config;

    private FencedCodeRenderer $fallback;

    public function __construct()
    {
        $this->fallback = new FencedCodeRenderer();
    }

    public function setConfiguration(ConfigurationInterface $configuration): void
    {
        $this->config = $configuration;
    }

    public function render(Node $node, ChildNodeRendererInterface $childRenderer): \Stringable|string|null
    {
        if ($node instanceof AnatomyEmbed) {
            return $this->embed($node->spec);
        }
        if ($node instanceof FencedCode && ($node->getInfoWords()[0] ?? '') === 'anatomy') {
            $spec = BlockParser::parse($node->getLiteral())->spec;
            if ($spec !== null) {
                return $this->embed($spec);
            }
        }

        return $this->fallback->render($node, $childRenderer);
    }

    public function onDocumentParsed(DocumentParsedEvent $event): void
    {
        $prefixes = $this->config->get('svitylo_anatomy/share_urls');
        if ($prefixes === []) {
            return;
        }
        $paragraphs = [];
        foreach ($event->getDocument()->iterator() as $node) {
            if ($node instanceof Paragraph) {
                $paragraphs[] = $node;
            }
        }
        foreach ($paragraphs as $paragraph) {
            $url = self::loneUrl($paragraph);
            $token = $url !== null ? ShareLink::state($url, $prefixes) : null;
            if ($token !== null) {
                $paragraph->replaceWith(new AnatomyEmbed(new EmbedSpec(state: $token)));
            }
        }
    }

    /** URL of a paragraph that holds nothing but one link (plain text, autolink or GFM autolink). */
    private static function loneUrl(Paragraph $paragraph): ?string
    {
        $children = [];
        foreach ($paragraph->children() as $child) {
            if ($child instanceof Newline || ($child instanceof Text && BlockParser::trim($child->getLiteral()) === '')) {
                continue;
            }
            $children[] = $child;
        }
        if (count($children) !== 1) {
            return null;
        }
        $only = $children[0];
        if ($only instanceof Text) {
            return BlockParser::trim($only->getLiteral());
        }
        if ($only instanceof Link) {
            $text = '';
            foreach ($only->children() as $child) {
                if (! $child instanceof Text) {
                    return null;
                }
                $text .= $child->getLiteral();
            }
            // Autolinks show their own address; a link with other text is kept.
            return rawurldecode($text) === rawurldecode($only->getUrl()) || 'mailto:'.$text === $only->getUrl() ? $only->getUrl() : null;
        }

        return null;
    }

    private function embed(EmbedSpec $spec): string
    {
        return EmbedRenderer::render($spec, [
            'data_url' => $this->config->get('svitylo_anatomy/data_url'),
            'lang' => $this->config->get('svitylo_anatomy/lang'),
            'attributes' => $this->config->get('svitylo_anatomy/attributes'),
        ]);
    }
}
