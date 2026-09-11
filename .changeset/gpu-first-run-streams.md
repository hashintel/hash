---
"@hashintel/petrinaut-core": patch
---

The GPU backend's capacity probe runs after the experiment starts, so a batch's first frames stream instead of arriving once the probe is done.
