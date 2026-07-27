---
"@hashintel/petrinaut-core": patch
---

Fix predicate (boolean guard) transitions not firing on the first simulation frame or on consecutive frames. A true guard now fires in the same step it becomes true, instead of every other frame.
