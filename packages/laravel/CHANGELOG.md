# Changelog — authorod/svitylo-anatomy-laravel

## 1.0.1 — 2026-10-02

- Fixed: the pattern of a block line no longer backtracks on long lines (it ran into the PCRE
  backtrack limit, which only by chance gave the right result). The parsing results are unchanged,
  as in `@authorod/svitylo-anatomy-markdown` 1.0.2.

## 1.0.0 — 2026-09-29

First release. PHP 8.2+, Laravel 11–13, Livewire 4; compatible atlas
`@authorod/svitylo-3d-anatomy-atlas@1.0.0`.

- league/commonmark extension: ```anatomy blocks and "Share" links become embeds (the same HTML as
  the markdown-it plugin on the shared fixtures).
- `AnatomyHtml::transform` for stored HTML (rich text editors, other Markdown renderers).
- Symfony HtmlSanitizer rules (`AnatomySanitizer::allowBlocks`, `allowEmbeds`); an embed in the
  input never chooses its layout or data folder.
- Blade components `<x-svitylo-anatomy>`, `<x-svitylo-anatomy-embed>`, directives
  `@anatomyMarkdown`, `@anatomyHtml`; configuration `svitylo-anatomy`.
- Livewire 4: `InteractsWithAnatomy` (commands from PHP), atlas events in components, the JS bridge
  `resources/js/livewire.js`; `wire:ignore` on the atlas and the embeds.
- `resources/js/theme.js`: `syncAnatomyTheme()` keeps the `theme` of every atlas on the page in
  step with the `dark` class on `<html>`.
