# API

API version: `1.1.0`. The behaviour described here is covered by tests.

Entry points of the package `@authorod/svitylo-3d-anatomy-atlas`:

| Import | Contents |
| --- | --- |
| `@authorod/svitylo-3d-anatomy-atlas` | registers `<svitylo-anatomy>`; exports everything from `core`, the UI texts and the state codec |
| `@authorod/svitylo-3d-anatomy-atlas/core` | the headless core, without Lit and UI |
| `@authorod/svitylo-3d-anatomy-atlas/schema` | Zod schemas and JSON Schemas of the manifest, dictionaries and state; the codec |
| `@authorod/svitylo-3d-anatomy-atlas/strict-csp` | optional mode for a strict CSP ([integration.md](integration.md#6-content-security-policy)) |

JSON Schema files: `schema/manifest.schema.json`, `schema/dictionary.schema.json`,
`schema/view-state.schema.json` (generated from the same Zod schemas: `pnpm schema:json`).

Embeds in notes are separate packages on top of the component (the library does not know about
them):

| Package | Contents |
| --- | --- |
| [`@authorod/svitylo-anatomy-markdown`](../packages/markdown/README.md) | the ```anatomy block, "Share" links, a markdown-it plugin, conversion of stored HTML |
| [`authorod/svitylo-anatomy-laravel`](../packages/laravel/README.md) (Composer) | league/commonmark, sanitiser, Blade, Livewire 4 |

## `<svitylo-anatomy>`

```html
<svitylo-anatomy
  data-url="/anatomy-data/1.1.0/"
  lang="en"
  quality="standard"
  layout="full">
</svitylo-anatomy>
```

### Attributes

| Attribute | Value | Description |
| --- | --- | --- |
| `data-url` | URL of a version folder | Base of the allowed resources (from `manifest.json`). Default `/anatomy-data/<DEFAULT_DATA_VERSION>/`. Changing it reloads the metadata. |
| `lang` | `en` \| `uk` | Language of the names and the interface, default `en`. Unreviewed Ukrainian names (translation drafts in the data) have a dotted underline and no tooltip; the legend below the tree explains the mark. A name that does not exist in this language is shown in English with a language tag. `la` (compatibility) = the interface language + `latin`. |
| `latin` | boolean | Latin names **on a second line** under the names in the current language (tree, search, embed); the same as the "Show Latin names" toggle in the settings. The selection card always shows the Latin name. Stored in the link. |
| `ui-lang` | `en` \| `uk` | An explicit interface language, when it must differ from the language of the names. Without it the interface follows `lang`; the language control in the interface changes both the names and the interface. |
| `uk-names` | `any` \| `reviewed` | `any` (default): unreviewed Ukrainian names are shown too (with a dotted underline); `reviewed`: only reviewed ones, otherwise English. Read when the metadata loads. |
| `theme` | `auto` \| `light` \| `dark` | Interface theme (styles of the Svitylo design system); `auto` (default) follows the system `prefers-color-scheme`. The 3D scene is dark in both themes. A site with its own theme switch sets the attribute itself ([integration.md](integration.md#9-styling-and-texts)). |
| `quality` | `standard` \| `economy` | Quality; changes only when set explicitly. Not stored in the link. |
| `layout` | `full` \| `embed` | `embed`: a compact embed for notes ([below](#embed-layoutembed)). |
| `state` | encoded state | State of a link (`z1.…`/`j1.…`); applied automatically, loading the files it needs. |
| `share-base-url` | URL | Base of the "Share" links (default: the current page). |
| `pick-ghost` | boolean | A click selects the nearest structure, even a translucent one in front of an opaque one (read when the viewer is created). By default an opaque structure under the pointer has priority, and translucent ones are selected where there is no opaque one. |
| `structure`, `system`, `surroundings`, `view`, `label`, `height`, `autoload` | | Only for `layout="embed"` ([below](#embed-layoutembed)). |

### Properties

| Property | Type | Description |
| --- | --- | --- |
| `catalog` | `AtlasCatalog \| null` | Metadata, dictionaries, search (after `anatomy:ready` with `kind: 'ui'`). |
| `viewer` | `AtlasViewer \| null` | The headless core (null without WebGL2 or before it is ready). |
| `strings` | `Partial<UiStrings>` | Overrides of the interface texts. |
| `shareUrlBuilder` | `(encoded, state) => string` | Builds the link address instead of the default. |
| `dataUrlResolver` | `(version) => string \| null` | Where the site keeps other data versions, for `catalog.loadVersion()`. Links do not use it. |
| `SvityloAnatomyElement.maxActiveEmbeds` | `number` (static) | How many embeds on a page hold a 3D scene at the same time (default 4). |

### Methods

Methods that need the scene throw an `AtlasError` with the code `NOT_READY` before the atlas is
ready, and `WEBGL2_UNAVAILABLE` without WebGL2.

| Method | Description |
| --- | --- |
| `loadAll(): Promise<OperationResult>` | All body systems (except the systems hidden by default and optional subdivisions); the outer view shows the skin, which loads first. Ends an isolation, shows hidden structures again and brings back the automatic surroundings level; the selection and the transparency stay. |
| `showStructure(id)` | Shows only this structure (replaces the scene and the selection) and focuses on it; loads only its files. The surroundings level goes back to automatic and the transparency to 0. The interface does not do this: the tree and search select like a click (`viewer.selectStructure`); the method is for the API and embeds. |
| `showSystem(id)` | Shows a system. |
| `showSurroundings(id?, { level?, transparency? })` | The surroundings in one call ([below](#surroundings-level-and-transparency)): with `id`, that structure is first placed on the scene, added to the selection and framed; then the level is chosen (default: the level already chosen, else 1) and the transparency is set (default: the current one, else 0.78). Ends an isolation. |
| `setSurroundingsLevel(level \| null)` | Chooses the surroundings level: 0 = only the selection, 1 = the nearest group of every selected structure … the last = the whole body; loads what the level needs. `null` = automatic. The chosen level stays for the next selections. |
| `setTransparency(value)` | Transparency of everything that is not selected: 0 = opaque … 0.95. The selection stays opaque. |
| `exitSurroundings()` | Back to the automatic level and opaque structures. |
| `isolate(ids?)` / `clearIsolation()` | Isolation (default: the selection). The surroundings level and the transparency stay: clearing the isolation brings the surroundings back. |
| `hide(ids)` / `show(ids)` / `showHidden()` | Hiding does not unload files; `show` adds what is missing to the scene for good (while a chosen level limits the view, it stays visible whatever the level). |
| `select(ids)` | Replaces the selection (the camera does not move). A click in the scene adds the structure to the selection or removes it; a click on empty space changes nothing. A structure is never selected together with its ancestors or descendants: selecting one deselects the others. |
| `focusOn(ids?)` | Points the camera at the structures (default: the centre of the whole selection, like "Centre"); the camera does not end up inside other visible structures. |
| `setView(view)` | `anterior` \| `posterior` \| `left` \| `right` \| `superior` \| `inferior`: a standard view of the selection (without a selection, of everything visible). |
| `setQuality(quality)` | Switches the geometry and keeps the camera, visibility and selection; frees the previous level. |
| `getState(): ViewState \| null` | The canonical state (exactly what goes into a link). |
| `setState(state \| encoded)` | Applies a state to the loaded data, whatever data version made it; IDs this data does not have are reported (`UNKNOWN_ID`). Another anatomical model: `DATA_MISMATCH`. |
| `reset()` | Back to the initial state of the link; without a link, to the empty scene (automatic level, opaque). |
| `shareUrl(): Promise<string>` | A link to the current view. |
| `activate()` | Embed: starts the 3D scene (as the "Show 3D" button does). |
| `expand(): Promise<void>` | Embed: "Open", the `anatomy:expand` event; without a handler, the full atlas on the whole screen. |
| `deactivateEmbed(): boolean` | Embed: returns it to the placeholder and frees the WebGL context (the view is kept). |

### DOM events

All events have the `anatomy:` prefix, `bubbles: true` and `composed: true`; `detail` is typed
(`HTMLElementEventMap`).

| Event | `detail` | When |
| --- | --- | --- |
| `anatomy:ready` | `{ kind: 'ui' }` | Metadata, dictionaries and search are ready. **No geometry is implied.** |
| `anatomy:ready` | `{ kind: 'scene', request, complete }` | The geometry of the requested view is ready. It means the whole body only for `request: 'loadAll'`. |
| `anatomy:select` | `{ ids, primary, source }` | The selection changed. |
| `anatomy:hover` | `{ id }` | Mouse hover (not for touch). |
| `anatomy:visibility` | `{ visible, scene, hidden, isolate, source }` | The visibility changed. |
| `anatomy:surroundings` | `{ level, explicit, levels, transparency, source }` | The surroundings changed: the level (chosen, or derived from what is visible), whether it was chosen, the levels (they follow the selection) or the transparency. `level`: 0 … `levels.length`, `null` without a selection; `explicit`: the level was chosen; `levels`: group IDs of levels 1 … N (`null` = the whole body); `transparency`: 0 = opaque. |
| `anatomy:camera` | `{ position, target, fov }` | The camera moved (at most ~7 times/s). |
| `anatomy:statechange` | `{ state, source }` | The logical state changed (debounced, 250 ms). |
| `anatomy:progress` | `{ phase, totalFiles, loadedFiles, failedFiles, totalBytes, loadedBytes, quality }` | Loading (≤ 10 times/s). `phase`: `idle`, `loading`, `complete`, `cancelled`, `error`. |
| `anatomy:error` | `{ code, message, ids?, files?, version?, status?, recoverable? }` | An error with a code. |
| `anatomy:expand` | `{ state }` | "Open" in an embed; **cancelable**: after `preventDefault()` the site shows the view itself (e.g. in its own window). |

`source`: `api`, `pointer`, `keyboard`, `tree`, `search`, `state`, `reset`, `ui`. For camera
changes in `anatomy:statechange` it is `pointer` for dragging, pinching and the wheel, `keyboard` for
the camera keys, the source of the operation that moved the camera (e.g. `tree` for a zoom to a
structure selected in the tree, `state` for a link) and `api` for the camera methods (`focus`,
`frameAll`, `setView`, `zoom`, `orbit`).

### Embed (`layout="embed"`)

```html
<svitylo-anatomy layout="embed" structure="cardiovascular.heart" surroundings="2" view="anterior"
  label="Heart"></svitylo-anatomy>
```

A compact atlas for a note. In Markdown and editors an embed is written as an ```anatomy block; the
integration packages create this markup themselves.

- **Until "Show 3D" is pressed, it is only a placeholder** with the name (`label`) and the logo: no
  request, not even for the metadata. Pressing it loads the metadata (shared by all embeds with the
  same `data-url`) and only the files of its view. `autoload` starts it at once.
- **View**: `state` (the exact view of a "Share" link) has priority; without it, `structure` or
  `system`, `surroundings` and `view`. `surroundings` (1–32) is a surroundings level (1 = the
  nearest group; beyond the last level, the whole body) with the default transparency (78%).
  "Reset" returns to this view.
- **Size**: `height` (160–2000 px) or the CSS property `--svitylo-anatomy-embed-height`; default
  420 px.
- **On the scene**: the name of the selected structure, "Reset" and "Open"; rotation, zoom and
  selection by click work. The tree, search, the selection column and the camera bar (with the
  transparency slider) are in the full atlas.
- **"Open"** dispatches the cancelable `anatomy:expand` event with the current state. Without a
  handler the embed becomes the full atlas on the whole screen (the same scene, nothing is loaded
  again); leaving fullscreen returns the embed with the same view. A site can show the view its own
  way, for example in a window that can be dragged and resized:

  ```ts
  import { encodeState } from '@authorod/svitylo-3d-anatomy-atlas';

  document.addEventListener('anatomy:expand', async (e) => {
    if (window.innerWidth < 900) return; // phone: the default fullscreen
    e.preventDefault();                  // synchronously, before the first await
    const atlas = document.createElement('svitylo-anatomy');
    if (e.detail.state) atlas.setAttribute('state', await encodeState(e.detail.state));
    openWindow(atlas);                   // the site's own window; example: apps/demo/src/notes.ts
  });
  ```

- **Scene limit**: at most `maxActiveEmbeds` embeds (default 4) hold a 3D scene at the same time.
  Starting one more returns the least recently used one to its placeholder and frees its WebGL
  context; when it is started again, it restores its view. An embed expanded to the whole screen is
  not returned while it is expanded.

## Headless core

```ts
import { createAtlasViewer } from '@authorod/svitylo-3d-anatomy-atlas/core';

const viewer = await createAtlasViewer({
  container: document.getElementById('view')!, // the core adds only a <canvas>
  dataUrl: '/anatomy-data/1.1.0/',
  quality: 'standard',
  lang: 'uk',
});

const off = viewer.on('select', (e) => console.log(e.primary)); // returns the unsubscribe function
await viewer.showStructure('cardiovascular.heart');
await viewer.selectStructure('cardiovascular.aorta');   // like a tree row: add to the selection and zoom to it
await viewer.showSurroundings();                         // level 1 around the whole selection, 78% transparency
await viewer.setSurroundingsLevel(2);                    // wider, up to the whole body; null = automatic
viewer.setTransparency(0.5);                             // 0 = opaque … 0.95
viewer.exitSurroundings();                               // automatic level, opaque
viewer.isolate(['cardiovascular.heart']);
viewer.focus(['cardiovascular.heart']);
await viewer.setQuality('economy');
const state = viewer.getState();
await viewer.setState(state);
await viewer.reset();
off();
viewer.dispose();
```

### Options (`createAtlasViewer` / `new AtlasViewer`)

| Option | Default | Description |
| --- | --- | --- |
| `container` | — | Element for the canvas; its size is tracked with a ResizeObserver. |
| `dataUrl` | — | Only `createAtlasViewer`; `new AtlasViewer` takes a loaded `catalog`. |
| `quality` | `standard` | `standard` \| `economy`. |
| `lang` | `en` | Language of the names. |
| `latin` | `false` | Latin names under the names (for the UI; part of the state). |
| `pickGhost` | `false` | The nearest structure under the pointer, even a translucent one (see the `pick-ghost` attribute). |
| `background` | `#0e1320` | Scene colour (the component takes it from `--svitylo-anatomy-scene-bg`). |
| `colors` | `highlight` `#3977ff`, `hover` `#a8c3ff`, `ghostTint` `#cfe0ea` | Colours of the selected and the hovered structure, and the tint of translucent structures. |
| `fetch` | `globalThis.fetch` | Your own request implementation. |
| `concurrency` | `4` | Parallel requests (1–8). |
| `cacheBudgetBytes` | 384 MB | Budget of decoded geometry outside the current view (LRU). |
| `keyboard` | `true` | Keyboard camera control on the container. |
| `names`, `resolveDataUrl`, `signal` | — | Only `createAtlasViewer` → `AtlasCatalog.load`. |

### `AtlasViewer` methods

The element's scene methods (`loadAll` … `reset`; `focusOn` is `focus` here), and also:

| Method / property | Description |
| --- | --- |
| `on(type, handler): Unsubscribe` | Typed core events: the DOM events without the `anatomy:` prefix (except `expand`), plus `quality` and `lang` (`{ lang, latin }`). |
| `toggleSelection(id)` | Click semantics: adds the structure to the selection or removes it. A structure that is not shown is placed on the scene and stays there after it is deselected. The camera does not move. |
| `selectStructure(id, { focus?, ensureVisible? })` | Like a tree row or a search result: the structure becomes the most recent selection (the others stay selected, except its ancestors and descendants). When it is not shown, it is placed on the scene (and stays there after it is deselected): loaded, removed from `hidden`, added to an active isolation. `focus` (default) zooms the camera to it; if it is deselected right afterwards with nothing else changed (neither the selection nor the camera), the camera goes back. `ensureVisible`: when other structures cover it after the zoom, the transparency turns on (0.78) if it was 0. |
| `surroundings` | `{ level, explicit, levels, transparency }`: `level` is the level of the view, 0 … `levels.length` (`null` without a selection); `explicit`, whether the level was chosen; `levels`, the group IDs of levels 1 … N (`null` = the whole body); `transparency`, 0 = opaque. |
| `surroundingsLevels(id)` | Surroundings levels of one structure: group IDs from the nearest; `null` = the whole body. |
| `showSurroundings(id?, { level?, transparency?, source?, focus?, keepIsolation? })` | As on the element; `focus: false` leaves the camera where it is, and `keepIsolation` keeps an isolation (by default it ends, so that the surroundings are visible). |
| `setTransparency(value, { source? })` / `transparency` | Transparency of everything that is not selected: 0 = opaque … 0.95, clamped to `TRANSPARENCY_RANGE` (`{ min: 0, max: 0.95, default: 0.78 }`, exported from `/schema`). |
| `addStructures(ids, { select?, focus? })` | Adds structures to the scene for good, without removing others (while a chosen level limits the view, they stay visible whatever the level). |
| `reveal(id)` | "Find / show": places the structure on the scene for good, removes it from `hidden`, extends an active isolation to it, makes it the only selected structure and focuses the camera on it. |
| `select(ids, mode)` | `replace` \| `add` \| `toggle` \| `remove`; `clearSelection()`. Ancestors and descendants of a newly selected structure are deselected (in a list, the later one wins). |
| `focus(ids?, { animate?, padding? })` | Points the camera at the structures and keeps the viewing direction (default: the whole selection; without a selection, everything visible). If the viewpoint would be inside another visible structure, the camera moves out along the same direction; the transparency does not turn on, so the structure may stay covered. |
| `frameAll({ animate? })` | "Overall view": everything visible, whatever is selected. |
| `setView(view, { animate? })`, `currentView` | A standard view of the selection (without a selection, of everything visible); as with `focus`, the camera does not end up inside other structures. `currentView` is the view the camera looks from now, or `null` after free rotation. |
| `orbit(dAz, dPolar)`, `zoom(factor)` | Camera steps for buttons (`zoom(0.8)` closer, `zoom(1.25)` farther). |
| `isolated`, `isolates(id)` | Whether there is an isolation; whether exactly this structure is isolated (for the "Isolate" toggle in the card). |
| `setLang(lang)` / `lang` | Language of the names (the component switches the interface to it too). |
| `setLatin(show)` / `latin` | Latin names under the names in `lang`. |
| `cancelLoading()` | Cancelling is a separate phase, `cancelled`, not a data error; the scene holds only what is loaded, and a chosen surroundings level steps down to the highest level that is loaded (or back to automatic). |
| `resumeLoading()` / `canResumeLoading` | Loads again what `cancelLoading()` stopped: the view as it was before (the structures taken off the scene and the chosen level). Any other operation in between drops that view. The "Continue" button of the atlas does this. |
| `retry()` | Retries only the failed files of the current view. |
| `setInitialState(state \| null)` | The state `reset()` returns to. |
| `displayOf(id)` | `hidden` \| `opaque` \| `ghost` \| `mixed` \| `absent`. |
| `loadStateOf(id)` | `none` \| `loading` \| `ready` \| `failed` \| `partial`. |
| `pickAt(clientX, clientY)` | The ID of the structure under the point, or `null`. |
| `progress()`, `getResourceStats()`, `frameTimeStats()` | Progress; resource accounting (requests, bytes, decoding, draw calls, triangles); CPU frame time p50/p95. |
| `recreateRenderer()` | Recovery after a lost WebGL context (the logical view is kept). |
| `dispose()` | Cancels requests, timers and subscriptions; frees GPU resources and the context. |

### `OperationResult`

```ts
interface OperationResult {
  status: 'complete' | 'partial' | 'cancelled' | 'superseded';
  missing: string[]; // requested structures without geometry (declared gaps)
  failed: string[];  // files that failed to load
}
```

`superseded`: a newer user action replaced this one (the result of the old request does not
overwrite the new selection).

### `AtlasCatalog`

`AtlasCatalog.load({ dataUrl, fetch?, signal?, names?, resolveDataUrl? })`: the manifest and the
dictionaries, without geometry. `names: { ukrainian: 'any' | 'reviewed' }` is the policy for
Ukrainian names (default `any`). `catalog.get(id)` (aliases included), `catalog.names.label(id, lang)`,
`catalog.names.display(id, lang)` (the text, language, `fallback`, `status` and `origin`; the UI marks
unreviewed names by them), `catalog.search.search(query, { lang, limit })`, `catalog.issuesFor(id)`,
`catalog.loadVersion(version)` (another data version the site hosts, on request; links do not need it).

## Identifiers

Stable IDs of the form `system.structure[_side]`: `cardiovascular.heart`, `skeletal.femur_l`. They
are not generated from translations and do not change between data versions; renamed IDs are kept
as `aliases` in the manifest. That is why a link opens in the data the site has loaded, whatever
version made it: the same structures are shown, and the ones this data does not have are listed in
a notice. In a link state, `=id` means "only the structure's own geometry, without its descendants".

## Surroundings level and transparency

Two independent settings decide what is seen around the selection: the **surroundings level** (how
much of the hierarchy around the selection is shown) and the **transparency** (how translucent
everything that is not selected is). Neither is a mode.

**What is on the scene.** "Load everything" (`loadAll`), the tree "eye" (`show`), `showStructure`,
`addStructures`, `reveal`, `showSurroundings(id)`, links (`setState`) and selecting a structure that
is not shown (a tree row or a search result, `selectStructure`, `toggleSelection`) place structures
on the scene. Deselecting, including "Clear selection" and Escape, never changes the scene.

**Levels.** They are built from the data hierarchy around **the whole selection**: level 0 is only
the selection; level k joins the k-th group of every selected structure (a structure with a shorter
hierarchy stays at its top group); the last level is the whole body (every system except those
hidden by default). Ancestors that add no new structure are skipped. Examples for data
`1.1.0`: the heart → "Arterial system" (444 structures) → "Cardiovascular system" → the
whole body; the heart and the femur together → "Arterial system" + "Bones of free part of lower
limb" → … → the whole body. The levels are rebuilt when the selection changes.

- **Automatic level** (the default): everything placed on the scene is shown, and the level only
  reports what is visible: the smallest level whose surroundings hold every visible structure
  besides the selection (0 when only the selection is visible; the whole body after "Load
  everything").
- **Chosen level** (`setSurroundingsLevel(k)`, the − / + buttons, `showSurroundings`): the scene
  shows only the selection, that level of its surroundings and the structures shown with the "eye"
  meanwhile, even when the whole body is loaded. The chosen level stays for the next selections
  (limited to their number of levels). Without a selection everything placed is shown.
- `setSurroundingsLevel(null)`, `exitSurroundings()`, "Load everything" and `showStructure` bring
  back the automatic level. `setState` applies the level of the state (none = automatic); `reset()`
  returns to the level of the initial state, or to the automatic level without one. Structures
  shown with the "eye" while a chosen level limits the view stay visible whatever the level, and
  stay on the scene when the level goes back to automatic.
- Interface: the stepper "Surroundings level k of N" with the name of the level (0: "Only the
  selection"; the last: "Whole body"; otherwise the names of its groups) and the buttons "Less
  surroundings" / "More surroundings". It sits in the selection block of the right column (on
  narrow layouts, at the end of the camera bar, with the shorter "Level k of N" on a phone), is
  always shown and is disabled without a selection ("Select a
  structure first"). A chosen level is shown in the accent colour. The level applies to the whole
  selection, so the cards of single structures have no surroundings controls.

**Transparency.**

- `setTransparency(value)`: 0 = opaque (the default) … 0.95. Above 0 everything that is not
  selected is translucent at that intensity, and the selection stays opaque; without a selection
  everything shown is translucent. A click on a translucent structure selects it (it becomes
  opaque); an opaque structure under the pointer has priority unless `pick-ghost` is set.
- Interface: the slider "Surroundings transparency" (0–95%) on the camera bar; on a narrow scene
  (≤ 540 px) a button on the bar opens the slider above it.
- When a structure selected from the tree or search is covered by others after the zoom, the
  transparency turns on at 78% (`TRANSPARENCY_RANGE.default`) if it was 0.
- The transparency stays when the selection changes and after "Load everything".
  `exitSurroundings()`, `showStructure` and `reset()` to the empty scene set it to 0; `setState`
  applies the transparency of the state (none = opaque).

**Isolation.** "Isolate" shows only the isolated structures; the level and the transparency stay,
and clearing the isolation brings the surroundings back. `showSurroundings` ends an isolation unless
`keepIsolation` is set.

## State (`ViewState`, schema version 2)

```ts
interface ViewState {
  v: 2;
  data: { model: string; version: string; hash?: string }; // the data it was made with (the model must match; the version is informational)
  scene: string[];      // structures placed on the scene (parents expand to their descendants)
  hidden?: string[];    // narrows the scene
  isolate?: string[];   // restricts the allowed set; absent = no isolation
  selected?: string[];  // selection order (the last is the most recent); no ancestor–descendant pairs; never makes hidden structures visible
  surroundings?: {
    level?: number;        // chosen level: 0 = only the selection … 32; absent = automatic
    extra?: string[];      // shown with the "eye" while the chosen level limits the view
    transparency?: number; // of everything not selected: > 0 … 0.95; absent = opaque
  };
  camera?: { position: [x, y, z]; target: [x, y, z]; fov?: number }; // metres, Y up
  lang?: 'uk' | 'la' | 'en';
  latin?: boolean;      // Latin names under the names (canonical: true or absent)
}
```

- `scene` lists everything placed on the scene. With `surroundings.level` and a selection, the scene
  shows the selection, that level of its surroundings and `extra` instead of `scene`; `scene` is
  shown again with the automatic level. The field `surroundings` is absent when all three keys are.
- States of schema v1 still open. A v1 state is validated with the v1 schema, then migrated:
  `surroundings: { level, extra, opacity, anchor? }` becomes
  `{ level, extra, transparency: 1 − opacity }` (0.78 without `opacity`), and the anchor is dropped.
  A v1 state without `surroundings` keeps the automatic level and opaque structures.
- A state with `lang` also sets the Latin names: without `latin` they are off. A state with
  `lang: 'la'` opens in the interface language with Latin names on.
- Precedence: `isolate` restricts, `hidden` narrows, and `selected` never makes a hidden structure
  visible.
- A state that selects both a group and its part is normalised: the later one in the list stays.
- `setState(getState())` does not change what is shown; the state is canonical (ordered, camera
  rounded to 0.1 mm).
- The economy mode is not part of the state.

### Codec

`encodeState(state, { compress? })` → `z1.<base64url(deflate-raw(JSON))>` (or `j1.<base64url(JSON)>`
without `CompressionStream`); `decodeState(encoded)` checks the limits before and during
decompression. Migrations from older schema versions are in the `STATE_MIGRATIONS` table (v1 → v2),
tested on saved example states. `STATE_SCHEMA_VERSION` is `2`, and `schema/view-state.schema.json`
describes v2. `/schema` also exports `TRANSPARENCY_RANGE`, `MAX_SURROUNDINGS_LEVEL` (32) and, for
schema v1 only, `GHOST_OPACITY_RANGE`.

| Limit (`STATE_LIMITS`) | Value |
| --- | --- |
| `maxEncodedLength` | 32,768 characters |
| `maxDecodedBytes` | 256 KB |
| `maxIdsPerList` | 4000 |
| `maxTotalIds` | 10,000 |
| `maxDepth` | 6 |

## Error codes

| Code | Meaning |
| --- | --- |
| `WEBGL2_UNAVAILABLE` | A browser or device without WebGL2 (the tree, search, names and sources work). |
| `CONTEXT_LOST` | The WebGL context was lost; the view is kept and can be restored. |
| `DATA_URL_INVALID` | An invalid data base (scheme, credentials in the URL, etc.). |
| `MANIFEST_UNAVAILABLE` / `MANIFEST_INVALID` / `SCHEMA_UNSUPPORTED` | The manifest is unavailable, fails validation or has an unsupported schema version. |
| `DATA_VERSION_UNAVAILABLE` | `catalog.loadVersion()`: the version is not on the site (`details.version`). |
| `DATA_MISMATCH` | The state was made for another anatomical model. |
| `FILE_UNAVAILABLE` / `FILE_INTEGRITY` / `FORMAT_UNSUPPORTED` | A model file is unavailable, does not match the manifest or has an unsupported format. |
| `UNKNOWN_ID` / `NO_GEOMETRY` | An unknown ID; a structure without geometry (a gap). `NO_GEOMETRY` is declared but not raised: operations report gaps in `OperationResult.missing`. |
| `STATE_INVALID` / `STATE_MALFORMED` / `STATE_TOO_LARGE` / `STATE_UNSUPPORTED_VERSION` | Problems with the state of a link. |
| `NOT_READY` / `DISPOSED` | A call before the atlas is ready or after `dispose()`. |

`AtlasError` has `code`, `message` and `details` (`ids`, `files`, `version`, `status`,
`recoverable`).

## Coordinates

Metres, Y up, the face towards +Z, the origin between the heels, the patient's left side towards +X.
