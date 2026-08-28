---
"@hashintel/petrinaut": patch
---

The experiment metric timeline accepts a pinned time domain — the drawer pins it to the experiment's full window, so charts no longer rescale their x axis while frames stream in or after a sweep selection change — and, given a label, keeps its full-size shell while a metric has no frames yet, so data arriving causes no layout shift.
