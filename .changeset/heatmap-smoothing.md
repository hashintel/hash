---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Distribution metric frames carry the extent of their bins (`binExtent`, set by width binning and GPU histogram windows), and distribution heatmaps paint each bin across the rows that extent covers, so frames binned at different strides no longer alias into alternating dark and empty rows. Streamed heatmap updates ease into the picture and settle instead of snapping, so re-deliveries no longer flash.
