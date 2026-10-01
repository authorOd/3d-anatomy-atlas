# authorod/svitylo-anatomy-laravel

Integration of the [Svitylo 3D atlas](../../README.md) with Laravel and Livewire:

- Blade components `<x-svitylo-anatomy>` (the full atlas) and `<x-svitylo-anatomy-embed>` (an
  embed);
- a **league/commonmark** extension: ```anatomy blocks and "Share" links become embeds (the same
  HTML as the markdown-it plugin produces, checked on shared fixtures);
- transformation of **stored HTML** (rich text editors, other Markdown renderers):
  `<pre><code class="language-anatomy">` → embed;
- rules for **Symfony HtmlSanitizer**;
- **Livewire 4**: atlas commands from PHP and atlas events in components. Embeds and the atlas
  carry `wire:ignore`, so component updates do not touch the 3D scene; `wire:navigate` and
  `@persist` are covered by browser tests.

Requirements: PHP 8.2+, Laravel 11–13, Livewire 4 (optional), league/commonmark 2.6+.

> Works with `@authorod/svitylo-3d-anatomy-atlas` 1.x. The package is developed in the atlas
> monorepo (`packages/laravel`) and published from
> [authorOd/svitylo-anatomy-laravel](https://github.com/authorOd/svitylo-anatomy-laravel). Terms:
> [LICENSE.md](LICENSE.md).

## Installation

```sh
composer require authorod/svitylo-anatomy-laravel
npm install @authorod/svitylo-3d-anatomy-atlas
npx svitylo-anatomy export-assets public/anatomy-data
php artisan vendor:publish --tag=svitylo-anatomy-config   # optional
```

`resources/js/app.js` (Vite):

```js
import '@authorod/svitylo-3d-anatomy-atlas';
// Only with Livewire: the JS bridge ships with this Composer package (an ES module without dependencies, types alongside).
import { installLivewireBridge } from '../../vendor/authorod/svitylo-anatomy-laravel/resources/js/livewire.js';

installLivewireBridge();
```

The atlas library knows nothing about Laravel and Livewire. The protocol between PHP and the
browser (event names, allowed commands) lives in one package: this one.

### Theme

The atlas has a light and a dark theme (the `theme` attribute: `auto` follows the system, `light`,
`dark`; the 3D scene is dark in both). On a site where the `dark` class on `<html>` switches the
theme (Tailwind, Svitylo), a module of this package keeps the theme of every atlas on the page in
step. It is an ES module without dependencies, with types alongside:

```js
import { syncAnatomyTheme } from '../../vendor/authorod/svitylo-anatomy-laravel/resources/js/theme.js';

syncAnatomyTheme(); // { root, darkClass } — another element or class; returns a function that stops it
```

It watches both the class and the atlases that appear later (Livewire updates, `wire:navigate`,
embeds in notes, editor previews and dialogs).

`config/svitylo-anatomy.php`: `data_url` (default: `/anatomy-data/<data version>/`), `lang` (names
language of embeds and of `<x-svitylo-anatomy>` when they do not set one; default `uk`),
`share_urls` (atlas pages whose share links become embeds), `livewire` (`wire:ignore` on embeds,
default `true`).

## Notes

```blade
{{-- Markdown (CommonMark + GFM): raw HTML is escaped, unsafe links are dropped --}}
@anatomyMarkdown($note->body)

{{-- Stored HTML: the sanitizer first, then the embeds --}}
@anatomyHtml($sanitizedHtml)
```

The same in PHP: `app(SvityloAnatomy::class)->markdown($text)`, `->html($html)`,
`->embed("structure: cardiovascular.heart\nlabel: Heart")`.

With your own league/commonmark environment or `Str::markdown()`:

```php
use Authorod\SvityloAnatomy\CommonMark\AnatomyExtension;

$html = Str::markdown($text, [], [app(SvityloAnatomy::class)->extension()]);
// or new AnatomyExtension(['data_url' => '/anatomy-data/1.1.0/', 'share_urls' => [...]])
```

The block syntax is in the [Markdown package README](../markdown/README.md#syntax). An invalid block
stays an ordinary code block.

### Sanitizer (Symfony HtmlSanitizer)

```php
use Authorod\SvityloAnatomy\Sanitizer\AnatomySanitizer;
use Symfony\Component\HtmlSanitizer\{HtmlSanitizer, HtmlSanitizerConfig};

$config = AnatomySanitizer::allowBlocks((new HtmlSanitizerConfig())->allowSafeElements());
$clean = (new HtmlSanitizer($config))->sanitize($storedHtml);
echo app(SvityloAnatomy::class)->html($clean); // ```anatomy blocks → embeds
```

The order "sanitize, then transform" means that only the package creates embed markup: the
sanitizer removes an embed written into a note by hand (with a foreign `data-url`). `allowEmbeds()`
is for pipelines that sanitize embeds that are already rendered: it allows only their attributes,
always sets `layout="embed"`, and sets `data-url` to the folder you pass
(`AnatomySanitizer::allowEmbeds($config, config('svitylo-anatomy.data_url'))`) or drops it, so an
embed in the input can never load data from another host.

## Blade components

```blade
<x-svitylo-anatomy id="atlas" class="h-[80vh]" ui-lang="uk" />
<x-svitylo-anatomy-embed structure="cardiovascular.heart" :surroundings="2" label="Heart" caption="The heart in its surroundings" />
```

`<x-svitylo-anatomy>` passes its other attributes to the `<svitylo-anatomy>` element
([API](../../docs/api.md)). `<x-svitylo-anatomy-embed>` takes the fields of an ```anatomy block as
attributes (`structure`, `system`, `surroundings`, `view`, `state`, `label`, `caption`, `height`,
`lang`, `latin`) and renders nothing when a value is invalid. `:surroundings="2"` selects the
structure and shows the second level of its surroundings with the default transparency (78%).

## Livewire

```php
use Authorod\SvityloAnatomy\Livewire\InteractsWithAnatomy;
use Livewire\Attributes\On;

class Lesson extends Component
{
    use InteractsWithAnatomy;

    public ?string $selected = null;

    public function showHeart(): void
    {
        // Only the heart, selected; then the first level of its surroundings at 78% transparency.
        $this->anatomy('atlas')->showStructure('cardiovascular.heart')->showSurroundings('cardiovascular.heart');
    }

    public function widerView(): void
    {
        $this->anatomy('atlas')->setSurroundingsLevel(2)->setTransparency(0.5);
    }

    #[On('anatomy-select')]
    public function onSelect(?string $primary = null, ?string $atlas = null): void
    {
        $this->selected = $primary;
    }
}
```

- Commands (`showStructure`, `showSystem`, `showSurroundings`, `setSurroundingsLevel`,
  `setTransparency`, `exitSurroundings`, `select`, `focusOn`, `setView`, `setState`, `reset`,
  `loadAll`, `isolate`, `clearIsolation`, `hide`, `show`, `showHidden`) go to the browser as the
  `anatomy-command` event. The bridge (`resources/js/livewire.js`) runs only these methods; a test
  checks that its list matches `AnatomyCommands::METHODS`.
- Surroundings: `showSurroundings(?string $id)` with an id places the structure on the scene, adds
  it to the selection and frames it; then it sets the surroundings level (the chosen one, else 1)
  and the transparency (the current one, else 0.78), and ends an isolation.
  `setSurroundingsLevel(?int $level)`: 0 = only the selection, 1 = the nearest group of every
  selected structure … the last level = the whole body; `null` = the automatic level (everything
  placed on the scene is shown). `setTransparency(float $value)`: transparency of everything that
  is not selected, from 0 (opaque) to 0.95. `exitSurroundings()`: back to the automatic level,
  everything opaque.
- Atlas events arrive as the Livewire events `anatomy-select`, `anatomy-surroundings` and
  `anatomy-statechange`, with the fields of the atlas event plus `atlas` (the element id).
  `anatomy-surroundings` carries `level` (0 … the number of levels; null without a selection),
  `explicit` (the level was chosen), `levels` (group IDs of levels 1 … N; `null` = the whole body),
  `transparency` (0 = opaque) and `source`.
- Laravel does not drive the scene frame by frame: the scene changes only through commands.

## Tests

```sh
composer install && composer test     # PHPUnit + Testbench (Laravel 11–13, Livewire 4)
pnpm test:laravel:e2e                 # from the root: Livewire browser tests on the workbench app
```

`workbench/` is the test application: a note in a Livewire component, an atlas with commands and
events, and pages with `@persist`.

## Licence and contributions

The project's own code is licensed under [CPAL-1.0](LICENSE.md). Independent code in
a Larger Work may remain closed; CPAL source and attribution obligations apply to
the covered atlas code and its modifications. Data and dependencies retain their
own licences. See the repository's [licensing guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/docs/licensing.md) and
[language contribution guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/CONTRIBUTING.md). Partial translation drafts
can be proposed through a PR; a new language also needs runtime integration.
