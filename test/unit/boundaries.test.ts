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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO } from './helpers.js';

const SRC = join(REPO, 'packages/atlas/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]!);
}

describe('module boundaries', () => {
  it('core has no UI dependencies (no Lit, no UI modules, no Svitylo services)', () => {
    for (const file of files(join(SRC, 'core'))) {
      for (const spec of imports(file)) {
        expect(spec, relative(REPO, file)).not.toMatch(/^lit|\/ui\//);
      }
    }
  });

  it('schema depends only on zod', () => {
    for (const file of files(join(SRC, 'schema'))) {
      for (const spec of imports(file)) {
        expect(spec.startsWith('.') || spec === 'zod', `${relative(REPO, file)} imports ${spec}`).toBe(true);
      }
    }
  });

  it('no module reaches external hosts or sends telemetry', () => {
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(REPO, file)).not.toMatch(/sendBeacon|google-analytics|googletagmanager|fonts\.googleapis|unpkg\.com|jsdelivr/);
    }
  });

  it('branding has no switch to hide or retarget it', () => {
    const element = readFileSync(join(SRC, 'ui/atlas-element.ts'), 'utf8');
    const styles = readFileSync(join(SRC, 'ui/styles.ts'), 'utf8');
    expect(element).not.toMatch(/(hide|no|disable)-?brand|brand(ing)?-?(url|href|hidden|off)/i);
    const brandRule = /a\.brand\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '';
    expect(brandRule).not.toMatch(/var\(/);
  });
});
