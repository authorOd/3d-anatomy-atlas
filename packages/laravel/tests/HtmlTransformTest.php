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

namespace Authorod\SvityloAnatomy\Tests;

use Authorod\SvityloAnatomy\Html\AnatomyHtml;

/** Stored HTML (rich text editors, other renderers). */
final class HtmlTransformTest extends TestCase
{
    public function test_blocks_of_stored_html_become_embeds(): void
    {
        $html = "<p>Текст</p><pre><code class=\"language-anatomy\">system: skeletal\nlabel: Скелет &amp; м&#039;язи</code></pre><p>Кінець</p>";
        $this->assertSame(
            '<p>Текст</p><figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/d/" system="skeletal" label="Скелет &amp; м&#39;язи"></svitylo-anatomy></figure><p>Кінець</p>',
            AnatomyHtml::transform($html, ['data_url' => '/d/']),
        );
    }

    public function test_other_blocks_markup_and_invalid_blocks_are_left_alone(): void
    {
        foreach ([
            '<pre><code class="language-js">let a;</code></pre>',
            '<pre><code class="language-anatomy"><b>structure: cardiovascular.heart</b></code></pre>',
            '<pre><code class="language-anatomy">structure: ../etc</code></pre>',
            '<pre><code>structure: cardiovascular.heart</code></pre>',
        ] as $html) {
            $this->assertSame($html, AnatomyHtml::transform($html));
        }
    }

    public function test_attribute_order_and_extra_classes_do_not_matter(): void
    {
        $html = "<pre class=\"x\"><code data-a=\"1\" class='hljs language-anatomy'>structure: cardiovascular.heart\n</code></pre>";
        $this->assertStringContainsString('structure="cardiovascular.heart"', AnatomyHtml::transform($html));
    }
}
