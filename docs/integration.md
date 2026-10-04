# Integration

The library is a plain ES module and a standard Web Component. It needs only static data files on
the site's host (or on an explicitly set CDN) and a browser with WebGL2. There are no requests to
Svitylo servers, no telemetry, and no third-party fonts or decoders from a CDN.

## 1. Installation

```sh
pnpm add @authorod/svitylo-3d-anatomy-atlas
# or npm install / yarn add
```

The main package depends on an exactly pinned version of the data package
`@authorod/svitylo-3d-anatomy-data`, so the data is installed automatically. No `postinstall` step
changes the files of your project: the data is copied only by an explicit command.

## 2. Exporting the data to the site's public folder

```sh
pnpm exec svitylo-anatomy export-assets public/anatomy-data --prune
# with npm: npx svitylo-anatomy export-assets public/anatomy-data --prune
```

The command copies the installed release to `public/anatomy-data/<version>/`. It keeps the versioned
structure, `LICENSES.md`, `ATTRIBUTION.md`, the coverage report and `SHA256SUMS`, and verifies the
checksums before and after copying.

- Running it again with the same data changes nothing (`up to date`).
- Published versions are immutable: if the version folder already exists with different contents,
  the command stops. `--force` overwrites only this version.
- `--prune` removes the other versions once this one is in place: links open in the version the
  page loads, so nothing needs them. It touches only folders that hold a release of the same model,
  and in them only the files their `SHA256SUMS` lists; files the site added there stay. A page
  opened before the update gets its remaining files after a reload. Without `--prune`, other
  versions are never deleted.
- `--dry-run` shows what would be copied and removed; `svitylo-anatomy verify <release-dir>` checks a version
  that is already deployed; `svitylo-anatomy info` lists the installed versions.

You do not have to commit the exported files to the site's repository. It is simpler to run the
export before the build (see Vite below) and add `public/anatomy-data/` to `.gitignore`.

## 3. Vite

```jsonc
// package.json
{
  "scripts": {
    "atlas:assets": "svitylo-anatomy export-assets public/anatomy-data --prune",
    "dev": "npm run atlas:assets && vite",
    "build": "npm run atlas:assets && vite build"
  }
}
```

```ts
// src/main.ts
import '@authorod/svitylo-3d-anatomy-atlas';
```

```html
<svitylo-anatomy></svitylo-anatomy>  <!-- lang="uk" — Ukrainian; latin — Latin on a second line; theme="dark" — dark theme -->
```

Vite copies `public/` to `dist/` unchanged, so the GLB files stay separate files (they never need
to be bundled into JavaScript). The demo in `apps/demo` is set up exactly like this.

**A site that is not at the domain root.** Without `data-url` the component takes the data from
`/anatomy-data/<version>/` (from the site root). For a deployment in a subfolder, set the path
explicitly:

```ts
import { DEFAULT_DATA_VERSION } from '@authorod/svitylo-3d-anatomy-atlas';
atlas.setAttribute('data-url', `${import.meta.env.BASE_URL}anatomy-data/${DEFAULT_DATA_VERSION}/`);
```

### Other bundlers, or no bundler

The package is pure ESM (`dist/index.js`, `dist/core.js`, `dist/schema.js`, `dist/strict-csp.js`)
with the external dependencies `three`, `lit` and `zod`. It works with webpack, Rollup, esbuild and
Parcel without extra configuration. Without a bundler you need an import map for the bare imports
`three`, `three/addons/…`, `lit`, `lit/…` (and the Lit packages `lit-html`, `lit-element`,
`@lit/reactive-element`) and `zod`, pointing to files on your own host.

## 4. Size and layout

The component fills the height of its parent element (`height: 100%`, at least 420 px). A typical
rule:

```css
svitylo-anatomy { display: block; height: 100dvh; }
```

The layout adapts to the width of **the component itself** (container queries). On a wide screen
there is the top bar (64 px: search and the atlas actions — "Load everything", "Share", "Reset",
settings, fullscreen), the structure tree on the left, the selection column on the right, and the
3D scene between them with the camera bar at the bottom. The selection block at the top of the
right column holds the actions for the whole selection and the surroundings level ("Surroundings
level k of N" with − / + and the name of the level). The camera bar holds the views menu, zoom,
"Overall view" and the "Surroundings transparency" slider. The buttons at the ends of the top bar
collapse the side columns completely (the scene takes the freed space). The left column can be
resized by dragging its edge (220–520 px, also with the arrow keys). The right column keeps its
width when nothing is selected, so a selection does not change the size of the scene. The state of
the columns is not kept between visits.

Up to 820 px wide, the search stays at the top, the tree moves to the "Structures" drawer, the atlas
actions move to the settings menu, and the 3D scene takes all the remaining height except the
selection bar at the bottom (56 px and a line above it). On a 390×844 phone that is 723 px of scene
out of 844 (≈86%: 844 − 64 header − 57); on 360×780 it is ≈84%, on 412×915 ≈87%. Over the model
there are only the camera bar and the logo: the short logo (the Svitylo mark) in the top corner of
the scene, and at the bottom the camera bar, one block across the scene that ends with the
surroundings level, where wide layouts have the full logo. On a scene up to 540 px wide the camera
bar has no zoom buttons (pinch or the mouse wheel zooms), instead of the slider it has a button that
opens the "Surroundings transparency" slider above the bar, and the level shows "Level k of N" with
the level's name; on a scene too narrow for one row the level is the first row of the same block.
While it is open, the settings menu covers the mark.

On a narrow screen the details of the selected structures are in a **sheet** at the bottom. Its
bar ("Selected: 2 · Heart") is always there, so a selection does not change the size of the scene.
A selection only updates the bar; the user opens the sheet with a tap or a swipe up. The sheet
holds the tools of the selection block ("Centre", "Isolate", "Hide"; the level is on the camera
bar) and the cards. It opens over the scene (up to 68% of its height) without changing its size and
never covers the logo. A swipe down, Esc or the same bar closes the sheet.

Fullscreen uses the Fullscreen API or, where it is missing (iPhone), a pseudo-fullscreen mode over
the page. The component creates its own stacking context (`isolation: isolate`), so the logo and
the panels do not cover page elements above it.

## 5. Data on a CDN or another host

`data-url` is an allowed base for resources, not a backend. It must point to the folder of one
version (the one with `manifest.json`):

```html
<svitylo-anatomy data-url="https://cdn.example.com/anatomy-data/1.1.0/"></svitylo-anatomy>
```

- All paths from the manifest are resolved only inside this base (no `../`, absolute paths or URL
  schemes). The state of a link never sets a third-party `data-url`.
- Every link opens in the data of `data-url`, whatever version made it: IDs do not change between
  versions (renamed ones resolve through `aliases`), so the link shows the same structures, and the
  ones this data does not have are listed in a notice. Only a link of another anatomical model is
  refused.

### CORS

For data on another origin the server must answer `GET` with the header:

```
Access-Control-Allow-Origin: https://your-site.example
```

Requests use `credentials: 'same-origin'`, so no cookies are sent to another origin and
`Access-Control-Allow-Credentials` is not needed.

### Caching

The files of a version are immutable, so they can be cached forever:

```
/anatomy-data/<version>/*   Cache-Control: public, max-age=31536000, immutable
```

The cache does not replace verification: every file is checked against its size and SHA-256 from
the manifest. SHA-256 is computed
with Web Crypto, which is available only in a secure context (HTTPS or `localhost`); on an insecure
origin only the size check remains. For `.glb`, `Content-Type: model/gltf-binary` is preferred.
Compressing GLB files with gzip or brotli gains little (the data is already compressed with
meshopt); compressing JSON is worth it.

## 6. Content-Security-Policy

The minimal policy under which the component works without a single violation (checked by the test
`e2e/csp.spec.ts`):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
connect-src 'self';          # + the origin of the data CDN, if the data is not on your host
img-src 'self' data: blob:;
worker-src 'none';
object-src 'none';
base-uri 'none'
```

- **`'wasm-unsafe-eval'`** is needed by the meshopt decoder (WebAssembly built into Three.js;
  nothing is loaded from outside). Without it the model files are not decoded (error
  `FORMAT_UNSUPPORTED`).
- **Workers** are not used.
- **Styles:** the component uses no inline `style` attributes; the Shadow DOM styles come from
  constructable stylesheets. For browsers without them Lit adds a `<style>` element; in that case
  set a nonce with `window.litNonce`.
- **`'unsafe-eval'` is not needed.** The Zod validation library checks once whether `eval` is
  allowed and, under the CSP, falls back to an interpreter; the browser then sends one `script-src`
  report. To avoid the report, import a separate entry point before the atlas:

  ```ts
  import '@authorod/svitylo-3d-anatomy-atlas/strict-csp'; // the first import
  import '@authorod/svitylo-3d-anatomy-atlas';
  ```

  It switches Zod to `jitless` mode (globally for Zod on the page; it only turns off the generated
  fast paths).
- The logo and the attribution links are plain links with `rel="noopener noreferrer"`, without
  scripts.

## 7. "Share" links

The state is encoded on the client into the URL fragment (`#s=z1.…`), without a server. The site
decides which address the link leads to and passes the state to the component:

```ts
const atlas = document.querySelector('svitylo-anatomy')!;
const read = () => new URLSearchParams(location.hash.slice(1)).get('s');
const initial = read();
if (initial) atlas.setAttribute('state', initial); // before or after connecting — either works
window.addEventListener('hashchange', () => {
  const next = read();
  if (next && next !== atlas.getAttribute('state')) atlas.setAttribute('state', next);
});
```

- By default a link is the current page + `#s=…`. For another base use the `share-base-url`
  attribute; for full control,
  `atlas.shareUrlBuilder = (encoded, state) => \`https://site/atlas#s=${encoded}\``.
- Opening a link loads only the files it needs; "Reset" returns to the state of the link. A damaged
  state, unknown IDs or a missing data version give a clear message, not a silent substitution.
- A state of schema v1 is migrated to the current schema v2. A link made by a newer atlas gives
  `STATE_UNSUPPORTED_VERSION`.
- A state that is too large (over 32,768 characters) is not truncated: the dialog offers a JSON
  download, and `encodeState` throws `STATE_TOO_LARGE`.

## 8. Lifecycle in an SPA

- Registering the element loads nothing; connecting it to the DOM loads only the metadata.
- A short move of the node (disconnected and connected again within one task) keeps everything.
- Removing it from the DOM releases the WebGL context, requests, timers and listeners; connecting
  it again restores the last view. Mount/unmount cycles do not accumulate contexts (an end-to-end
  test checks this).
- Several instances on a page have independent states; they do not share GPU resources.

Laravel/Livewire: the component is wrapped in `wire:ignore` and driven only through the API and
events. A ready-made integration is described in [section 11](#11-embeds-in-notes).

## 9. Styling and texts

The styles come from the Svitylo design system: the Inter font, the primary blue `#0151FE`
(`#3977FF` in the dark theme), Svitylo surfaces, lines and radii, buttons from 40 px. The component
loads no fonts: it uses Inter if the page has already loaded it, otherwise a system font.

**Theme**: the `theme` attribute, `auto` (default, follows the system `prefers-color-scheme`),
`light` or `dark`. The 3D scene is dark in both themes, so the model and the transparent
surroundings keep their contrast. If the site has its own theme switch, the site sets `theme`
itself. For a `dark` class on `<html>` (Tailwind, Svitylo), `syncAnatomyTheme()` from the Composer
package does this ([README](../packages/laravel/README.md#theme)); the module has no dependencies,
so it works without Laravel too.

CSS custom properties (inherited through the Shadow DOM) override the values of both themes:

| Property | Default: light / dark |
| --- | --- |
| `--svitylo-anatomy-bg` | `#f9fafb` / `#161c29` — component background |
| `--svitylo-anatomy-panel-bg` | `#ffffff` / `#141924` — panels |
| `--svitylo-anatomy-scene-bg` | `#0e1320` in both — scene (hex) |
| `--svitylo-anatomy-text`, `--svitylo-anatomy-muted` | `#111827`, `#6b7280` / `#eaeaea`, `#9ca3af` |
| `--svitylo-anatomy-accent`, `--svitylo-anatomy-focus` | `#0151fe` / `#3977ff` |
| `--svitylo-anatomy-link` | `#0048e4` / `#a8c3ff` |
| `--svitylo-anatomy-border` | `#e5e7eb` / `#273242` |
| `--svitylo-anatomy-radius` | `8px` |
| `--svitylo-anatomy-font`, `--svitylo-anatomy-font-size` | Inter, then system fonts; `14px` |
| `--svitylo-anatomy-panel-width`, `--svitylo-anatomy-info-width` | `300px`, `340px` — side columns |
| `--svitylo-anatomy-embed-height` | embed height (`420px`; the `height` attribute takes precedence) |

Selected structures are highlighted in 3D with the Svitylo blue (`#3977ff`), hovered ones with
`#a8c3ff`; the core option `colors` sets these colours
([api.md](api.md#options-createatlasviewer--new-atlasviewer)).

The language of names and of the interface is `lang="en|uk"` (English by default); the language
switch in the settings changes both. Latin is separate: the `latin` attribute or the "Show Latin
names" switch shows the Latin name **on a second line** under the name in the current language
(tree, search, embeds); the selection card always shows the Latin name. The state of the switch is
kept in the link. `lang="la"` (and old links with Latin as the language) means the interface
language plus Latin. Use `ui-lang="en|uk"` only if the interface must be in a different language
from the names. Individual texts can be replaced with the `strings` property
(`Partial<UiStrings>`). Unreviewed Ukrainian names are shown with a dotted underline and no tooltip
(the legend at the foot of the side column explains it); `uk-names="reviewed"` keeps only reviewed
names. A name that does not exist in the chosen language is shown in English with a language tag.

The stock component keeps the Svitylo logo visible and has no setting to disable it.
CPAL-1.0 Section 14 and Exhibit B govern attribution, including for a custom headless UI;
they do not require continuous display in every state. See [licensing.md](licensing.md)
for source obligations, network use and the graphical-interface exception for CLI tools.

## 10. Security

- The manifest, the dictionaries and the state of a link are validated against schemas before they
  are applied. Names with HTML markup or control characters are rejected; all texts are output as
  text.
- State limits: 32,768 characters encoded, 256 KB unpacked, 4000 IDs in one list, 10,000 in total,
  depth 6.
- External links in the UI have `rel="noopener noreferrer"`.
- The library reads no cookies or localStorage and sends nothing: its only requests are GET
  requests for the data files.

## 11. Embeds in notes

A compact atlas in the text is `<svitylo-anatomy layout="embed">` (attributes, "Open" and the limit
on simultaneous scenes: [api.md](api.md#embed-layoutembed)). Until the reader presses "Show 3D",
the embed is only a placeholder with a name: a page with a dozen embeds makes no requests for data.
Embeds with the same `data-url` share the metadata; at most four hold a 3D scene at the same time
(`SvityloAnatomyElement.maxActiveEmbeds`).

The author of a note describes an embed with an ```anatomy block (readable, the same for Markdown
and HTML):

````md
```anatomy
structure: cardiovascular.heart
surroundings: 2
label: Heart
caption: The heart in its surroundings
```
````

`surroundings: 2` selects the heart and shows the second level of its surroundings with the default
transparency (78%). Instead of a block, the author can set up the view in the full atlas and paste
its "Share" link on a line of its own. The syntax is in the
[Markdown package README](../packages/markdown/README.md#syntax).

| Where notes are written | Package | What it does |
| --- | --- | --- |
| Markdown in the browser or Node | [`@authorod/svitylo-anatomy-markdown`](../packages/markdown/README.md) | markdown-it plugin: block and link → embed |
| Ready HTML (any editor, another Markdown engine) | the same package | `upgradeAnatomyBlocks(root)`: `pre > code.language-anatomy` → embed through the DOM API |
| Laravel (Blade, league/commonmark, Livewire 4) | [`authorod/svitylo-anatomy-laravel`](../packages/laravel/README.md) | server-side rendering of the same embeds, sanitizer, Blade components, Livewire commands and events |

markdown-it and league/commonmark produce **byte-for-byte identical HTML** (shared fixtures
`packages/markdown/fixtures/blocks.json`), so a note looks the same wherever it is rendered.

**Security.** An invalid block (a wrong ID, a damaged state or link, a value out of range) stays an
ordinary code block; unknown keys are ignored. Only the encoded state is taken from a link: its
address never becomes the data address. All values in the markup are escaped. With a sanitizer the
order is: sanitize the note first (```anatomy blocks are ordinary `pre`/`code` elements, so custom
elements need not be allowed), then turn the blocks into embeds. The sanitizer removes an embed
written into a note by hand.

**"Open".** Without a handler the embed expands into the full atlas on the whole screen (on a
phone this is the right behaviour). A floating window that can be dragged and resized is up to the
site, which handles the `anatomy:expand` event: the library passes the current state and does not
impose a look for the window. Example: `apps/demo/notes.html` (`pnpm demo:dev`, `/notes.html`).
