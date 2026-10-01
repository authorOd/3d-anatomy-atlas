# Attribution — adult-male 1.1.0

This data release contains material from the following sources. Their licences are kept; the atlas code licence does not apply to them.

## Z-Anatomy — The libre 3D atlas of anatomy (models derived from BodyParts3D)

“Z-Anatomy — The libre 3D atlas of anatomy”, CC BY-SA 4.0, based on “BodyParts3D, © The Database Center for Life Science”, CC BY-SA 2.1 Japan. Adapted for Svitylo 3D Anatomy Atlas.

- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
- Source: [Z-Anatomy/Models-of-human-anatomy (Z-Anatomy.zip → Startup.blend)](https://github.com/Z-Anatomy/Models-of-human-anatomy), commit e38ea5e6c7e22d229a975f3fde563a5aca52099e; Startup.blend dated 2023-05-02
- Changes: Modifiers evaluated in Blender (subdivision capped at level 1) and curves converted to their bevelled surfaces; declared geometry corrections (sources/geometry-fixes.json, listed in the coverage report and noted in the structure cards): the teaching window in the anterior wall of the stomach and its mucosa closed with a patch that continues the wall, the lower end of the oesophagus blended into the cardiac opening, the lower edge of the laryngopharynx laid onto the oesophagus, and the lower end of the small intestine blended onto the ascending colon; converted to +Y up, metres, origin on the floor between the heels; each structure simplified into two quality levels with meshoptimizer; merged into region chunks with quantisation and EXT_meshopt_compression; hierarchy and names moved into the manifest and dictionaries; display colours assigned by material name.
- Licence audit: pending

## Cranial nerves — Z-Anatomy, adapted in part from “Cranial Nerves and Foramina” (University of Dundee, CAHID)

“Z-Anatomy — The libre 3D atlas of anatomy”, CC BY-SA 4.0; may include material adapted from “Cranial Nerves and Foramina” by the University of Dundee, CAHID, CC BY 4.0. Adapted for Svitylo 3D Anatomy Atlas.

- Licence: [Creative Commons Attribution-ShareAlike 4.0 International (adapted material: CC BY 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)
- Source: [Z-Anatomy/Models-of-human-anatomy (Startup.blend, group “Cranial nerves”)](https://github.com/Z-Anatomy/Models-of-human-anatomy), commit e38ea5e6c7e22d229a975f3fde563a5aca52099e
- Changes: As for the main Z-Anatomy record.
- Licence audit: pending

## Latin and English structure names — Z-Anatomy object names and TA2.csv

Structure names from “Z-Anatomy — The libre 3D atlas of anatomy” (CC BY-SA 4.0), including its TA2.csv term list based on Terminologia Anatomica 2 (FIPAT).

- Licence: [Creative Commons Attribution-ShareAlike 4.0 International (as stated by the snapshot)](https://creativecommons.org/licenses/by-sa/4.0/)
- Source: [Z-Anatomy object names and TA2.csv of the pinned snapshot](https://github.com/Z-Anatomy/Models-of-human-anatomy), commit e38ea5e6c7e22d229a975f3fde563a5aca52099e; TA2.csv sha256 0f9092a3…
- Changes: English names taken from object names (side suffixes moved to a separate field); Latin names matched to English names through TA2.csv; no names were generated.
- Licence audit: pending

## Ukrainian name drafts (unreviewed; partly machine-assisted)

Ukrainian name drafts: Svitylo 3D Anatomy Atlas contributors, CC BY-SA 4.0.

- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
- Source: [packages/data/sources/terms/uk.draft.json and uk.machine.json](https://github.com/authorOd/3d-anatomy-atlas), see data release version
- Changes: Written for this atlas: editors' drafts (uk.draft.json) and machine-assisted drafts (uk.machine.json, prepared with an AI language model from the English and Latin names and checked automatically for format only); names of muscle attachment patches are composed from the muscle name and the kind of attachment. Every entry is an unreviewed draft and is marked as a draft in the atlas.
- Licence audit: pending

## 3D Reference Organs: Kidney v1.3 and Ureter v1.2, Visible Human Male, left and right (Human Reference Atlas)

Browne K., Schlehlein H., “3D Reference Organ for Kidney, Male, Left v1.3” (doi:10.48539/HBM759.JKKF.434) and “… Right v1.3” (doi:10.48539/HBM364.QTSC.334); “3D Reference Organ for Ureter, Male, Left v1.2” (doi:10.48539/HBM434.VLQJ.299) and “… Right v1.2” (doi:10.48539/HBM852.SVFJ.388); Human Reference Atlas, CC BY 4.0. Adapted for Svitylo 3D Anatomy Atlas.

- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Source: [HRA 3D Reference Object Library: kidney-male-left and kidney-male-right v1.3, ureter-male-left and ureter-male-right v1.2](https://humanatlas.io/3d-reference-library), kidney v1.3, ureter v1.2
- Changes: Placed into the Z-Anatomy body without rotation: one uniform scale for both kidneys and a shift for each, fitted to the Z-Anatomy renal vessels and ureters with the neighbouring organs, muscles and bones kept outside; where a neighbour would still enter a kidney, the kidney is given its impression (a smooth inward deformation of up to 6 mm); the fibrous capsule kept at least 0.5 mm outside the cortex (they nearly coincide in the source, which flickers when rendered); the pyramids, papillae and calices of each kidney merged into one structure each; duplicate vertices welded; normals recomputed; the HRA ureter not used; simplified to the atlas quality levels.
- Licence audit: pending

## OpenEar: temporal bone “Delta” (Visible Ear Simulator anatomy)

Sieber D. M., Andersen S. A. W., Sørensen M. S., Mikkelsen P. T., “OpenEar color example from Visible Ear Simulator anatomy Delta”, Zenodo, doi:10.5281/zenodo.4362584, CC BY 4.0; OpenEar library: Sieber D. et al., Scientific Data 6, 180297 (2019), doi:10.1038/sdata.2018.297. Adapted for Svitylo 3D Anatomy Atlas.

- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Source: [Zenodo record 4362584: ScalaVestibuli, ScalaTympani, Malleus, Incus, Stapes, TympanicMembrane](https://doi.org/10.5281/zenodo.4362584), record 4362584
- Changes: Millimetres converted to metres; placed into the Z-Anatomy body by a similarity transform fitted on the ossicles and the tympanic membrane (a right ear; mirrored for the left); the scala vestibuli split into its cochlear part, the vestibule, the three semicircular canals and the common bony limb along declared planes; normals recomputed; simplified to the atlas quality levels.
- Licence audit: pending

