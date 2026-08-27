---
"@hashintel/petrinaut-core": patch
---

Transitions whose lambda reads no input tokens skip combination enumeration: the HIR analysis marks their compiled artifact, and both engines evaluate the lambda once against the first tokens in place order instead of walking every combination. Trajectories are unchanged for every seed; a never-firing weight-2 transition over 400 tokens drops from 2.5 ms to under a microsecond per run-frame.
