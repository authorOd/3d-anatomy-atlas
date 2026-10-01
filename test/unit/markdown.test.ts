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
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import {
  EMBED_VIEWS,
  MAX_ID_LENGTH,
  MAX_STATE_LENGTH,
  MAX_SURROUNDINGS_LEVEL,
  STRUCTURE_ID_PATTERN,
  formatAnatomyBlock,
  parseAnatomyBlock,
  renderAnatomyEmbed,
  stateFromShareLink,
  type AnatomyEmbedSpec,
} from '@authorod/svitylo-anatomy-markdown';
import { anatomyPlugin } from '@authorod/svitylo-anatomy-markdown/markdown-it';
import fixtures from '@authorod/svitylo-anatomy-markdown/fixtures/blocks.json' with { type: 'json' };
import { STANDARD_VIEWS } from '@authorod/svitylo-3d-anatomy-atlas/core';
import { MAX_SURROUNDINGS_LEVEL as ATLAS_MAX_LEVEL, STATE_LIMITS } from '@authorod/svitylo-3d-anatomy-atlas/schema';
import * as primitives from '../../packages/atlas/src/schema/primitives.js';

interface BlockCase {
  name: string;
  block: string;
  spec?: AnatomyEmbedSpec;
  errors?: string[];
  warnings?: string[];
  html?: string;
}

const cases = fixtures.cases as BlockCase[];
const options = fixtures.options;
const md = () => new MarkdownIt({ linkify: true }).use(anatomyPlugin, options);

describe('```anatomy blocks (shared fixtures)', () => {
  for (const c of cases) {
    it(c.name, () => {
      const result = parseAnatomyBlock(c.block);
      if (c.errors) {
        expect(result.spec).toBeNull();
        expect(result.errors).toEqual(c.errors);
        return;
      }
      expect(result.errors).toEqual([]);
      expect(result.spec).toEqual(c.spec);
      expect(result.warnings).toEqual(c.warnings ?? []);
      expect(renderAnatomyEmbed(result.spec!, options)).toBe(c.html);
      // A block written back from its spec parses to the same spec.
      expect(parseAnatomyBlock(formatAnatomyBlock(result.spec!)).spec).toEqual(result.spec);
    });
  }
});

describe('long input', () => {
  // Patterns that backtrack polynomially took seconds here (CodeQL js/polynomial-redos).
  it('a long line with a line separator inside parses in linear time', () => {
    const started = performance.now();
    expect(parseAnatomyBlock(`label:${' '.repeat(200_000)}x\u2028y`).errors).toEqual(['syntax']);
    expect(parseAnatomyBlock(`structure:${' '.repeat(200_000)}cardiovascular.heart`).spec).toEqual({ structure: 'cardiovascular.heart' });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('an allowed prefix with a long run of slashes is checked in linear time', () => {
    const started = performance.now();
    expect(stateFromShareLink('https://svitylo.com/atlas#s=z1.AAAA', [`https://svitylo.com${'/'.repeat(200_000)}x`])).toBeNull();
    expect(stateFromShareLink('https://svitylo.com/atlas#s=z1.AAAA', [`https://svitylo.com/atlas${'/'.repeat(200_000)}`])).toBe('z1.AAAA');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('markdown-it plugin', () => {
  it('renders valid blocks as embeds and keeps invalid ones as code', () => {
    for (const c of cases) {
      const html = md().render(`Текст\n\n\`\`\`anatomy\n${c.block}\n\`\`\`\n`);
      if (c.html) expect(html).toContain(`${c.html}\n`);
      else {
        expect(html).not.toContain('<svitylo-anatomy');
        expect(html).toContain('<pre><code class="language-anatomy">');
      }
    }
  });

  it('turns a paragraph with only a share link of the configured atlas into an embed', () => {
    for (const c of fixtures.markdown) {
      const html = md().render(c.markdown);
      if (c.state) {
        expect(html).toContain(`<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/anatomy-data/1.0.0/" state="${c.state}"></svitylo-anatomy></figure>`);
      } else {
        expect(html).not.toContain('<svitylo-anatomy');
      }
    }
  });

  it('never lets raw HTML through a block, even with html enabled', () => {
    const html = new MarkdownIt({ html: true }).use(anatomyPlugin).render('```anatomy\nstructure: cardiovascular.heart\nlabel: x" onmouseover="alert(1)\n```');
    expect(html).toContain('label="x&quot; onmouseover=&quot;alert(1)"');
    expect(html).not.toMatch(/onmouseover="alert/);
  });

  it('leaves other code blocks alone', () => {
    expect(md().render('```js\nconst a = 1;\n```')).toBe('<pre><code class="language-js">const a = 1;\n</code></pre>\n');
  });
});

describe('embed rules match the atlas', () => {
  it('uses the same IDs, state limits, levels and views as the atlas schema', () => {
    expect(STRUCTURE_ID_PATTERN.source).toBe(primitives.STRUCTURE_ID_PATTERN.source);
    expect(MAX_ID_LENGTH).toBe(primitives.MAX_ID_LENGTH);
    expect(MAX_STATE_LENGTH).toBe(STATE_LIMITS.maxEncodedLength);
    expect(MAX_SURROUNDINGS_LEVEL).toBe(ATLAS_MAX_LEVEL);
    expect([...EMBED_VIEWS]).toEqual([...STANDARD_VIEWS]);
  });
});
