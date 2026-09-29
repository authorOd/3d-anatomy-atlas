# Changelog — @authorod/svitylo-3d-anatomy-atlas

## 1.0.1 — 2026-09-29

Compatible data: `@authorod/svitylo-3d-anatomy-data@1.0.0`.

- Fixed: the tree, search and structure card were missing from the built package, because the build
  dropped their modules, which were imported only to register the elements.
  `defineSvityloAnatomy()` now registers `<svitylo-anatomy-tree>`, `<svitylo-anatomy-search>` and
  `<svitylo-anatomy-info>` explicitly.

## 1.0.0 — 2026-09-29

First release. Compatible data: `@authorod/svitylo-3d-anatomy-data@1.0.0`, manifest schema 1, state
schema 2.

- The `<svitylo-anatomy>` web component (Lit); the headless core `/core` (Three.js, WebGL2); the
  schemas and the state codec `/schema`; `/strict-csp` for a strict Content Security Policy; the
  `svitylo-anatomy export-assets` command.
- Empty start; selection on the model, in the tree and in search; the surroundings level and the
  transparency slider; isolate, hide, standard views; "Load everything" with progress, cancelling
  and retries; a manual economy mode.
- Interface and names in English and Ukrainian, Latin names on a second line, search in all
  languages.
- "Share" links with a versioned state, `layout="embed"` for notes, the phone layout, keyboard and
  screen reader support, a fallback without WebGL2.
- The Svitylo logo stays visible and links to https://svitylo.com (CPAL-1.0, Exhibit B).
