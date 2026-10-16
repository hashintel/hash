---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Net identifiers named after `Object.prototype` members, such as `__proto__`, are rejected at import and before simulation. Place visualizer code runs under the same sandbox as scenario code.
