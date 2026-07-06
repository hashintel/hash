---
"@hashintel/petrinaut": minor
"@hashintel/petrinaut-core": minor
---

Add discrete token attribute types (`integer`, `boolean`) to Petrinaut. Transition kernels assign them; dynamics can read but not update them. Integers are stored as Float64 and rounded on read/write (exact within ±2^53).
