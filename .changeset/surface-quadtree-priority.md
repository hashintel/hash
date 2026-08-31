---
"@hashintel/petrinaut": patch
---

The sweep surface samples its grid in quad-tree levels (corners first, each level splitting every region in two per axis) with several chunks in flight, and always lets the navigator's selected point stream its first frames before surface sampling starts or resumes — on open and after every slider move.
