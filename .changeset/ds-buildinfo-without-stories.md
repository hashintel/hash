---
"@hashintel/ds-components": patch
---

Stop shipping invalid styles in `panda.buildinfo.json`: those extracted from story and test files, and from component props named like CSS properties (`position`, `overflow`, `width`, `direction`)
