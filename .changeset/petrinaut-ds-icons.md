---
"@hashintel/petrinaut": patch
---

Petricon now comes from `@hashintel/ds-icons`, which Petrinaut installs as a dependency. Hosts that compile Petrinaut's styles from `@hashintel/petrinaut/panda.buildinfo.json` must now also include `@hashintel/ds-icons/panda.buildinfo.json`; `@hashintel/petrinaut/panda-preset` still supplies the icon keyframes.
