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

use Authorod\SvityloAnatomy\Embed\BlockParser;
use Authorod\SvityloAnatomy\Embed\EmbedRenderer;
use PHPUnit\Framework\Attributes\DataProvider;

/** The PHP parser and renderer give exactly the results of the JavaScript ones. */
final class BlockFixturesTest extends TestCase
{
    public static function cases(): iterable
    {
        foreach (self::fixtures()['cases'] as $case) {
            yield $case['name'] => [$case];
        }
    }

    #[DataProvider('cases')]
    public function test_block(array $case): void
    {
        $result = BlockParser::parse($case['block']);
        if (isset($case['errors'])) {
            $this->assertNull($result->spec);
            $this->assertSame($case['errors'], $result->errors);

            return;
        }
        $this->assertSame([], $result->errors);
        $this->assertEquals($case['spec'], $result->spec->toArray());
        $this->assertSame($case['warnings'] ?? [], $result->warnings);
        $this->assertSame($case['html'], EmbedRenderer::render($result->spec, ['data_url' => self::fixtures()['options']['dataUrl']]));
        // A block written back from its spec parses to the same spec.
        $this->assertEquals($result->spec, BlockParser::parse(BlockParser::format($result->spec))->spec);
    }

    public function test_long_lines(): void
    {
        // The value pattern starts with a non-space, so these lines do not backtrack (before, the
        // first one ran into the PCRE backtrack limit).
        $this->assertSame(['syntax'], BlockParser::parse('label:'.str_repeat(' ', 200000)."x\u{2028}y")->errors);
        $result = BlockParser::parse('structure:'.str_repeat(' ', 200000).'cardiovascular.heart');
        $this->assertSame(['structure' => 'cardiovascular.heart'], $result->spec?->toArray());
    }

    public function test_rules_match_the_javascript_package(): void
    {
        $source = (string) file_get_contents(__DIR__.'/../../markdown/src/block.ts');
        $this->assertStringContainsString('STRUCTURE_ID_PATTERN = '.trim(BlockParser::STRUCTURE_ID_PATTERN, '/').';', str_replace(['/^', '$/'], ['^', '$'], $source));
        $this->assertStringContainsString('MAX_STATE_LENGTH = 32_768', $source);
        $this->assertSame(32768, BlockParser::MAX_STATE_LENGTH);
        $this->assertStringContainsString("EMBED_VIEWS = ['".implode("', '", BlockParser::VIEWS)."']", $source);
    }
}
