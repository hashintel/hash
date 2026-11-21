---
"@hashintel/petrinaut": patch
---

Removes the icon exports from `@hashintel/petrinaut/ui`: `Petricon`, `ExperimentalIcon`, their providers and types, and the component of each icon. Import icons from `@hashintel/ds-icons`. The editor and `PetrinautPreview` always draw their icons from that set: in the preview, the icons of the design system's buttons and menus change to its drawings, and the play button's icon moves only while the Animations setting is on.
