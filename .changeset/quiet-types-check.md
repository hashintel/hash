---
"@hashintel/petrinaut-core": patch
---

Fix Node-facing compiler entries by loading TypeScript 6 as a dependency rather than bundling browser stubs, and preserve diagnostic types in generated declarations. Bundle the matching standard-library declarations in the browser language-service worker.
