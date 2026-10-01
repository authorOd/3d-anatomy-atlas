# Known limitations

State as of `1.1.1` (data `1.1.0`, channel `preview`; Markdown package `1.0.2`, Laravel package
`1.0.1`).

## Data

- **One model**: the adult male body from Z-Anatomy (derived from BodyParts3D), with the kidneys
  and the ear from other open models (below). General coverage: an organ being present does not
  mean that all its internal parts are modelled.
- **The licence audit is not complete.** All included assets have the status `pending`; the data
  release is marked as a preview, and the component shows this notice.
- **Excluded for licence reasons (declared gaps, 137 structures):** the surfaces of the cerebral
  cortex (128 structures) and the white matter (9) — the licence of the original source is not
  confirmed. So the brain is shown **without the cerebral cortex and the white matter**. They are in
  the tree and search, marked "no geometry".
- **Kidneys and ear from other open models (CC BY 4.0).** The kidneys (fibrous capsule, hilum,
  cortex, renal columns, pyramids, papillae; the renal pelvis with the major and minor calices) come
  from the Human Reference Atlas (Visible Human Male); the cochlea (scala vestibuli and scala
  tympani), the vestibule, the semicircular canals with the common bony limb, the ossicles and the
  tympanic membrane from OpenEar (one temporal bone; the left ear is its mirror image). The
  Z-Anatomy ossicles and tympanic membrane were replaced because their provenance could not be
  confirmed. These models come from other bodies and are placed into the Z-Anatomy body: the
  kidneys without rotation, so they keep their natural orientation, with one scale for both (0.83)
  and a shift for each that keeps their neighbours outside; where a neighbour would still enter a
  kidney (the suprarenal gland, the colon, the diaphragm, the liver, the transversus abdominis),
  the kidney takes its impression, up to 6 mm deep. The ear is placed by its ossicles (0.35 mm
  apart on average). The parts of the labyrinth are cut from one source mesh along declared planes.
- **No anatomical review has been done.** Every structure has the status "unreviewed" (which does
  not mean "wrong"); the component shows a notice about this.
- **Ukrainian names are drafts only**; none has been reviewed yet: 4481 of 4484 structures, 3330 of
  them machine-assisted (prepared by an AI language model; only the format is checked automatically,
  not the terminology). They are shown with a dotted underline and no tooltip (tree, search, card;
  the legend at the bottom of the structures panel explains the mark); `uk-names="reviewed"` shows
  only reviewed names. The names of muscle attachments are composed of the muscle name and the kind
  of attachment. Three structures with damaged names in the source ("?x", "????????") have no
  Ukrainian name. As soon as a name is reviewed in `sources/reviews.json`, the underline disappears.
- **The hierarchy is shallow and split by systems**, so the surroundings levels are large: for the
  heart, level 1 is the whole arterial system (444 structures), then the whole cardiovascular system
  and the whole body. Neighbouring organs of other systems (ribs, lungs) are added with the "eye" in
  the tree (while a chosen level limits the view, they stay visible at any level) or appear at the
  "Whole body" level.
- The liver segments are an alternative subdivision that overlaps the surface of the liver; they are
  shown only on explicit request (`optional`).
- Known data issues (shown in the structure card): an unnamed heart vein called "????????" in the
  source, the damaged name of one cardiac vein, the capped subdivision level (some surfaces are less
  smooth than in the Blender file).
- **The source geometry is changed in declared places only** (`sources/geometry-fixes.json`; the
  card of the structure lists the correction in its details): the teaching window in the anterior
  wall of the stomach and its mucosa is closed; the lower end of the oesophagus is joined to the
  cardiac opening; the lower edge of the laryngopharynx is laid onto the oesophagus; the lower end of
  the small intestine is joined to the ascending colon; the intrarenal arteries and veins, modelled in
  Z-Anatomy for another kidney, are moved inside the new kidneys by a smooth field (up to about 2 cm
  on the right); the ureters are moved out of the psoas major and the duodenum (up to 8 mm); their
  upper ends lose the funnel they had towards the excluded renal pelvis and are joined to the new
  pelves, and their lower ends, which stopped 2–3 mm short of the urinary bladder, are joined to it.
- **Overlaps and seams of the trunk organs** (`pnpm data:overlaps`, the depth of the deepest point).
  The kidneys, renal pelves and ureters of `1.1.0` stay out of their neighbours (at most 1.3 mm of
  contact). The organs of the source itself overlap in places: the descending and ascending colon
  enter the psoas major by up to 15 and 13 mm and the iliacus by 9–10 mm; the liver enters the
  diaphragm (11 mm) and the stomach (9 mm); the left suprarenal gland enters the spleen (11 mm); the
  vermiform appendix the psoas major (10.5 mm); the pancreas the inferior vena cava (7 mm); the
  descending colon the jejunum (7 mm); the lower lobes of the lungs the transversus abdominis
  (5–7 mm); the duodenum and the jejunum the transverse colon (5–5.5 mm); the duodenum the inferior
  vena cava (5 mm); the descending and sigmoid colon the urinary bladder (5 mm), and 17 more pairs by
  2–4 mm. Open ends: the upper end of the jejunum is partly sunk into the closed end of the duodenum
  (part of its rim stands up to 1.4 mm off it); two openings of the lower lobe of the right lung lie
  1.8 mm from the diaphragm; in the right kidney three seams of the collecting system (HRA) deviate
  by up to 2–3 mm at a few points (under 1 mm on average). These show only with transparency or when
  parts of the body are hidden; they are planned for a later data release (the full list with
  priorities is in the [data roadmap](data-roadmap.md)). Only the trunk organs and their neighbours
  were checked; elsewhere the source can still have small gaps or overlaps.
- Muscle attachments (`insertions`) are hidden by default and are not part of "Load everything".

## Rendering

- **WebGL2** is required; WebGPU is not used. Without WebGL2, the tree, search, names and sources
  are available, with an explanation.
- **Transparency (ghost):** up to 300 translucent structures are drawn layer by layer (a depth
  pre-pass for each structure, sorted from far to near by bounding sphere), so inner outlines show
  through outer ones. Above 300, a single-layer mode is used: the nearest translucent surface is
  visible and deeper ones are covered (the usual case with the whole body loaded and the transparency
  above 0). For structures that interpenetrate, the order is approximate.
- Picking runs on the CPU over triangles, with culling by bounding volumes; a BVH is added only if
  profiling calls for it.
- Materials are a colour palette without textures.
- Economy mode: simplified geometry, `devicePixelRatio ≤ 1`, no specular highlights or rim light;
  systems are not hidden. The whole body: ~56 MB (standard) or ~21 MB (economy) of network transfer;
  ~3.04 million or ~0.85 million triangles.
- The loaded geometry of the visible scene stays in GPU memory; outside the current view, decoded
  geometry is kept within a 384 MB budget (LRU).
- Several full atlases on a page are independent and do not share GPU resources. Embeds share the
  metadata, but each started embed has its own WebGL context and geometry; so at most 4 embeds hold a
  3D scene at the same time (`maxActiveEmbeds`), and "five active widgets without degradation" is not
  guaranteed.

## Performance

- Measurements on physical devices (iPhone 12, iPhone 17, iPad Air 4, Mac M1 Pro) **have not been
  done yet**, and there are no approved numeric budgets. The automated tests use software rendering
  (SwiftShader) and check logic and visual regressions, not performance.
- Windows, Android and other browsers have not been tested and are considered unverified.

## Browsers

- `z1.` links (compressed) need `CompressionStream`/`DecompressionStream` with the `deflate-raw`
  format (Safari 16.4+, Chrome 103+, Firefox 113+); without them the component creates longer `j1.`
  links, but such a browser cannot open `z1.` links (a clear state error).
- SHA-256 checks of the files need a secure context (HTTPS or `localhost`); otherwise only the size
  is checked.
- On iPhone there is no Fullscreen API for elements, so a pseudo-fullscreen mode is used.
- "Share" through the system menu (`navigator.share`) is not available everywhere; copying the link
  always is.
- Hover works only with a mouse.

## Interface and state

- Collapsed side columns and the width of the left one are not remembered: every opening starts with
  both columns at their default width. On a phone, the sheet with the cards opens only on a user
  action.
- "Centre", "Zoom to" and the views only place the camera outside other visible structures; they do
  not turn the transparency on, so a structure inside another one (the heart behind the ribs, the
  brain in the skull) may stay covered — for it, use "Isolate" or the "Surroundings transparency"
  slider. The check runs along one line from the centre of the structure to the camera, so thin parts
  to the side of that line may partly block the view.
- The transparency turns on by itself (78%) only when a structure is selected from the tree or
  search while the transparency is 0, and only when, from where the camera has flown to, most of five
  rays to the structure (three or more) first hit another opaque structure. A partly covered structure
  may stay partly covered. Once on, the transparency stays when the selection changes; the slider
  turns it off.
- A surroundings level chosen with − / + decides what is shown around the selection, even when the
  whole body is loaded, and stays for the next selections (the stepper shows it in the accent
  colour). "Load everything", "Reset", `showStructure` and links bring back the automatic level (or
  the level the link carries).
- Structures that the tree or search placed on the scene stay on it after they are deselected. While
  a chosen level limits the view, the level decides whether they are shown; they are shown again
  with the automatic level or without a selection.
- A double click is two clicks on the same structure within 0.4 s: a quick second click meant to
  deselect what was just selected acts as a double click (the selection stays and the camera zooms
  in).
- The camera returns after a deselection only for the last automatic zoom, and only when neither the
  selection nor the camera has changed since.
- The `auto` theme follows the system theme of the device, not the site's theme switch: a site with
  its own switch sets `theme` itself (on Svitylo, `syncAnatomyTheme()` from the Composer package).
  The component does not load the Inter font: without it on the page, the system font is used.
- On a scene 540 px wide or narrower there are no zoom buttons (zoom with a gesture, the wheel or the
  +/− keys), and the transparency slider opens from a button on the camera bar. On a medium scene (a
  laptop with both columns), the camera bar is shifted slightly to the left so that it does not cover
  the logo.
- Latin names exist for 3473 of 4454 structures; where the Latin name is the same as the name in the
  current language (235 structures in English), it is not repeated on a second line.
- The camera in a state is rounded to 0.1 mm; economy mode is not part of the state (it is a local
  option).
- Search does not correct typos: it matches a word prefix or a substring after normalisation (case,
  diacritics, apostrophes, ґ/г, ё/е).
- For screen readers, the 3D view is represented by announcements and keyboard control; the fully
  accessible path is the tree, search and the structure card.

## Embeds and integrations

- An embed without `state` sets the view only by a structure or a system, a surroundings level (with
  the default transparency, 78%) and a standard view. The exact view (camera, hidden structures,
  selection, surroundings level and transparency) comes through `state` or a "Share" link.
- An embed in the page shows only the scene, the name of the selection, "Reset" and "Open"; the tree,
  search, cards, the surroundings level and the camera bar with the transparency slider are in the
  full atlas that "Open" expands.
- A floating window for "Open" (dragging, resizing) is up to the site: the library dispatches a
  cancellable `anatomy:expand` event with the current state (example: `apps/demo/src/notes.ts`), and
  without a handler it opens the full atlas fullscreen.
- Markdown engines: there are plugins for markdown-it and league/commonmark. For others (marked,
  remark, Parsedown…) the route is through HTML: any engine that outputs
  `<pre><code class="language-anatomy">` works with `upgradeAnatomyBlocks` or `AnatomyHtml::transform`.
- Editors: no editor plugins. An editor stores the ```anatomy block or a "Share" link as text and
  the site turns them into embeds with the packages above; Svitylo builds its CKEditor 5
  integration itself.
- Sanitiser: ready-made rules only for Symfony HtmlSanitizer. The same rule applies to HTMLPurifier
  or DOMPurify — sanitise first, then transform the blocks — but the package has no configurations
  for them.
- Laravel 11 no longer receives security fixes (Composer warns during installation); the package
  supports and tests it, but new sites should use Laravel 12–13. Livewire 3 has not been tested.
- The Composer package is developed in the monorepo (`packages/laravel`) and published to Packagist
  from its own repository, https://github.com/authorOd/svitylo-anatomy-laravel. The Livewire JS
  bridge is loaded from `vendor/` (like the ES module of Livewire itself).

## Postponed

Cross-sections, pins, previews of arbitrary states and screenshot export, personal presets and
accounts; editor plugins (TipTap, Trix and others); measurements on physical devices.
