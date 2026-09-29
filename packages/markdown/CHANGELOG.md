# Changelog — @authorod/svitylo-anatomy-markdown

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
