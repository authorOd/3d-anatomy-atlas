# @authorod/svitylo-3d-anatomy-data

Versioned anatomy data package for `@authorod/svitylo-3d-anatomy-atlas`: GLB geometry (two quality
levels), manifest, name dictionaries, coverage report, attribution, licences and checksums. It is
installed automatically with the main package.

> The `1.1.0` release is on the `preview` channel: the licence audit of the assets is not
> complete yet, no anatomical review has been done, and the Ukrainian names are unreviewed drafts
> (most of them machine-assisted), marked in the atlas as unreviewed with a dotted underline.

## Release contents

```
releases/<version>/
  manifest.json          hierarchy, systems, files (size, SHA-256), aliases, assets, reports
  names/{uk,la,en}.json  name dictionaries with review statuses
  standard/<system>/*.glb
  economy/<system>/*.glb
  reports/COVERAGE.md    coverage report (+ coverage.json)
  ATTRIBUTION.md         attribution of the sources
  LICENSES.md            licences of the assets
  SHA256SUMS             checksums of all files
```

GLB: one node and one primitive per file, `EXT_meshopt_compression`, `KHR_mesh_quantization`, the
`_ID` attribute (structure and material index). Coordinates: metres, Y up, face towards +Z, the
patient's left at +X, origin on the floor between the heels.

Current release: 4484 structures (3761 with geometry, 137 declared gaps), 9 systems, 61 files per
quality level; standard ~3.04 million triangles / 56.3 MB, economy ~0.85 million / 21.4 MB, metadata
3.4 MB (≈0.23 MB with gzip). Ukrainian names: 4481 of 4484 (all drafts; 3330 machine-assisted).
The kidneys come from the Human Reference Atlas and the ear (labyrinth, ossicles, tympanic
membrane) from OpenEar, both CC BY 4.0. Details: [coverage report](releases/1.1.0/reports/COVERAGE.md).

The source geometry is changed only in declared places (`sources/geometry-fixes.json`): the
teaching window in the stomach and its mucosa is closed; the oesophagus, the laryngopharynx and
the small intestine are joined to their neighbours without gaps; the intrarenal
vessels are adapted to the new kidneys; the ureters are moved out of their neighbours and joined to
the new renal pelves and to the bladder. The coverage
report lists the corrections, and the card of each corrected structure has them in its details
("Corrected in this atlas").

## Usage

The data is copied to the site by an explicit command of the main package:

```sh
npx svitylo-anatomy export-assets public/anatomy-data --prune
```

From Node.js: `import { DATA_VERSION, MODEL, releaseDir } from '@authorod/svitylo-3d-anatomy-data'`.

## Versions

- Data versions are independent of code versions; the main package pins the compatible data version
  exactly.
- **Published versions are immutable.** Any change of geometry, IDs or names is a new version.
- Stable IDs do not change between versions; renames go through `aliases` in the manifest.
- Links do not need old versions: the atlas opens every link in the data it has loaded.
  `export-assets --prune` removes the old versions from the site; without it the export never
  deletes them.

## Licences

Each asset has its own licence and audit status — see [LICENSES.md](LICENSES.md). The standard set
contains only assets with a confirmed permission for commercial use; assets with NonCommercial or
unclear terms are excluded and marked as gaps.

The data is built reproducibly from a pinned Z-Anatomy snapshot; the pipeline sources are in
`sources/` in the repository (see `docs/data-pipeline.md`).

## Contributing languages

Submit a PR with partial or complete unreviewed drafts in
`sources/terms/<lang>.draft.json`, following `uk.draft.json`. Keep machine-assisted
drafts separate and provide provenance. A new locale is not loaded automatically:
maintainers must integrate it in the schema, build and UI before release. See
[the contribution guide](https://github.com/authorOd/3d-anatomy-atlas/blob/HEAD/CONTRIBUTING.md) for the format and full workflow.
Do not edit generated releases or mark drafts as reviewed without a real human review.

The small JavaScript/TypeScript software entry points in this package use
[CPAL-1.0](CODE-LICENSE.md); this does not change the licences of the data assets.
