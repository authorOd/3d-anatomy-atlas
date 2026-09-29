# Data pipeline

The atlas data is built reproducibly from a **pinned snapshot** of Z-Anatomy. The pipeline never
downloads the "latest" version: the source commit and the SHA-256 of every input file are recorded
in `packages/data/sources/zanatomy.lock.json`, together with the tool versions. Rebuilding from the
same inputs gives a byte-identical release (checked: two exports are identical, and `SHA256SUMS`
before and after a rebuild match). The export runs Blender with one thread (`tools.threads` in the
lock): with several threads, Blender varies the last bit of some normals from run to run, which
changes the GLB files though not the shapes.

## Source

| | |
| --- | --- |
| Repository | https://github.com/Z-Anatomy/Models-of-human-anatomy |
| Commit | `e38ea5e6c7e22d229a975f3fde563a5aca52099e` (2026-09-24) |
| Input files | `Z-Anatomy.zip` → `Startup.blend`, `License.txt`, `TA2.csv` |
| Tools | Blender 4.0.2 (headless, one thread), glTF Transform 4, meshoptimizer |

## Steps

```sh
pnpm data:source    # step 1: clone the pinned commit without history, verify SHA-256, extract Startup.blend
pnpm data:export    # step 3: headless Blender: transforms, modifiers, normals, hierarchy → .work/zanatomy/export
pnpm data:build     # steps 2, 4–7: hierarchy, IDs, licences, two quality levels, chunks, manifest, dictionaries, reports
pnpm data:validate  # step 8: technical validation of every release
```

The working folder is `.work/` (not in git; another one: `SVITYLO_ATLAS_WORK=/path`). Blender is set
with the `BLENDER` variable when it is not in `PATH`. The export takes a few minutes, the build about
30 s.

1. **Snapshot and licence inventory.** `sources/zanatomy.lock.json`, `sources/licenses.json`.
2. **Allowed assets.** Every structure with geometry belongs to exactly one entry of the
   `licenses.json` registry (rules `names`, `subtreeOf`, `underGroup`; the last matching rule wins).
   Assets with `commercialUse` ≠ `allowed` are never included: their structures stay in the tree as
   **declared gaps** without geometry (`gap.reason = licence`).
3. **Blender.** `packages/tools/blender/export_zanatomy.py` turns on the system collections, caps the
   subdivision level (`subsurfMax`), applies the [declared geometry corrections](#geometry-corrections),
   applies modifiers and world transforms, welds split normals, and writes the raw geometry and the
   group hierarchy (`*.g`). Label anchor objects (`.j`) and groups without geometry are not imported.
   Faces with a material index outside the object's slots (Blender's Boolean modifier leaves such
   faces on the ethmoid bone) take the object's first material.
4. **Orientation and scale.** Blender Z-up → atlas: metres, **Y up, face towards +Z, the patient's
   left at +X, origin on the floor between the heels**. Checks in `sources/checks.json`: height
   1.5–2.1 m; the sternum in front of the T6 vertebra, the frontal bone in front of the occipital
   bone; left bones at +X; the frontal bone above the calcaneus.
5. **Two quality levels.** meshoptimizer simplification with a bounded error (standard: ≤ 0.2 mm and
   ≤ 0.4% of the structure size; economy: ≤ 0.7 mm and ≤ 2%), with material borders locked. The
   economy geometry is derived from the standard one; both keep every structure for selection.
6. **Chunks.** Files by system and group (target 60 k, maximum 110 k triangles), named after the
   nearest common ancestor, without duplication: each mesh structure is in exactly one file. GLB
   format: one node and one primitive per file, `POSITION`/`NORMAL` attributes (quantised,
   `KHR_mesh_quantization`) and `_ID` (structure and material index), `EXT_meshopt_compression`.
   So a file is one draw call, and merging does not break selection or stable IDs.
7. **Manifest and dictionaries.** `manifest.json` (hierarchy, systems, files with size and SHA-256,
   materials, issues, aliases, assets, reports, `contentHash`), `names/{uk,la,en}.json`,
   `reports/COVERAGE.md` + `coverage.json`, `ATTRIBUTION.md`, `LICENSES.md`, `SHA256SUMS`.
8. **Validation.** Schema and referential integrity, checksums, valid GLB and the ID ↔ mesh mapping,
   scale and orientation, the economy level being cheaper than the standard one, licence consistency,
   and the results of the geometry corrections at both quality levels (openings that must stay closed,
   seams without gaps).
   For publication (`--release`): the `release` channel and an approved audit of every included asset.

## Source files (`packages/data/sources`)

| File | Purpose |
| --- | --- |
| `zanatomy.lock.json` | Commit, checksums, tool versions |
| `licenses.json` | Asset registry: authors, source, licence, commercial use, audit status, membership rules |
| `systems.json` | Z-Anatomy collections → atlas systems (order, loading priority, colour, hidden by default) |
| `ids.json` | **Stable IDs** (source key → ID). Created once and maintained by hand afterwards; renames only through `aliases` |
| `overrides.json` | Flags that are not derived from the hierarchy (e.g. liver segments — `optional`) |
| `issues.json` | Known data issues shown in the structure card |
| `geometry-fixes.json` | [Declared corrections](#geometry-corrections) of the source geometry, with reasons and the notes for the structure cards |
| `materials.json` | Material palette |
| `terms/uk.draft.json` | Ukrainian name drafts by the atlas editors (always unreviewed; they take precedence) |
| `terms/uk.machine.json` | Machine-assisted Ukrainian drafts: prepared by an AI language model from the English and Latin names; only the format is checked automatically |
| `reviews.json` | **Human review records** (see below) |
| `checks.json` | Technical checks of scale and orientation, openings and seams of the geometry corrections |

## Geometry corrections

The export is a thin conversion: it changes the source geometry only where
`sources/geometry-fixes.json` declares it, with a reason for each change. The corrections are applied
by `packages/tools/blender/geometry_fixes.py` before the objects are written:

| Kind | What it does |
| --- | --- |
| `close-hole` | Fills an opening of an object's base mesh with rings of quads around a centre fan; the new vertices minimise the bi-Laplacian energy with the surrounding surface fixed, so the patch continues its curvature. Modifiers and objects generated from the mesh follow the patch (the stomach mucosa is made from the stomach by Geometry Nodes). |
| `join-tube-end` | Moves the end of a curve tube so that its end ring lies on an opening of another object (`opening`: the two loops are matched by arc length) or on its surface (`surface`: along the tube). The displacement fades out along `blendLength`. |
| `seal-opening` | Lays the border of an opening onto the surface of another object; the displacement is harmonic within `falloff` of the border. Suits oblique or stepped edges that a tube cannot follow. |

Tubes and sealed objects are moved before their trailing Solidify modifiers, which are then applied
again, so the walls keep their thickness. A correction that cannot be applied (the opening is not
found, faces would turn over) stops the export. `export.json` records the geometric part of every
declared fix and, for each correction, the gap before and after and the seam; the build refuses an
export made with other fixes (reasons and notes can change without a new export), lists the
corrections in the coverage report (with the seams in atlas coordinates) and shows each note in the
details of its structures' cards, under "Corrected in this atlas" (a resolved geometry issue). The
validation checks the results in the release itself (`checks.json`): `openings` — the number of
openings a structure must have (the stomach: the cardia and the pylorus), `junctions` — every point
of a seam must lie within `maxGap` of both structures at both quality levels.

Corrections in `1.0.0`: the teaching window in the anterior wall of the stomach and its
mucosa (`stomach-window`), the lower end of the oesophagus and the cardiac opening
(`oesophagus-cardia`), the lower edge of the laryngopharynx and the oesophagus
(`pharynx-oesophagus`), the lower end of the small intestine and the ascending colon
(`small-intestine-colon`).

## Review

The pipeline never marks anything as reviewed by itself. Only a person changes a status, in
`reviews.json`; the keys are stable IDs:

```json
{
  "structures": {
    "cardiovascular.heart": { "status": "reviewed", "reviewer": "Name", "date": "2026-10-01", "scope": "geometry, position, hierarchy" },
    "skeletal.femur_l": { "status": "needs-correction", "notes": "The proximal end is cut off." }
  },
  "names": {
    "uk": {
      "cardiovascular.heart": { "review": { "status": "reviewed", "reviewer": "Name", "date": "2026-10-01", "scope": "term" } },
      "visceral.liver": { "name": "Печінка", "synonyms": ["hepar"], "review": { "status": "reviewed", "reviewer": "Name", "date": "2026-10-01", "scope": "term" } }
    }
  }
}
```

- `reviewed` requires `reviewer`, `date` and `scope`; `needs-correction` requires `notes`. An unknown
  ID is a build error.
- A confirmed Ukrainian draft becomes a reviewed editorial name, and its dotted underline in the
  atlas disappears. Unreviewed Ukrainian names are shown with a dotted underline (tree, search, card)
  and no tooltip; the legend at the bottom of the structures panel explains it ("translation not
  reviewed by an expert yet"). A site can show only reviewed names with `uk-names="reviewed"`.
- The names of muscle attachment patches are composed of the Ukrainian muscle name and the kind of
  attachment: origin, insertion or attachment sites («… (початок 2)», «… (прикріплення)»,
  «… (місця прикріплення)»). No Latin names are invented for them.
- Statuses and reviewers are shown in the structure card and in the coverage report.

## Releasing a new data version

1. Change the version in `packages/data/package.json` (semver; a change of geometry or IDs needs a
   new version — never overwrite a published one).
2. `pnpm data:build` (`--channel release` only after an approved audit), `pnpm data:validate`.
3. Update the main package's dependency (it is pinned exactly) and `CHANGELOG.md`.

The build refuses to overwrite a release with the `release` channel. New IDs are added to `ids.json`;
IDs that disappear are either kept "retired" or redirected through `aliases`, so that old links keep
working.

## Synthetic fixtures

`pnpm data:fixture` generates a small model (`test/fixtures/anatomy-data/1.0.0` and `1.1.0`) with
every feature of the format: aliases, an optional subdivision, licence gaps, a hierarchy for
surroundings levels, reviewed names and synonyms, several files. The unit and e2e tests run on it;
they do not need real GLB files.

## Contributing another language

See [CONTRIBUTING.md](../CONTRIBUTING.md) for translation-only PRs and complete locale
integration. Partial drafts are welcome. The current importer explicitly loads the
Ukrainian draft files: adding another JSON file alone does not change the release.
Each new included language asset needs provenance and a separate licence audit;
terminology review and licence approval are distinct decisions.
