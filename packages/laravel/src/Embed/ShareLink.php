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
 * State token of an atlas share link (`…#s=z1.…`). Only the token is ever used: the address of
 * the link is not trusted as a data URL.
 */
final class ShareLink
{
    /**
     * @param  list<string>|null  $allowedPrefixes  atlas pages whose links are accepted (null: any
     *                                              http(s) link, as inside an ```anatomy block)
     */
    public static function state(string $url, ?array $allowedPrefixes = null): ?string
    {
        $url = BlockParser::trim($url);
        $parts = parse_url($url);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }
        $scheme = strtolower($parts['scheme']);
        if ($scheme !== 'https' && $scheme !== 'http') {
            return null;
        }
        if ($allowedPrefixes !== null) {
            $port = isset($parts['port']) && $parts['port'] !== ($scheme === 'https' ? 443 : 80) ? ':'.$parts['port'] : '';
            $page = $scheme.'://'.strtolower($parts['host']).$port.($parts['path'] ?? '/');
            $allowed = false;
            foreach ($allowedPrefixes as $prefix) {
                $p = rtrim($prefix, '/');
                if ($page === $p || $page === $p.'/' || str_starts_with($page, $p.'/')) {
                    $allowed = true;
                    break;
                }
            }
            if (! $allowed) {
                return null;
            }
        }
        foreach (explode('&', $parts['fragment'] ?? '') as $pair) {
            [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
            if (urldecode($key) === 's') {
                $token = urldecode($value);

                return BlockParser::isState($token) ? $token : null;
            }
        }

        return null;
    }
}
