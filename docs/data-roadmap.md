# Data roadmap

What the data does not include yet, and the places in the geometry that are planned to be fixed.
State as of data `1.2.0`. What these mean for users is in the [known limitations](known-limitations.md);
the corrections already made are listed in the coverage report of the release
(`packages/data/releases/1.2.0/reports/COVERAGE.md`).

## Not included yet

### Structures without geometry

None since `1.2.0`. The kidneys and the inner ear, gaps in `1.0`, come from the Human Reference Atlas
and OpenEar since `1.1.0`. The cerebral cortex (128 structures) and the white matter (9), gaps in
`1.0` and `1.1` because the licence of their source was not confirmed, are included since `1.2.0`:
compared with the original files, they are Brain for Blender surfaces (CC BY-SA 3.0) and
BodyParts3D meshes (the licence registry, `sources/licenses.json`, has the details).

### Names

| Names | Missing | Note |
| --- | ---: | --- |
| Ukrainian | 3 | The source names these structures "?x" (left and right: `cardiovascular.x_l`, `cardiovascular.x_r`) and "????????" (`cardiovascular.unnamed`, a vein of the heart); they have to be identified first. |
| Latin | 981 | 873 muscle attachment patches (no Latin names are invented for them, by design) and 108 other structures: nervous 55, cardiovascular 32, muscular 16, lymphoid 3, joints 2. |
| Reviewed Ukrainian names | 4,484 | Every Ukrainian name is a draft, 3,330 of them machine-assisted ([issue #2](https://github.com/authorOd/3d-anatomy-atlas/issues/2)). |

### Other open items

| Item | State | What is needed |
| --- | --- | --- |
| Licence audit | Pending for every included asset; the data is on the `preview` channel. | An approved audit, then a data release on the `release` channel. |
| Anatomical review | 0 of 4,484 structures reviewed. | Reviewers; statuses go to `sources/reviews.json`. |
| Body models | One: the adult male body of Z-Anatomy. | Another open model; none chosen yet. |
| Devices | Automated tests run in Chromium with software rendering. | Reports from real devices, especially Windows and Android ([issue #3](https://github.com/authorOd/3d-anatomy-atlas/issues/3)). |

## Planned geometry fixes

Found by `pnpm data:overlaps` on the export of `1.2.0` (the trunk is the same as in `1.1.0`): the trunk organs and their neighbouring
muscles, bones and great vessels. The depth is that of the deepest sampled point of one structure
inside the other; it varies by about 0.5 mm from run to run, because the surface points are
sampled. Not listed: contacts under 2 mm, anatomical passages (the aorta, the inferior vena cava, the
oesophagus and the psoas major through or under the diaphragm) and parts joined by design.
Priority: high from 8 mm, medium from 4 mm, low below.

### Overlaps

| # | Structure | Overlaps with | Depth, mm | Kind | Priority |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Descending colon (`visceral.descending_colon`) | Psoas major, left (`muscular.psoas_major_l`) | 14.9 | organ / muscle | high |
| 2 | Ascending colon (`visceral.ascending_colon`) | Psoas major, right (`muscular.psoas_major_r`) | 12.7 | organ / muscle | high |
| 3 | Liver (`visceral.liver`) | Diaphragm (`muscular.diaphragm`) | 11.2 | organ / muscle | high |
| 4 | Suprarenal gland, left (`visceral.suprarenal_gland_l`) | Spleen (`lymphoid.spleen`) | 11.0 | organ / organ | high |
| 5 | Vermiform appendix (`visceral.vermiform_appendix`) | Psoas major, right (`muscular.psoas_major_r`) | 10.5 | organ / muscle | high |
| 6 | Descending colon (`visceral.descending_colon`) | Iliacus muscle, left (`muscular.iliacus_muscle_l`) | 9.9 | organ / muscle | high |
| 7 | Ascending colon (`visceral.ascending_colon`) | Iliacus muscle, right (`muscular.iliacus_muscle_r`) | 9.2 | organ / muscle | high |
| 8 | Liver (`visceral.liver`) | Stomach (`visceral.stomach`) | 9.1 | organ / organ | high |
| 9 | Pancreas (`visceral.pancreas`) | Inferior vena cava (abdominal part) (`cardiovascular.inferior_vena_cava_abdominal_part`) | 7.1 | organ / vessel | medium |
| 10 | Descending colon (`visceral.descending_colon`) | Jejunum (`visceral.jejunum`) | 6.9 | organ / organ | medium |
| 11 | Inferior lobe of right lung (`visceral.inferior_lobe_of_right_lung`) | Transversus abdominis muscle, right (`muscular.transversus_abdominis_muscle_r`) | 6.7 | lung / muscle | medium |
| 12 | Duodenum (`visceral.duodenum`) | Transverse colon (`visceral.transverse_colon`) | 5.5 | organ / organ | medium |
| 13 | Inferior lobe of left lung (`visceral.inferior_lobe_of_left_lung`) | Transversus abdominis muscle, left (`muscular.transversus_abdominis_muscle_l`) | 5.3 | lung / muscle | medium |
| 14 | Jejunum (`visceral.jejunum`) | Transverse colon (`visceral.transverse_colon`) | 5.1 | organ / organ | medium |
| 15 | Descending colon (`visceral.descending_colon`) | Urinary bladder (`visceral.urinary_bladder`) | 4.9 | organ / organ | medium |
| 16 | Duodenum (`visceral.duodenum`) | Inferior vena cava (abdominal part) (`cardiovascular.inferior_vena_cava_abdominal_part`) | 4.9 | organ / vessel | medium |
| 17 | Sigmoid colon (`visceral.sigmoid_colon`) | Urinary bladder (`visceral.urinary_bladder`) | 4.9 | organ / organ | medium |
| 18 | Vertebra T11 (`skeletal.vertebra_t11`) | Abdominal aorta (`cardiovascular.abdominal_aorta`) | 4.0 | bone / vessel | medium |
| 19 | Inferior lobe of right lung (`visceral.inferior_lobe_of_right_lung`) | Oesophagus (`visceral.oesophagus`) | 3.8 | lung / organ | low |
| 20 | Pancreas (`visceral.pancreas`) | Transverse colon (`visceral.transverse_colon`) | 3.7 | organ / organ | low |
| 21 | Liver (`visceral.liver`) | Suprarenal gland, right (`visceral.suprarenal_gland_r`) | 3.6 | organ / organ | low |
| 22 | Liver (`visceral.liver`) | Transversus abdominis muscle, right (`muscular.transversus_abdominis_muscle_r`) | 3.6 | organ / muscle | low |
| 23 | Duodenum (`visceral.duodenum`) | Abdominal aorta (`cardiovascular.abdominal_aorta`) | 3.5 | organ / vessel | low |
| 24 | Ascending colon (`visceral.ascending_colon`) | Transversus abdominis muscle, right (`muscular.transversus_abdominis_muscle_r`) | 3.4 | organ / muscle | low |
| 25 | Descending colon (`visceral.descending_colon`) | Transversus abdominis muscle, left (`muscular.transversus_abdominis_muscle_l`) | 3.4 | organ / muscle | low |
| 26 | Ascending colon (`visceral.ascending_colon`) | Duodenum (`visceral.duodenum`) | 2.8 | organ / organ | low |
| 27 | Suprarenal gland, left (`visceral.suprarenal_gland_l`) | Diaphragm (`muscular.diaphragm`) | 2.8 | organ / muscle | low |
| 28 | Transversus abdominis muscle, left (`muscular.transversus_abdominis_muscle_l`) | Eleventh rib, left (`skeletal.eleventh_rib_l`) | 2.7 | muscle / bone | low |
| 29 | Transversus abdominis muscle, right (`muscular.transversus_abdominis_muscle_r`) | Eleventh rib, right (`skeletal.eleventh_rib_r`) | 2.7 | muscle / bone | low |
| 30 | Jejunum (`visceral.jejunum`) | Psoas major, right (`muscular.psoas_major_r`) | 2.4 | organ / muscle | low |
| 31 | Transversus abdominis muscle, left (`muscular.transversus_abdominis_muscle_l`) | Twelfth rib, left (`skeletal.twelfth_rib_l`) | 2.3 | muscle / bone | low |
| 32 | Transversus abdominis muscle, right (`muscular.transversus_abdominis_muscle_r`) | Twelfth rib, right (`skeletal.twelfth_rib_r`) | 2.3 | muscle / bone | low |
| 33 | Liver (`visceral.liver`) | Transversus abdominis muscle, left (`muscular.transversus_abdominis_muscle_l`) | 2.2 | organ / muscle | low |
| 34 | Vertebra L1 (`skeletal.vertebra_l1`) | Vertebra L2 (`skeletal.vertebra_l2`) | 2.1 | bone / bone | low |

The kidneys, renal pelves and ureters of `1.1.0` are not in the list: they stay out of their
neighbours (at most 1.3 mm of contact).

### Seams and open ends

| # | Where | Gap, mm | What it is | Plan |
| ---: | --- | ---: | --- | --- |
| 1 | Jejunum, upper end, and duodenum (`visceral.jejunum`, `visceral.duodenum`) | up to 1.4 | The end of the jejunum is partly sunk into the closed end of the duodenum, and part of its rim stands off it. A tube end joined along the tube cannot reach the wall here. | A correction that lays the rim onto the nearest surface. |
| 2 | Inferior lobe of the right lung and diaphragm (`visceral.inferior_lobe_of_right_lung`) | 1.8 | An opening in the surface of the lung (radius about 6 mm) next to the diaphragm. | Close the opening (`close-hole`). |
| 3 | Right kidney: major and minor calices (`visceral.major_calices_r`, `visceral.minor_calices_r`) | 2.0–3.2 (under 1 on average) | Seams of the collecting system of the HRA model deviate at a few points. | Lay the seam onto the neighbouring part. |
| 4 | Right kidney: renal pelvis and major calices (`visceral.renal_pelvis_r`) | 2.0 (0.2 on average) | The same at the pelvis. | The same. |
| 5 | Duodenum near the pancreas (`visceral.duodenum`) | 1.3 | A small opening (radius 0.5 mm) in the wall of the duodenum. | Close the opening (`close-hole`). |

### Head

Found by `pnpm data:overlaps --region head` on the export of `1.2.0`: the brain against the bones of
the cranial vault and base and the dura (the falx cerebri and the tentorium cerebelli). The cortex
regions and the white matter of the telencephalon come from Brain for Blender, the other brain
structures and the bones from BodyParts3D: two bodies, so they overlap a little where they meet.
For the falx and the tentorium the depth is how far a structure reaches into or across the sheet
from its own side; no part of the brain crosses the falx (at most 1.3 mm into it). Not listed:
contacts under 2 mm. The cortex regions are cut from one surface and lie on the white matter, so they
are not checked against each other or against it; the white matter encloses the basal nuclei, the
thalamus and the ventricles by construction. Priority as above.

| # | Structure | Overlaps with | Depth, mm | Kind | Priority |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Cingulate gyrus, posteroventral part, left and right (`nervous.cingulate_gyrus_posteroventral_part_l`, `_r`) | Corpus callosum (`nervous.corpus_callosum`) | 7.1 | cortex / tract | medium |
| 2 | Anterior quadrangular lobule, left and right (`nervous.anterior_quadrangular_lobule_l`, `_r`) | Tentorium cerebelli, reached across (`nervous.tentorium_cerebelli_l`, `_r`) | 6.8 | cerebellum / dura | medium |
| 3 | Olfactory sulcus, left and right (`nervous.olfactory_sulcus_l`, `_r`) | Amygdaloid body, left and right (`nervous.amygdaloid_body_l`, `_r`) | 4.5 | cortex / nucleus | medium |
| 4 | Inferior temporal gyrus, left and right (`nervous.inferior_temporal_gyrus_l`, `_r`) | Temporal bone, left and right (`skeletal.temporal_bone_l`, `_r`) | 4.0 | cortex / bone | medium |
| 5 | Medial occipitotemporal (parahippocampal) gyrus, left and right (`nervous.medial_occipitotemporal_gyrus_parahippocampal_l`, `_r`) | Amygdaloid body, left and right (`nervous.amygdaloid_body_l`, `_r`) | 3.9 | cortex / nucleus | low |
| 6 | Inferior occipital gyrus and sulcus, left and right (`nervous.inferior_occipital_gyrus_and_sulcus_l`, `_r`) | Occipital bone (`skeletal.occipital_bone`) | 3.7 | cortex / bone | low |
| 7 | Triangular part of the inferior frontal gyrus, left and right (`nervous.triangular_part_of_inferior_frontal_gyrus_l`, `_r`) | Frontal bone (`skeletal.frontal_bone`) | 3.1 | cortex / bone | low |
| 8 | Inferior semilunar lobule, left and right (`nervous.inferior_semilunar_lobule_l`, `_r`) | Occipital bone (`skeletal.occipital_bone`) | 3.1 | cerebellum / bone | low |
| 9 | Medial occipitotemporal (parahippocampal) gyrus, left and right | Hippocampus, left and right (`nervous.hippocampus_l`, `_r`) | 2.9 | cortex / hippocampus | low |
| 10 | Medial occipitotemporal (parahippocampal) gyrus, left and right | Temporal bone, left and right | 2.8 | cortex / bone | low |
| 11 | Occipital pole, left and right (`nervous.occipital_pole_l`, `_r`) | Occipital bone | 2.8 | cortex / bone | low |
| 12 | Orbital part of the inferior frontal gyrus, left and right (`nervous.orbital_part_of_inferior_frontal_gyrus_l`, `_r`) | Frontal bone | 2.8 | cortex / bone | low |
| 13 | Temporal pole, left and right (`nervous.temporal_pole_l`, `_r`) | Temporal bone, left and right | 2.8 | cortex / bone | low |
| 14 | Medial occipitotemporal (parahippocampal) gyrus, left and right | Lateral ventricle, left and right (`nervous.lateral_ventricle_l`, `_r`) | 2.6 | cortex / ventricle | low |
| 15 | Orbital gyri, left and right (`nervous.orbital_gyri_l`, `_r`) | Sphenoid bone (`skeletal.sphenoid_bone`) | 2.6 | cortex / bone | low |
| 16 | Frontomarginal gyrus and sulcus, left and right (`nervous.orbital_gyri_frontomarginal_gyrus_and_sulcus_l`, `_r`) | Frontal bone | 2.4 | cortex / bone | low |
| 17 | Temporal pole, left and right | Sphenoid bone | 2.4 | cortex / bone | low |
| 18 | Calcarine sulcus, right (`nervous.calcarine_sulcus_r`) | Lateral ventricle, right | 2.2 | cortex / ventricle | low |
| 19 | Temporal pole, left and right | Amygdaloid body, left and right | 2.2 | cortex / nucleus | low |
| 20 | Cuneus, left (`nervous.cuneus_l`) | Occipital bone | 2.2 | cortex / bone | low |
| 21 | Middle temporal gyrus, left (`nervous.middle_temporal_gyrus_l`) | Parietal bone, left (`skeletal.parietal_bone_l`) | 2.2 | cortex / bone | low |
| 22 | Orbital gyri, left and right | Frontal bone | 2.2 | cortex / bone | low |
| 23 | Superior occipital gyri, left and right (`nervous.superior_occipital_gyri_l`, `_r`) | Occipital bone | 2.2 | cortex / bone | low |
| 24 | Middle frontal gyrus, right (`nervous.middle_frontal_gyrus_r`) | Frontal bone | 2.1 | cortex / bone | low |
| 25 | White matter of the telencephalon, right (`nervous.white_matter_of_telencephalon_r`) | Sphenoid bone | 2.1 | white matter / bone | low |

## Updating this list

After `pnpm data:export`, run `pnpm data:overlaps` and `pnpm data:overlaps --region head`
(maintainers; see the [data pipeline](data-pipeline.md)). They print the overlaps deeper than 2 mm
(for the trunk also the open ends 0.5–5 mm from the nearest structure, for the head the reach into or
across the dura) and write the full reports to `.work/zanatomy/overlaps.json` and
`.work/zanatomy/overlaps-head.json`.
