# Licensing the atlas

The project's own software is licensed under **CPAL-1.0**. The full terms and the
completed Svitylo attribution information are in [LICENSE.md](../LICENSE.md).
This guide explains those terms; it does not add conditions to the licence.

## Commercial and closed-source integrations

Commercial use is allowed. A larger application may keep its independently written
code under its own licence, including a proprietary licence. CPAL continues to govern
the covered atlas code and modifications to it. It is not permission to keep modified
atlas code closed when CPAL requires its source to be made available.

Provide the corresponding source, notices, licence and a dated description of changes
when required by Sections 3 and 15. External deployment, including qualifying network
use, triggers the source obligations even without a conventional software download.
A link to the original repository alone is insufficient if you changed the covered code.
Keep source available for the periods specified in Section 3.2.

The initial source is at https://github.com/authorOd/3d-anatomy-atlas.
The JavaScript library packages include their `src/` directories; the Composer package
includes PHP source and JavaScript resources. Preserve these sources or provide the
corresponding source of your modified distribution by a CPAL-compliant mechanism.

## Svitylo attribution

Exhibit B requires attribution in Larger Works as well as in the atlas itself:

- https://svitylo.com.
- One supplied Svitylo logo: the full logo or the compact mark.

No separate graphical copyright notice or phrase is specified in Exhibit B.
Copyright notices in source and distributions must still be preserved.

Section 14 governs prominence and display at launch or the beginning of a session.
It permits forms such as a splash screen; **CPAL does not require a permanently visible
logo in every state**. The stock component keeps its logo visible during loading,
errors, mobile and fullscreen use and has no setting to disable it. This is the
component's implementation, not an additional licence restriction. Its Sources and
licences panel also identifies the copyright holder and source availability.

If you use the headless core with your own graphical interface, fulfil Section 14 in
the end-user interface used to access the covered code. Importing `/core` or moving
processing to a server is not, by itself, an attribution exemption. For CLI or batch
processing without such a graphical interface, Section 14(a)'s graphical attribution
obligation does not apply. Other source, copyright and licence obligations still apply.

Data exported by a CLI retains its data licences. It does not acquire CPAL or a new
logo requirement merely because a CPAL tool processed it. Independent use of CC data
is governed by those data licences.

## Data and dependencies

Models, names and dictionaries retain the licences in the [data registry](../packages/data/LICENSES.md).
Original translation contributions are offered under CC BY-SA 4.0 to the extent the
contributor holds relevant rights; this does not claim copyright in public-domain terms.
CPAL does not replace the CC attribution and ShareAlike obligations.

Three.js, Lit, Zod and other third-party dependencies retain their own licences and
notices. CPAL applies only to code the project's rights holders can license.

## Editors

The packages contain no editor plugins and no code that depends on CKEditor 5; Svitylo
builds its CKEditor integration itself. CPAL grants no licence to an editor: an
integration that combines one with the atlas must be covered by that editor's terms.

## Educational purpose

The atlas is intended for anatomical education, not diagnosis, treatment or clinical
decision-making. This describes its intended purpose and is not a field-of-use
restriction added to CPAL. The standard warranty and liability provisions are in
Sections 7 and 9. A downstream product's regulatory status depends on that product.

## Maintaining the licence

The standard terms in Sections 1–15 are unchanged, including the California-law
provisions in Section 11. The initial text was obtained from the
[SPDX v3.27.0 CPAL text](https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/CPAL-1.0.txt)
and checked against the [OSI licence](https://opensource.org/license/CPAL-1.0).
Exhibits A and B identify the project, its developer and attribution. No alternative
licence is offered.

Keep the four code `LICENSE.md` files and the data package's `CODE-LICENSE.md` consistent.
Copy the completed Exhibit A notice into new source files as required by Section 3.5;
for formats that cannot contain comments, place it in an accompanying discoverable
licence file. Preserve third-party notices. New source files in the data package must
refer to `CODE-LICENSE.md`; anatomical data remains separately licensed.

The CPAL licence of the code does not approve any data audit.
