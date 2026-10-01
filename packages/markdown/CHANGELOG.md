# Changelog — @authorod/svitylo-anatomy-markdown

## 1.0.2 — 2026-10-02

- Fixed: two regular expressions could backtrack polynomially on long input (CodeQL
  `js/polynomial-redos`). A block line of many spaces with a line separator inside, or an allowed
  share-link prefix with a long run of slashes, took seconds (20,000 characters: 0.6 s, growing with
  the square of the length); both are linear now. The parsing results are unchanged.

## 1.0.1 — 2026-10-01

- npm metadata: `homepage` and `bugs`. The code is unchanged.

## 1.0.0 — 2026-09-29

First release. Compatible atlas: `@authorod/svitylo-3d-anatomy-atlas@1.0.0`.

- The ```anatomy block (`structure`, `system`, `surroundings`, `view`, `state`/`link`, `label`,
  `caption`, `height`, `lang`, `latin`): `parseAnatomyBlock`, `formatAnatomyBlock`; an invalid block
  stays code.
- "Share" links of atlas pages (`shareUrls`) in a paragraph of their own become embeds, also a link
  whose text is its own address.
- markdown-it plugin; `renderAnatomyEmbed`, `upgradeAnatomyBlocks` (ready HTML through the DOM API),
  `createEmbedElement`.
- Fixtures `fixtures/blocks.json`, shared with the Composer package.
