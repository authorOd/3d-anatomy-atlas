# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); code and data have separate versions.

## 1.1.0 — 2026-10-01

### Data — `@authorod/svitylo-3d-anatomy-data` 1.1.0 (`preview` channel)

- Added: the kidneys, from the Human Reference Atlas (CC BY 4.0, Visible Human Male): the fibrous
  capsule, hilum, renal cortex, renal columns, renal pyramids and renal papillae of each kidney,
  and the renal pelvis with the major and minor calices. `visceral.kidney_l` and `_r` become groups
  of these parts; `visceral.renal_pelvis_l` and `_r` now have geometry.
- Added: the inner ear, from OpenEar (CC BY 4.0): the cochlea (scala vestibuli and scala tympani),
  the vestibule, and the semicircular canals with the common bony limb. `nervous.cochlea_l` and `_r`
  become groups.
- Changed: the malleus, incus, stapes and tympanic membrane come from OpenEar as well, because the
  provenance of the Z-Anatomy models could not be confirmed.
- Changed: the intrarenal arteries and veins are adapted to the new kidneys, and the upper ends of
  the ureters are joined to the new renal pelves (declared corrections, listed in the cards and the
  coverage report).
- 4484 structures, 3761 with geometry; 137 declared gaps (the cerebral cortex and the white matter).
  Files whose content did not change keep the bytes of 1.0.0.
- npm metadata: keywords, `homepage`, `bugs`.

### Library — `@authorod/svitylo-3d-anatomy-atlas` 1.1.0

- Uses data `1.1.0` (pinned exactly).
- Node.js 22.12 or later for the `svitylo-anatomy` command (`engines`); CI no longer tests Node 20.

### Data pipeline

- Models from other sources (`sources/external.json`), placed by `pnpm data:fit`
  (`sources/external-fit.json`, reviewed and committed).
- A correction kind `warp-curves`; `join-tube-end` can narrow a flared end (`endRadius`); a
  correction can declare its seam tolerance (`maxGap`).
- `pnpm data:build --previous <release>` keeps the chunk files of the previous release whose
  decoded content is unchanged.
- A Python error in Blender fails `pnpm data:export` (Blender used to exit with 0).

The Markdown and Laravel packages are unchanged.

## 1.0.2 — 2026-10-01

### Library — `@authorod/svitylo-3d-anatomy-atlas` 1.0.2

- Changed: deselecting (a click, the card's ×, "Clear selection", Escape) never changes the scene.
  A structure that the tree or search placed on the scene stays there after it is deselected.
  Before, it left the scene with its selection, so deselecting the only selected structure emptied
  the scene and showed "No model loaded yet". While a chosen surroundings level limits the view,
  the level still decides what is shown.
- npm metadata: `homepage` (the demo), `bugs`, and the keywords `web-components`,
  `custom-elements`, `human-anatomy` and `medical-education`.

### Markdown — `@authorod/svitylo-anatomy-markdown` 1.0.1

- npm metadata: `homepage` and `bugs`. The code is unchanged.

### Repository

- GitHub Actions: the checks, the end-to-end tests and PHPUnit on every push and pull request; the
  Livewire end-to-end tests and the clean-install check weekly.
- Community files: a Code of Conduct (Contributor Covenant 2.1), a security policy with private
  vulnerability reporting, issue forms and a pull request template.
- The Composer package's `composer.json` has `support` links (issues, source); it has no new
  version.

The data package is unchanged.

## 1.0.1 — 2026-09-29

### Library — `@authorod/svitylo-3d-anatomy-atlas` 1.0.1

- Fixed: the tree, search and structure card (`<svitylo-anatomy-tree>`, `<svitylo-anatomy-search>`,
  `<svitylo-anatomy-info>`) were missing from the built package, so the atlas showed none of them.
  The build dropped their modules, which were imported only to register the elements;
  `defineSvityloAnatomy()` now registers them explicitly.
- `pnpm check:boundaries` fails when the built bundles do not register these elements, and
  `pnpm check:clean-install` checks them in the browser.

The data, Markdown and Laravel packages are unchanged.

## 1.0.0 — 2026-09-29

First release.

### Library — `@authorod/svitylo-3d-anatomy-atlas` 1.0.0

- The `<svitylo-anatomy>` web component (Lit) on a headless Three.js (WebGL2) core, and the
  `svitylo-anatomy export-assets` command that copies the data into a site. No dependencies on
  Svitylo servers, no telemetry.
- Empty start with search, the tree of systems and "Load everything"; no GLB requests before the
  user acts. Selection works the same on the model, in the tree and in search, and loads only the
  files it needs.
- The surroundings level of the selection (from only the selection to the whole body) and the
  surroundings transparency slider; isolate, hide, standard views, a manual economy mode.
- Interface and names in English and Ukrainian, Latin names on a second line; search by names and
  synonyms in all languages before any model is loaded.
- "Share": the view in the URL fragment with a versioned state format; a link opens exactly its
  data version or reports that it is missing.
- Phone layout, keyboard and screen reader support, a fallback without WebGL2, light and dark
  themes, a strict Content Security Policy (`/strict-csp`), lifecycle management (`dispose()`,
  recovery after a lost WebGL context).
- Embeds in notes: `<svitylo-anatomy layout="embed">` makes no requests until "Show 3D".
- API, events, state format and error codes: [docs/api.md](docs/api.md).

### Data — `@authorod/svitylo-3d-anatomy-data` 1.0.0 (`preview` channel)

- The adult male body from Z-Anatomy (based on BodyParts3D): 4454 structures (3729 with geometry,
  145 declared gaps), 9 systems, two quality levels (standard ~3.0 million triangles, economy ~0.84
  million); names in English, Latin and Ukrainian; a coverage report, attribution and licences.
- Declared corrections of the source geometry in the digestive tract
  (`sources/geometry-fixes.json`).
- The licence audit of the included assets is pending, hence the `preview` channel and the notice
  in the atlas. No anatomical review has been done; the Ukrainian names are unreviewed drafts, most
  of them machine-assisted. Assets with NonCommercial or unconfirmed licences are excluded.

### Integrations

- `@authorod/svitylo-anatomy-markdown` 1.0.0: the ```anatomy block and "Share" links as embeds in
  markdown-it and in rendered HTML.
- `authorod/svitylo-anatomy-laravel` 1.0.0: the league/commonmark extension, Symfony HtmlSanitizer
  rules, Blade components, Livewire 4 commands and events.

### Licence

- Code: CPAL-1.0 with Svitylo attribution (Exhibit B). Data: per-asset licences, CC BY-SA 4.0 for
  the included assets.
