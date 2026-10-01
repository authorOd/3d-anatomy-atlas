# @authorod/svitylo-anatomy-markdown

3D atlas embeds in notes: the ```anatomy block, "Share" links, a markdown-it plugin and HTML/DOM
helpers. An embed is `<svitylo-anatomy layout="embed">` from
[@authorod/svitylo-3d-anatomy-atlas](../atlas/README.md): it loads nothing until the reader presses
"Show 3D". The server-side counterpart (league/commonmark, Laravel) is
[authorod/svitylo-anatomy-laravel](../laravel/README.md); both produce the same HTML (shared
fixtures `fixtures/blocks.json`).

> Terms: [LICENSE.md](LICENSE.md) (the same as for the library).

## Syntax

````md
```anatomy
structure: cardiovascular.heart
surroundings: 2
view: anterior
label: Heart
caption: The heart in its surroundings
```
````

| Key | Value |
| --- | --- |
| `structure` / `system` | ID of a structure or a system (used when there is no `state`) |
| `surroundings` | surroundings level 1–32 (1 = the nearest group that contains the structure; a level past the last one = the whole body): the structure or system is selected and shown with that level of its surroundings at the default transparency (78%) |
| `view` | `anterior` \| `posterior` \| `left` \| `right` \| `superior` \| `inferior` |
| `state` / `link` | the exact view: an encoded state (`z1.…`/`j1.…`) or a "Share" link (`…#s=…`); a link can also stand alone on a line, without a key |
| `label` | name on the placeholder before loading (≤ 200 characters) |
| `caption` | caption under the embed (≤ 500) |
| `height` | height in px (160–2000; default 420) |
| `lang` | names language `uk` \| `en` \| `la`; `latin: true` shows Latin names alongside |

Lines that start with `#` are comments. Unknown and repeated keys are ignored (with a warning). An
invalid block (a wrong ID, state or link, a value out of range) stays an ordinary code block: it
never turns into markup. The URL of a link is never used as a data address: only the encoded state
is taken from it.

A paragraph that holds nothing but a "Share" link of an atlas page listed in `shareUrls` also
becomes an embed: the author sets up the view in the atlas and just pastes the link (as plain text,
an autolink or a link whose text is its own address; a link with other text stays a link).

## markdown-it

```ts
import MarkdownIt from 'markdown-it';
import { anatomyPlugin } from '@authorod/svitylo-anatomy-markdown/markdown-it';

const md = new MarkdownIt({ linkify: true }).use(anatomyPlugin, {
  dataUrl: '/anatomy-data/1.1.0/', // data-url of the embeds (default: the atlas default)
  lang: 'uk',                             // names language when a block does not set one
  shareUrls: ['https://svitylo.com/atlas'],
});
md.render(note);
```

Output:

```html
<figure class="svitylo-anatomy-embed"><svitylo-anatomy layout="embed" data-url="/anatomy-data/1.1.0/"
  structure="cardiovascular.heart" surroundings="2" view="anterior" label="Heart" lang="uk"></svitylo-anatomy>
  <figcaption>The heart in its surroundings</figcaption></figure>
```

(on one line; all values are escaped.)

## HTML and DOM

- `renderAnatomyEmbed(spec, options)`: the HTML string for a parsed block.
- `parseAnatomyBlock(text)` → `{ spec, errors, warnings }`; `formatAnatomyBlock(spec)` does the
  reverse.
- `upgradeAnatomyBlocks(root, options)`: in ready HTML (a rich text editor, another Markdown
  engine, sanitized content) replaces `<pre><code class="language-anatomy">` with embeds through the DOM API
  (no HTML parsing; works under a strict CSP and Trusted Types). Running it again does nothing.
- `createEmbedElement(spec, options)`: the embed element.

The order with a sanitizer: sanitize the content first (```anatomy blocks are ordinary `pre`/`code`
elements), then turn the blocks into embeds. This way the sanitizer does not have to allow custom
elements.

Demo: `apps/demo/notes.html` (`pnpm demo:dev`, `/notes.html`).

## Licence and contributions

The project's own code is licensed under [CPAL-1.0](LICENSE.md). Independent code in
a Larger Work may remain closed; CPAL source and attribution obligations apply to
the covered atlas code and its modifications. Data and dependencies retain their
own licences. See the repository's [licensing guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/docs/licensing.md) and
[language contribution guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/CONTRIBUTING.md). Partial translation drafts
can be proposed through a PR; a new language also needs runtime integration.
