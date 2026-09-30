# Contributing to Svitylo 3D Anatomy Atlas

Language contributions are welcome, including **partial, unreviewed drafts**.
You do not need to translate the entire atlas or claim expert review to open a PR.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Bugs, name
corrections and device reports have their own
[issue forms](https://github.com/authorOd/3d-anatomy-atlas/issues/new/choose); report
vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes. CI runs the checks on
every pull request.

## Add or improve anatomical names

1. Fork the [repository](https://github.com/authorOd/3d-anatomy-atlas) and create
   a branch for your language or corrections.
2. For Ukrainian, edit `packages/data/sources/terms/uk.draft.json`. For a new language,
   propose `packages/data/sources/terms/<lang>.draft.json` using the same format.
   State the language code and its native name in the PR; agree regional variants
   with the maintainers before adding separate dictionaries.
3. Use the existing **English source term** as each key, not a translated key or a
   structure ID. The Ukrainian draft file is a useful starting reference. Check the
   English source names and Latin names in the current data release. Preserve source
   spelling; avoid keys that differ only in case or whitespace. Do not add `.l`/`.r`
   suffixes to shared terms: the current pipeline handles paired structures separately.
4. Include only terms you can propose. Omit unknown names instead of adding empty
   strings, guesses or English text presented as a translation. Optional `synonyms`
   must be actual names in the target language, not explanations or markup.
5. Open a PR describing coverage, references, authorship and whether AI or machine
   translation was used. Partial PRs are useful.

For example, the existing Ukrainian format is:

```json
{
  "$comment": "Unreviewed Ukrainian translation drafts; not an expert review.",
  "terms": {
    "Heart": { "name": "Серце", "synonyms": [] },
    "Liver": "Печінка"
  }
}
```

For another language, replace the translated values and the comment. Do not copy
the Ukrainian values into a new language file. Use plain UTF-8 text, no HTML.
Names and synonyms must fit the dictionary limits (300 characters per string,
at most 32 synonyms per entry).

### What happens after a translation PR

**Today, the runtime accepts names in `uk`, `en` and `la`; the interface supports
`uk` and `en`. A new JSON file alone does not enable a language.** A translation-only
PR can supply drafts for maintainers to integrate. It must not claim that the new
language is already selectable or shipped. If maintainers merge it before integration,
it remains source material for a future data release.

The Ukrainian workflow is the model for future languages:

- Editorial proposals go in `<lang>.draft.json`.
- If there are machine-assisted proposals, keep them separately in
  `<lang>.machine.json` and describe their provenance. Do not conceal machine-assisted
  text as a human translation. For Ukrainian, editor drafts override machine drafts.
- A draft enters a generated dictionary with `origin: "draft"` and
  `status: "unreviewed"`, with a truthful source label. Machine validation and merging
  a PR do not make a name reviewed.
- Missing names should use an explicitly labelled English fallback. Existing
  Ukrainian drafts are marked with a dotted underline; new languages need equivalent
  visible treatment before they ship.

Do not edit generated files in `packages/data/releases/` or their checksums to submit
a translation. Maintainers build a new data version from the accepted sources.

## Enable a new language in the application

For a complete language PR, coordinate the translation with these implementation tasks.
The paths below describe the current code, not an automatic locale loader:

| Area | Files and responsibilities |
| --- | --- |
| Schema | `packages/atlas/src/schema/primitives.ts`: extend `LANGS` and localized-text support; check state and dictionary validation and regenerate the JSON schemas. |
| Draft import | `packages/tools/src/lib/terms.ts` and `packages/tools/src/build.ts`: load both draft sources, preserve precedence and provenance, create unreviewed entries, and handle system and muscle-attachment names. Do not reuse Ukrainian grammar for another language. |
| Data release | `packages/tools/src/lib/release.ts`: include the language in dictionaries, missing-name lists and coverage reports. Add a source/attribution record in `packages/data/sources/licenses.json` and include it as a non-geometry asset in the build. |
| Lookup and search | `packages/atlas/src/core/catalog/names.ts` and related search code: extend language iteration, fallback and draft policy. The current `uk-names` policy is Ukrainian-specific. |
| Interface | `packages/atlas/src/ui/i18n.ts`, `atlas-element.ts`, `name-flags.ts` and related UI: add strings and language selection, display draft/fallback labels, preserve Latin display, and handle text direction if needed. |
| Integrations | Check the embed language validators of the Markdown package and of the Laravel package (`BlockParser::LANGS`); they also contain language-specific assumptions. |
| Verification | Exercise language selection, synonyms/search, missing-name fallback, draft indicators, reviewed-name handling, and saved/share-link round trips. Keep old language links working. |

Anatomical names and interface strings are different contributions. You can submit
either first; state the scope in the PR. For UI work, translate the full `UiStrings`
shape, including plurals, errors, loading messages and accessibility labels.

## Review is separate from drafting

Human terminology review is recorded in `packages/data/sources/reviews.json`, keyed
by stable structure ID and language. A reviewed record needs the actual reviewer's
name, review date and scope. Only record a review that actually happened. The build
turns an approved terminology draft into an editorial name; do not obtain that result
by simply relabelling a draft yourself.

The licence audit in `sources/licenses.json` is a **different** review. A new included
language asset needs evidence of its rights and a human audit before a release-channel
publication. Anatomical accuracy review does not automatically establish those rights.
See [the data pipeline](docs/data-pipeline.md#review).

## Rights and references

Offer original anatomical-name/dictionary contributions under **CC BY-SA 4.0**, to the
extent you hold relevant rights. State this in the PR. Public-domain individual terms
remain public domain. Identify each external source with a URL, author, version/date,
licence and changes; include evidence of permission where needed. Do not copy protected
tables, definitions or translations from a textbook or website merely because it is
accessible. Flag uncertain rights for review.

FIPAT distinguishes public-domain individual terms from its CC BY-ND publication;
do not label a copied or translated TA2 publication as CC BY-SA. See
[FIPAT's statement](https://fipat.library.dal.ca/wp-content/uploads/2021/08/FIPAT-TA2-Front-Matter.pdf).
Data and software have different licences: code contributions, including UI string
tables in the software, follow [CPAL-1.0](LICENSE.md). Preserve the Exhibit A source
notice when editing code and include it in new source files.

## PR checklist

- State the language code/native name and whether the PR contains names, UI strings,
  runtime integration, or a combination.
- Describe translated coverage and known gaps; partial drafts are acceptable.
- Identify human and machine-assisted contributions and their sources separately.
- Confirm rights to submit your contribution under the applicable data/code licence.
- Keep stable IDs and English lookup keys unchanged.
- Keep unreviewed entries as drafts; do not invent reviewer names or audit approvals.
- Describe checks actually run. For JSON-only draft proposals, verify valid JSON,
  nonempty names, unique normalized keys, source-term matches and encoding. If the
  language is not integrated, say so rather than claiming it passes runtime validation.
- For runtime integration, run `pnpm typecheck`, `pnpm test`, `pnpm check:boundaries`
  and the relevant UI tests. Regenerate schemas with `pnpm schema:json`. A maintainer
  with the pinned source export should build and validate a **new preview data version**
  using the procedure in [docs/data-pipeline.md](docs/data-pipeline.md).

Never overwrite a published data version. The licence audit of the included data
assets is still pending; `pnpm release:check` reports it without blocking a release.
