# @authorod/svitylo-3d-anatomy-atlas

An interactive 3D atlas of human anatomy for the browser: the `<svitylo-anatomy>` web component and
a headless Three.js (WebGL2) core. No dependencies on Svitylo servers, no telemetry.

[![The heart selected inside a translucent ribcage, with the structure tree on the left and the structure card on the right](https://raw.githubusercontent.com/authorOd/3d-anatomy-atlas/main/docs/images/atlas-hero.png)](https://svitylo.com/3d-anatomy-atlas)

Demo: [svitylo.com/3d-anatomy-atlas](https://svitylo.com/3d-anatomy-atlas).

> The code is licensed under CPAL-1.0. The data release is on the `preview` channel: its licence
> audit is not finished yet.

## Installation

```sh
npm install @authorod/svitylo-3d-anatomy-atlas
npx svitylo-anatomy export-assets public/anatomy-data --prune
```

The data package `@authorod/svitylo-3d-anatomy-data` is installed automatically (the exact
compatible version). The `export-assets` command explicitly copies its release into the site's
public folder, keeping the versioned layout, the licences and the checksums, and `--prune` removes
the versions it replaces; nothing runs automatically on install.

## Usage

```html
<svitylo-anatomy></svitylo-anatomy>  <!-- English by default; lang="uk" for Ukrainian; latin adds Latin names on a second line -->
<script type="module">
  import '@authorod/svitylo-3d-anatomy-atlas';
</script>
```

```css
svitylo-anatomy { display: block; height: 100dvh; }
```

The styles come from the Svitylo design system; the theme is `theme="auto|light|dark"` (by default
it follows the system), and the 3D scene is dark in both themes. Colours, the font and the column
widths are changed with the `--svitylo-anatomy-*` CSS variables.

On opening, only the metadata and the dictionaries are loaded; the models load after the user
selects something, presses "Load everything" or opens a link with a state.

```ts
const atlas = document.querySelector('svitylo-anatomy')!;
atlas.addEventListener('anatomy:ready', async (e) => {
  if (e.detail.kind !== 'ui') return;
  await atlas.showStructure('cardiovascular.heart'); // the heart alone on the scene, selected
  await atlas.showSurroundings(); // level 1 and 78% transparency around the selection
});
atlas.addEventListener('anatomy:select', (e) => console.log(e.detail.ids));
```

A note embed is a compact atlas that loads nothing until "Show 3D" is pressed:

```html
<svitylo-anatomy layout="embed" structure="cardiovascular.heart" surroundings="2" label="Heart"></svitylo-anatomy>
```

`surroundings="2"` is surroundings level 2 with the default transparency (78%). The ```anatomy block
in Markdown and Laravel/Livewire are separate packages (`@authorod/svitylo-anatomy-markdown`,
`authorod/svitylo-anatomy-laravel`).

Without the UI:

```ts
import { createAtlasViewer } from '@authorod/svitylo-3d-anatomy-atlas/core';

const viewer = await createAtlasViewer({ container, dataUrl: '/anatomy-data/1.1.0/' });
await viewer.loadAll();
const state = viewer.getState();
viewer.dispose();
```

## Entry points

| Import | Contents |
| --- | --- |
| `@authorod/svitylo-3d-anatomy-atlas` | the component (registered on import), the core, the state codec |
| `…/core` | the headless core without Lit |
| `…/schema` | Zod schemas and JSON Schema (`schema/*.schema.json`), the state codec |
| `…/strict-csp` | mode for a strict CSP (import it first) |

## Requirements

- A browser with WebGL2 (without it: an explanation, the tree, search and sources).
- CSP: `script-src 'self' 'wasm-unsafe-eval'` (the meshopt decoder runs on WebAssembly) and
  `style-src 'self'` are enough; `'unsafe-eval'` and `'unsafe-inline'` are not needed.
- Data on another origin: CORS `Access-Control-Allow-Origin`.

Repository documentation — integration (Vite, CDN, CORS, CSP, cache), the API and events, the state
format, the data pipeline, known limitations:
https://github.com/authorOd/3d-anatomy-atlas/tree/main/docs

## Licence

The code uses [CPAL-1.0](LICENSE.md), with Svitylo attribution in Exhibit B. Commercial
and closed-source Larger Works are allowed, while the covered atlas code and its
modifications retain CPAL source obligations, including qualifying network use.
The component keeps its logo visible; CPAL Section 14 governs the attribution obligation.
Data retains its separate licences. See the repository's [licensing guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/docs/licensing.md).

## Contributing languages

Propose partial, unreviewed name drafts or UI translations through a PR, following
[CONTRIBUTING.md](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/CONTRIBUTING.md). The Ukrainian draft format is the reference;
a new language also needs schema, pipeline and UI integration before it appears in the atlas.
