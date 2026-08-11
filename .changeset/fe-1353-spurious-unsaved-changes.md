---
"@hashintel/petrinaut-core": patch
---

Fix a net being reported as having unsaved changes immediately after loading, without the user editing anything. `sanitizeSDCPNForExtensions` no longer adds the optional `scenarios`, `metrics`, `subnets` and `componentInstances` keys with a value of `undefined` when they are absent on the source, and `isSDCPNEqual` now treats a key set to `undefined` as absent, matching the JSON form a definition is persisted in.
