# Data licences

The terms of the library code do not apply to the data. Each release has its own `LICENSES.md` (the
list of assets, licences, permission for commercial use, inclusion and audit status) and
`ATTRIBUTION.md` (the required attribution and a description of the changes):

- [releases/1.1.0/LICENSES.md](releases/1.1.0/LICENSES.md)
- [releases/1.1.0/ATTRIBUTION.md](releases/1.1.0/ATTRIBUTION.md)

## Summary for 1.1.0

| Asset | Licence | Included |
| --- | --- | --- |
| Z-Anatomy (models based on BodyParts3D, © The Database Center for Life Science) | CC BY-SA 4.0 (BodyParts3D — CC BY-SA 2.1 JP) | yes |
| Z-Anatomy cranial nerves (adapted in part from "Cranial Nerves and Foramina", University of Dundee) | CC BY-SA 4.0 (adapted material — CC BY 4.0) | yes |
| Latin and English names from Z-Anatomy, TA2.csv | CC BY-SA 4.0 | yes |
| Ukrainian name drafts (editorial and machine-assisted) | CC BY-SA 4.0 | yes (marked as drafts) |
| Kidneys — Human Reference Atlas, 3D reference organs (Kristen Browne, Heidi Schlehlein) | CC BY 4.0 | yes |
| Ear: labyrinth, ossicles, tympanic membrane — OpenEar “Delta” (Sieber, Andersen, Sørensen, Mikkelsen) | CC BY 4.0 | yes |
| Inner ear — University of Dundee | CC BY-NC-SA 4.0 | **no** (NonCommercial; replaced by OpenEar) |
| Kidney — Lissie Cowley | CC BY-NC 4.0 | **no** (NonCommercial; replaced by the Human Reference Atlas) |
| Cerebral cortex surfaces ("Brainder") | not confirmed | **no** |
| White matter — University of Washington | not confirmed | **no** |

The audit of every included asset has the status `pending`, so the release is on the `preview`
channel; the `release` channel needs an approved audit of every included asset (checked by the atlas
and by `pnpm data:validate -- --release`).

**ShareAlike.** The models and names are distributed under CC BY-SA: derived data (modified
geometry, dictionaries) must be distributed under the same terms, with the attribution kept. The
kidney and ear models (CC BY 4.0) are adapted (placed into the Z-Anatomy body, the kidneys with the
impressions of their neighbours, parts merged or cut, simplified) and keep their attribution. The
changes made to the models, including the declared geometry corrections
(`sources/geometry-fixes.json`: the stomach window closed; the oesophagus, the laryngopharynx and
the small intestine joined to their neighbours; the intrarenal vessels adapted to the
new kidneys; the ureters moved out of their neighbours and joined to the new renal pelves and to the
bladder), are described in `ATTRIBUTION.md` and in the coverage report of the release. The component
shows the sources and licences in the "Sources and licences" dialog, independently of the link to
Svitylo.
