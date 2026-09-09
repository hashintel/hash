---
"@hashintel/petrinaut-core": patch
---

The browser optimizer estimates PED-ANOVA parameter importances: the `complete` event carries an optional `importances` block, and so does every trial event at a cadence once the study is past its floor. A study whose estimate cannot be computed completes without the block.
