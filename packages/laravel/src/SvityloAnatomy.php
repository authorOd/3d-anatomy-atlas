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

namespace Authorod\SvityloAnatomy;

use Authorod\SvityloAnatomy\CommonMark\AnatomyExtension;
use Authorod\SvityloAnatomy\Embed\BlockParser;
use Authorod\SvityloAnatomy\Embed\EmbedRenderer;
use Authorod\SvityloAnatomy\Embed\EmbedSpec;
use Authorod\SvityloAnatomy\Html\AnatomyHtml;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\MarkdownConverter;

/**
 * Entry point of the package (`app(SvityloAnatomy::class)`): Markdown with embeds, embeds in
 * stored HTML and single embeds, all with the options of config/svitylo-anatomy.php.
 */
final class SvityloAnatomy
{
    /** @param array{data_url?: ?string, lang?: ?string, share_urls?: list<string>, livewire?: bool} $config */
    public function __construct(private readonly array $config = [])
    {
    }

    /** Options for {@see EmbedRenderer} and {@see AnatomyHtml}. */
    public function options(): array
    {
        return [
            'data_url' => $this->config['data_url'] ?? null,
            'lang' => $this->config['lang'] ?? null,
            'share_urls' => array_values($this->config['share_urls'] ?? []),
            'attributes' => ($this->config['livewire'] ?? true) ? ['wire:ignore' => true] : [],
        ];
    }

    /** The league/commonmark extension configured like this package. */
    public function extension(): AnatomyExtension
    {
        return new AnatomyExtension($this->options());
    }

    /**
     * Markdown (CommonMark + GFM) to HTML with embeds. Raw HTML in the note is escaped and unsafe
     * links are dropped; pass other league/commonmark options in `$options`.
     *
     * @param  array<string, mixed>  $options
     */
    public function markdown(string $markdown, array $options = []): string
    {
        $environment = new Environment($options + ['html_input' => 'escape', 'allow_unsafe_links' => false]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new GithubFlavoredMarkdownExtension());
        $environment->addExtension($this->extension());

        return (string) (new MarkdownConverter($environment))->convert($markdown);
    }

    /** Embeds for the ```anatomy blocks of stored HTML (after sanitizing). */
    public function html(string $html): string
    {
        return AnatomyHtml::transform($html, $this->options());
    }

    /** One embed from a block text, a spec or its fields; null when the block is invalid. */
    public function embed(string|array|EmbedSpec $block): ?string
    {
        $spec = match (true) {
            $block instanceof EmbedSpec => $block,
            is_array($block) => self::specOf($block),
            default => BlockParser::parse($block)->spec,
        };

        return $spec !== null ? EmbedRenderer::render($spec, $this->options()) : null;
    }

    /**
     * Fields are validated as the lines of a block; a value with a line break is invalid (it
     * would read as more lines).
     *
     * @param  array<string, mixed>  $values
     */
    private static function specOf(array $values): ?EmbedSpec
    {
        foreach ($values as $value) {
            if (is_string($value) && preg_match('/[\r\n\x{2028}\x{2029}]/u', $value) === 1) {
                return null;
            }
        }

        return BlockParser::parse(BlockParser::format(EmbedSpec::fromArray($values)))->spec;
    }
}
