---
"@hashintel/petrinaut-core": patch
---

GPU experiments stream sooner: a streamed run opens with a small preview tile (a usable full-timeline picture before the bulk computes), and one GPU backend — device, compiled shader, learned calibration — is reused across a session's batches instead of being rebuilt and re-probed per ladder rung.
