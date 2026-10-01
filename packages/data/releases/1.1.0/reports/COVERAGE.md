# Coverage report — adult-male 1.1.0 (preview)

The dataset is a general-coverage adult male model built from the pinned source snapshot.
Presence of an organ does not imply that all of its internal components are modelled.

## Systems

| System | Structures | With geometry | Gaps | Triangles (standard) | Triangles (economy) |
| --- | ---: | ---: | ---: | ---: | ---: |
| regions | 291 | 256 | 0 | 104,698 | 52,956 |
| muscular | 779 | 683 | 0 | 1,339,851 | 366,746 |
| skeletal | 309 | 277 | 0 | 247,772 | 75,895 |
| joints | 476 | 413 | 0 | 159,752 | 64,663 |
| cardiovascular | 704 | 676 | 0 | 444,134 | 108,144 |
| visceral | 167 | 133 | 0 | 198,844 | 60,271 |
| nervous | 677 | 455 | 137 | 278,417 | 69,579 |
| lymphoid | 208 | 163 | 0 | 62,088 | 14,982 |
| insertions | 873 | 705 | 0 | 207,334 | 39,280 |

## Totals

- Structures: 4484 (with geometry: 3761, declared gaps: 137)
- Chunks: 61
- Triangles: standard 3,042,890, economy 852,516
- Size: standard 56.3 MB, economy 21.4 MB, metadata 2.26 MB

## Names

| Language | Present | Reviewed | Drafts | of them machine-assisted | Missing |
| --- | ---: | ---: | ---: | ---: | ---: |
| uk | 4481 | 0 | 4481 | 3330 | 3 |
| la | 3503 | 0 | 0 | 0 | 981 |
| en | 4484 | 0 | 0 | 0 | 0 |

Unreviewed Ukrainian names (translation drafts) are shown marked as drafts; a site can show reviewed ones only
(`uk-names="reviewed"`). Machine-assisted drafts were prepared with an AI language model and checked for format
only. Where there is no Ukrainian name, the English name is shown and labelled as English.

## Anatomical review

- Reviewed: 0; unreviewed: 4484; needs correction: 0.
- No independent anatomical review of the source data has been performed for this release.

## Excluded assets

- **Anatomy of the Inner Ear — University of Dundee School of Medicine** (CC-BY-NC-SA-4.0): The snapshot Readme names this NC model as used or adapted. The snapshot does not record which inner ear meshes derive from it, so the inner ear group (cochlea, vestibule) is blocked until its provenance is verified or the geometry is replaced.
- **Kidney — Lissie Cowley** (CC-BY-NC-4.0): The snapshot Readme names this NC model. The left and right kidney and renal pelvis meshes are not mirror copies and their provenance is not recorded, so exactly these four meshes are blocked; other urinary organs are not affected.
- **Cerebral cortex surfaces — “Brainder” (FreeSurfer surfaces with Destrieux parcellation)** (LicenseRef-unverified): The snapshot Readme names “Brainder” as used or adapted without stating its licence. Cortex meshes of the telencephalon lobes carry Destrieux atlas labels (e.g. “Lat_Fis-ant-Horizont”), which indicates this origin. Blocked until the licence of the original material is confirmed.
- **White matter models — University of Washington** (LicenseRef-unverified): The snapshot Readme names “White matter” from the University of Washington as used or adapted without a licence. The white matter group and the white matter of the telencephalon are blocked until the licence is confirmed.

## Declared gaps

137 structures are listed without geometry:

- brainder-cortex: 128 (nervous.inferior_frontal_sulcus_l, nervous.inferior_frontal_sulcus_r, nervous.orbital_part_of_inferior_frontal_gyrus_r, nervous.lat_fis_ant_horizont_l, nervous.lat_fis_ant_horizont_r, nervous.lat_fis_ant_vertical_l, nervous.lat_fis_ant_vertical_r, nervous.middle_frontal_gyrus_l, …)
- uw-white-matter: 9 (nervous.white_matter_of_telencephalon_l, nervous.anterior_commissure, nervous.corpus_callosum, nervous.hippocampal_commissure, nervous.fornix_l, nervous.fornix_r, nervous.stria_terminalis_l, nervous.stria_terminalis_r, …)

## Not imported from the source

- Blender objects skipped (no-geometry): 1575
- Blender objects skipped (label): 8
- Label groups without geometry: 66
- Label anchor objects (".j"): 1

## Geometry corrections

The source geometry is changed only in these declared places (`sources/geometry-fixes.json`); the card of each
structure shows a note, and the validation checks the seams.

- **stomach-window** (close-hole; visceral.stomach, visceral.mucosa_of_stomach): Z-Anatomy cuts a round teaching window (about 5 cm) into the anterior wall of the stomach; the mucosa is generated from the wall and has the same window. In the atlas it reads as a defect, and the mucosa can be seen with transparency or the surroundings level instead.
- **oesophagus-cardia** (join-tube-end; visceral.oesophagus): The oesophagus is a curve with a flat oval profile; its lower end is 3 mm off the round cardiac opening of the stomach and turned by 25°, leaving a gap of up to 5 mm. Largest gap: 5.0 mm before, 0.1 mm after.
- **pharynx-oesophagus** (seal-opening; visceral.laryngopharynx): The lower opening of the laryngopharynx is oblique: its posterior edge is at the upper end of the oesophagus, while its anterior part reaches down to the lower border of the cricoid cartilage 13 mm in front of the oesophagus, leaving the opening uncovered. Largest gap: 13.3 mm before, 0.0 mm after.
- **small-intestine-colon** (join-tube-end; visceral.jejunum): The small intestine is one curve in the source; its lower end stops short of the wall of the ascending colon, leaving a gap of up to 10 mm. Largest gap: 9.6 mm before, 0.0 mm after.
- **kidney-arteries-l** (warp-curves; cardiovascular.intrarenal_arteries_of_left_kidney): The Z-Anatomy intrarenal arteries of the left kidney were modelled for a kidney the atlas does not include (CC BY-NC). With the HRA kidney in its natural orientation part of the branches lay outside it; a smooth field (pnpm data:fit) moves them inside and holds the junction with the trunk; they also follow the impressions that the kidney takes from its neighbours. Largest displacement: 11.0 mm.
- **kidney-veins-l** (warp-curves; cardiovascular.intrarenal_veins_of_left_kidney): The Z-Anatomy intrarenal veins of the left kidney were modelled for a kidney the atlas does not include (CC BY-NC). With the HRA kidney in its natural orientation part of the branches lay outside it; a smooth field (pnpm data:fit) moves them inside and holds the junction with the trunk; they also follow the impressions that the kidney takes from its neighbours. Largest displacement: 18.2 mm.
- **kidney-arteries-r** (warp-curves; cardiovascular.intrarenal_arteries_of_right_kidney): The Z-Anatomy intrarenal arteries of the right kidney were modelled for a kidney the atlas does not include (CC BY-NC). With the HRA kidney in its natural orientation part of the branches lay outside it; a smooth field (pnpm data:fit) moves them inside and holds the junction with the trunk; they also follow the impressions that the kidney takes from its neighbours. Largest displacement: 22.3 mm.
- **kidney-veins-r** (warp-curves; cardiovascular.intrarenal_veins_of_right_kidney): The Z-Anatomy intrarenal veins of the right kidney were modelled for a kidney the atlas does not include (CC BY-NC). With the HRA kidney in its natural orientation part of the branches lay outside it; a smooth field (pnpm data:fit) moves them inside and holds the junction with the trunk; they also follow the impressions that the kidney takes from its neighbours. Largest displacement: 20.2 mm.
- **ureter-pelvis-l** (join-tube-end; visceral.ureter_l): The upper end of the Z-Anatomy left ureter widens into a funnel (to 7.5 mm) that met a kidney the atlas does not include; it stops 14 mm short of the outlet of the HRA renal pelvis, whose pelvi-ureteric junction narrows to about 2 mm. Largest gap: 12.9 mm before, 0.2 mm after.
- **ureter-pelvis-r** (join-tube-end; visceral.ureter_r): The upper end of the Z-Anatomy right ureter widens into a funnel (to 7.5 mm) that met a kidney the atlas does not include; it stops 16 mm short of the outlet of the HRA renal pelvis, whose pelvi-ureteric junction narrows to about 2 mm. Largest gap: 16.7 mm before, 0.1 mm after.
- **ureter-course-l** (warp-curves; visceral.ureter_l): The Z-Anatomy left ureter, running from the new renal pelvis, partly lies inside the psoas major (up to 5 mm); a smooth field (pnpm data:fit) moves it out of its neighbours and holds both ends, which are joined separately. Largest displacement: 5.6 mm.
- **ureter-course-r** (warp-curves; visceral.ureter_r): The Z-Anatomy right ureter, running from the new renal pelvis, partly lies inside the psoas major and the duodenum (up to 8 mm); a smooth field (pnpm data:fit) moves it out of its neighbours and holds both ends, which are joined separately. Largest displacement: 7.7 mm.
- **ureter-bladder-l** (join-tube-end; visceral.ureter_l): The lower end of the Z-Anatomy left ureter stops up to 2.9 mm short of the wall of the urinary bladder. Largest gap: 2.9 mm before, 0.0 mm after.
- **ureter-bladder-r** (join-tube-end; visceral.ureter_r): The lower end of the Z-Anatomy right ureter stops up to 2.4 mm short of the wall of the urinary bladder. Largest gap: 2.4 mm before, 0.0 mm after.

## Notes

- Source: https://github.com/Z-Anatomy/Models-of-human-anatomy at e38ea5e6c7e22d229a975f3fde563a5aca52099e; Blender 4.0.2; subdivision capped at level 1.
- Structures follow the source hierarchy; label groups without geometry and text labels of sub-regions are not imported.
- Economy geometry is derived from the standard level; both levels keep every selectable structure.
- Standard simplification: max error 0.2 mm (≤ 0.4% of the structure size); economy: 0.7 mm (≤ 2%).
