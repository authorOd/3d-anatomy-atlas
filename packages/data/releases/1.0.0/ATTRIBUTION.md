# Attribution — adult-male 1.0.0

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

