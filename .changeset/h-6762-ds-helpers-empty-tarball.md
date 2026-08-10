---
"@hashintel/ds-components": patch
"@hashintel/ds-helpers": patch
---

Stop `@hashintel/ds-helpers` publishing empty tarballs. `@hashintel/ds-components`' Panda codegen no longer runs with `--clean`, which emptied `ds-helpers`' `styled-system/` directory — the package's entire published payload — while a concurrent `changeset publish` worker was packing it. `ds-helpers` now also verifies at pack time that every `main`/`types`/`exports` target resolves to a real, non-empty file, and drops the `./recipes` export and the `import`/`require` conditions on `./types`, which have never resolved to a generated file in any published version.
