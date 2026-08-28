---
"@hashintel/petrinaut": patch
---

Parameter sweeps declare an interval per swept parameter instead of a value count. The navigator becomes a range slider per parameter — the whole interval selected by default, resizable, collapsible to a point — with the interval quantized into ~50 positions so revisited positions restore their cached runs. A range selection samples points across the region in a low-discrepancy order and streams the merged distribution over the region; a point behaves as before.
