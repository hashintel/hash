---
"@hashintel/petrinaut-core": patch
---

The connected optimization capability gains `pauseOptimizationRun`, which drains the running segment: no further trial is asked, the trials in flight are told and reported, and the segment ends with a new `paused` event that keeps the study resumable.
