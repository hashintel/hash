---
"@hashintel/petrinaut": patch
---

Ship Panda static-analysis build info (`@hashintel/petrinaut/panda.buildinfo.json`) and a shared theme preset (`@hashintel/petrinaut/panda-preset`) so host applications can compile Petrinaut's styles through their own Panda pipeline instead of relying on two independently generated, layer-polyfilled bundles. Petrinaut's keyframes are now namespaced (`petrinautFadeIn`, `petrinautExpand`, ...) so they can never collide with — and be deep-merged into — a host theme's keyframes.
