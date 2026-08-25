---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Reject net identifiers that collide with `Object.prototype` member names (`__proto__`, `constructor`, ...) at file import and before simulation, and store user-authored keys in prototype-free records. Place visualizer code now runs under the same sandbox hardening as scenario code.
