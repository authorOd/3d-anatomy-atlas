# Data pipeline

The atlas data is built reproducibly from a **pinned snapshot** of Z-Anatomy. The pipeline never
downloads the "latest" version: the source commit and the SHA-256 of every input file are recorded
in `packages/data/sources/zanatomy.lock.json`, together with the tool versions; the models from
other sources are pinned the same way in `packages/data/sources/external.json`. Rebuilding from the
same inputs on the same platform gives a byte-identical release (checked: two exports are
identical, and `SHA256SUMS` before and after a rebuild match). The export runs Blender with one
thread (`tools.threads` in the lock): with several threads, Blender varies the last bit of some
normals from run to run, which changes the GLB files though not the shapes. Between platforms the
last bits of the normals differ too: the decoded geometry is the same, but the meshopt encoding of
some files is not. `pnpm data:build --previous <folder of the previous release>` therefore copies a
chunk file from the previous release when its decoded content (nodes, attributes, indices) is
unchanged, so a new version replaces only the files whose geometry changed.

## Source

| | |
| --- | --- |
| Repository | https://github.com/Z-Anatomy/Models-of-human-anatomy |
| Commit | `e38ea5e6c7e22d229a975f3fde563a5aca52099e` (2026-09-24) |
| Input files | `Z-Anatomy.zip` → `Startup.blend`, `License.txt`, `TA2.csv`; the files of [other sources](#models-from-other-sources) |
| Tools | Blender 4.0.2 (headless, one thread), glTF Transform 4, meshoptimizer |

## Steps

```sh
pnpm data:source    # step 1: clone the pinned commit without history, verify SHA-256, extract Startup.blend;
                    #         download and verify the files of the other sources (.work/external)
pnpm data:fit       # maintainers only, when a source changes: place the other models → sources/external-fit.json
pnpm data:export    # step 3: headless Blender: other models, transforms, modifiers, normals, hierarchy → .work/zanatomy/export
pnpm data:overlaps  # maintainers only, after the export: overlaps and open ends of the trunk organs → .work/zanatomy/overlaps.json
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
| `external.json` | [Models from other sources](#models-from-other-sources): files (address, SHA-256), the snapshot objects they replace, group labels, one object per structure |
| `external-fit.json` | Generated by `pnpm data:fit` and committed after review: transforms (with the kidney impressions), labyrinth parts, warp fields, ureter joins |

## Geometry corrections

The export is a thin conversion: it changes the source geometry only where
`sources/geometry-fixes.json` declares it, with a reason for each change. The corrections are applied
by `packages/tools/blender/geometry_fixes.py` before the objects are written:

| Kind | What it does |
| --- | --- |
| `close-hole` | Fills an opening of an object's base mesh with rings of quads around a centre fan; the new vertices minimise the bi-Laplacian energy with the surrounding surface fixed, so the patch continues its curvature. Modifiers and objects generated from the mesh follow the patch (the stomach mucosa is made from the stomach by Geometry Nodes). |
| `join-tube-end` | Moves the end of a curve tube so that its end ring lies on an opening of another object (`opening`: the two loops are matched by arc length) or on its surface (`surface`: along the tube). The displacement fades out along `blendLength`. |
| `seal-opening` | Lays the border of an opening onto the surface of another object; the displacement is harmonic within `falloff` of the border. Suits oblique or stepped edges that a tube cannot follow. |
| `warp-curves` | Moves the control points (and handles) of a curve by a smooth field of Gaussian radial basis functions from `external-fit.json` (in rounds, each with its own width), identified by `fieldSha256`. |

`join-tube-end` can also narrow a flared end first (`endRadius`, the curve point radius of the end
points), and any correction can allow a larger seam than the default 0.2 mm (`maxGap`, a check
only).

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

Corrections in `1.1.0`: the teaching window in the anterior wall of the stomach and its
mucosa (`stomach-window`), the lower end of the oesophagus and the cardiac opening
(`oesophagus-cardia`), the lower edge of the laryngopharynx and the oesophagus
(`pharynx-oesophagus`), the lower end of the small intestine and the ascending colon
(`small-intestine-colon`); the intrarenal arteries and veins of both kidneys (`kidney-arteries-l`,
`kidney-veins-l`, `kidney-arteries-r`, `kidney-veins-r`), the course of the ureters, moved out of
their neighbours (`ureter-course-l`, `ureter-course-r`), their upper ends and the new renal pelves
(`ureter-pelvis-l`, `ureter-pelvis-r`), and their lower ends and the urinary bladder
(`ureter-bladder-l`, `ureter-bladder-r`).

`pnpm data:overlaps` (maintainers, after the export) reviews the trunk organs: the depth of every
overlap between two structures and the gap at every open end of a structure. What it finds in the
snapshot itself is listed in the [known limitations](known-limitations.md).

## Models from other sources

Some structures come from other open models, placed into the Z-Anatomy body:

| Structures | Source | Licence |
| --- | --- | --- |
| Kidneys: fibrous capsule, hilum, renal cortex, renal columns, renal pyramids, renal papillae; renal pelvis with the major and minor calices | Human Reference Atlas, 3D reference organs: kidney v1.3 and ureter v1.2 of the Visible Human Male | CC BY 4.0 |
| Cochlea (scala vestibuli, scala tympani), vestibule, semicircular canals and common bony limb; malleus, incus, stapes; tympanic membrane | OpenEar, temporal bone “Delta” (Zenodo 4362584) | CC BY 4.0 |

They replace snapshot objects whose models cannot be included (the kidney and the inner ear are
CC BY-NC) or whose provenance could not be confirmed (the ossicles and the tympanic membrane, which
the excluded inner-ear model may have included).

- `sources/external.json` declares the files (address and SHA-256; `pnpm data:source` downloads and
  verifies them), the snapshot objects they replace, the sided group labels (`Kidney.l.g`,
  `Cochlea.l.g`, `Semicircular canals.l.g`) and one object per structure: source nodes or file,
  parent, material and licence record. `clearOf` keeps a thin layer at least a given distance
  outside the surface it lies on: the HRA fibrous capsule lies 0.1–0.3 mm from the cortex, and
  surfaces that close flicker when rendered, so it is kept 0.5 mm outside.
- `sources/external-fit.json` holds the transforms (for the kidneys followed by their impressions),
  the labyrinth parts and the warp fields. It is computed by `pnpm data:fit`
  (`packages/tools/blender/fit_external.py`) from the snapshot and these files and committed after
  review; the export only applies it (`packages/tools/blender/external_meshes.py`) and never fits
  anything. `pnpm data:fit --keep-kidney-placement` keeps the kidney shifts and scale and computes
  only the fields again.
- **Ear:** a similarity transform by iterative closest points on the malleus, incus, stapes and
  tympanic membrane of each side (0.35 mm apart on average, scale 1.05). OpenEar is a right ear;
  the left ear is its mirror image.
- **Kidneys:** no rotation, so they keep their natural orientation; one uniform scale for both
  (0.83) and a shift for each, fitted to the Z-Anatomy intrarenal vessels, renal branches and
  ureters while the neighbours (suprarenal gland, liver or spleen, intestine, pancreas, muscles,
  diaphragm, ribs, vertebrae, great vessels) stay out of the kidney — the solid enclosed by the HRA
  fibrous capsule and hilum. Where a neighbour would still enter it, a smooth inward field gives
  the kidney its impression (up to 6 mm); all parts of the kidney and its intrarenal vessels follow
  it. The Z-Anatomy intrarenal vessels were modelled for the excluded kidney, and the ureters partly
  lie inside the psoas major and the duodenum: the declared corrections `kidney-*` and `ureter-*`
  adapt them. All fields are kernel smoothers (no system is solved, so they do not oscillate),
  computed coarse to fine where large moves are needed; the fit refuses a field that folds space.
- **Labyrinth:** the OpenEar scala vestibuli includes the vestibule and the canals. The lumen
  diameter, the distance to the scala tympani and three planes (one per canal) split it, and every
  border between two parts is a declared cutting plane, so the parts get straight borders.

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

1. Change the version in `packages/data/package.json` and `DATA_VERSION` in
   `packages/data/index.js` (semver; a change of geometry or IDs needs a new version — never
   overwrite a published one).
2. Copy the previous release folder out of the working tree (for example to `.work/previous/`) and
   remove it from `packages/data/releases/`: the repository and the npm package carry only the
   current release; older ones stay in the git history, the tags and on npm.
3. `pnpm data:build --previous .work/previous/<version>` (`--channel release` only after an approved
   audit), `pnpm data:validate`.
4. Update the main package's dependency (it is pinned exactly) and `CHANGELOG.md`.

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
