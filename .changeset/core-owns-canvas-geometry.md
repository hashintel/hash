---
"@hashintel/petrinaut-core": patch
---

The layout module exports the canvas geometry: render node dimensions (`compactNodeDimensions`, `classicNodeDimensions`, `getComponentInstanceHeight`), net bounds (`getBoundsOfCenteredBoxes`) and zoom limits (`getMinZoomForBounds`, `ZOOM_PADDING`). `layoutNodeDimensions` is now derived from the render dimensions instead of maintained by hand.
