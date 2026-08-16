---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Reject net identifiers that collide with `Object.prototype` member names (`__proto__`, `constructor`, ...) at file import and at the simulation boundary, build all records keyed by user-authored strings without a prototype, bind compiled-program parameters as frozen prototype-free copies, and run place visualizer code under the same sandbox hardening as scenario code.
