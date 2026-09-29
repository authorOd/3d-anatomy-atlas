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
 * Parses the text of an ```anatomy block: flat `key: value` lines (see the package README).
 * The rules and error codes are those of `parseAnatomyBlock` in @authorod/svitylo-anatomy-markdown;
 * both implementations are checked against the shared fixtures (fixtures/blocks.json).
 */
final class BlockParser
{
    public const STRUCTURE_ID_PATTERN = '/^[a-z][a-z0-9_]*(?:\.[a-z0-9][a-z0-9_]*)*$/';
    public const MAX_ID_LENGTH = 160;
    public const MAX_STATE_LENGTH = 32768;
    public const MAX_SURROUNDINGS_LEVEL = 32;
    public const VIEWS = ['anterior', 'posterior', 'left', 'right', 'superior', 'inferior'];
    public const LANGS = ['uk', 'en', 'la'];
    public const HEIGHT_MIN = 160;
    public const HEIGHT_MAX = 2000;
    private const STATE_PATTERN = '/^(?:z1|j1)\.[A-Za-z0-9_-]+$/';
    private const TEXT_LIMITS = ['label' => 200, 'caption' => 500];
    private const CONTROL = '/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}]/u';
    /** JavaScript's String.prototype.trim() whitespace. */
    private const SPACE = '[\s\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';

    public static function parse(string $text): ParseResult
    {
        $errors = [];
        $warnings = [];
        $values = [];
        $seen = [];
        $fail = static function (string $key) use (&$errors): void {
            if (! in_array($key, $errors, true)) {
                $errors[] = $key;
            }
        };

        foreach (preg_split('/\r?\n/', $text) ?: [] as $raw) {
            $line = self::trim($raw);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            // The pattern of the JavaScript parser: `\s` is its whitespace, and a value never holds a
            // line terminator (CR, U+2028, U+2029), as `.` in JavaScript.
            if (preg_match('/^([a-z][a-z0-9-]*)'.self::SPACE.'*:'.self::SPACE.'*([^\r\n\x{2028}\x{2029}]*)$/iu', $line, $m) === 1 && preg_match('/^https?$/i', $m[1]) !== 1) {
                $key = strtolower($m[1]);
                $value = self::unquote($m[2]);
            } elseif (preg_match('#^https?://#i', $line) === 1) {
                $key = 'link';
                $value = $line;
            } else {
                $fail('syntax');
                continue;
            }
            if (isset($seen[$key])) {
                $warnings[] = $key;
                continue;
            }
            $seen[$key] = true;

            switch ($key) {
                case 'structure':
                case 'system':
                    self::isId($value) ? $values[$key] = $value : $fail($key);
                    break;
                case 'surroundings':
                    $level = preg_match('/^\d+$/', $value) === 1 ? (int) $value : 0;
                    $level >= 1 && $level <= self::MAX_SURROUNDINGS_LEVEL ? $values[$key] = $level : $fail($key);
                    break;
                case 'view':
                    in_array($value, self::VIEWS, true) ? $values[$key] = $value : $fail($key);
                    break;
                case 'state':
                    self::isState($value) ? $values['state'] = $value : $fail($key);
                    break;
                case 'link':
                    $token = ShareLink::state($value);
                    $token !== null ? $values['state'] = $token : $fail($key);
                    break;
                case 'label':
                case 'caption':
                    $value !== '' && self::jsLength($value) <= self::TEXT_LIMITS[$key] && preg_match(self::CONTROL, $value) !== 1
                        ? $values[$key] = $value
                        : $fail($key);
                    break;
                case 'height':
                    $height = preg_match('/^\d+$/', $value) === 1 ? (int) $value : 0;
                    $height >= self::HEIGHT_MIN && $height <= self::HEIGHT_MAX ? $values[$key] = $height : $fail($key);
                    break;
                case 'lang':
                    in_array($value, self::LANGS, true) ? $values[$key] = $value : $fail($key);
                    break;
                case 'latin':
                    if (preg_match('/^(true|yes|on)$/i', $value) === 1) {
                        $values['latin'] = true;
                    } elseif (preg_match('/^(false|no|off)$/i', $value) !== 1) {
                        $fail($key);
                    }
                    break;
                default:
                    $warnings[] = $key;
            }
        }
        if ($errors === [] && ! isset($values['state']) && ! isset($values['structure']) && ! isset($values['system'])) {
            $errors[] = 'empty';
        }

        return new ParseResult($errors === [] ? EmbedSpec::fromArray($values) : null, $errors, $warnings);
    }

    /** Block text for a spec, in the key order of `formatAnatomyBlock` (JavaScript). */
    public static function format(EmbedSpec $spec): string
    {
        $lines = [];
        foreach (['label', 'structure', 'system', 'surroundings', 'view', 'state', 'caption', 'height', 'lang'] as $key) {
            $value = $spec->{$key};
            if ($value !== null && $value !== '') {
                $lines[] = "{$key}: {$value}";
            }
        }
        if ($spec->latin) {
            $lines[] = 'latin: true';
        }

        return implode("\n", $lines);
    }

    public static function isId(string $value): bool
    {
        return strlen($value) <= self::MAX_ID_LENGTH && preg_match(self::STRUCTURE_ID_PATTERN, $value) === 1;
    }

    public static function isState(string $value): bool
    {
        return strlen($value) <= self::MAX_STATE_LENGTH && preg_match(self::STATE_PATTERN, $value) === 1;
    }

    public static function trim(string $value): string
    {
        return preg_replace('/^'.self::SPACE.'+|'.self::SPACE.'+$/u', '', $value) ?? trim($value);
    }

    private static function unquote(string $value): string
    {
        $v = self::trim($value);
        if (strlen($v) >= 2 && (($v[0] === '"' && str_ends_with($v, '"')) || ($v[0] === "'" && str_ends_with($v, "'")))) {
            return substr($v, 1, -1);
        }

        return $v;
    }

    /** Length in UTF-16 code units, as JavaScript counts it. */
    private static function jsLength(string $value): int
    {
        return intdiv(strlen((string) mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')), 2);
    }
}
