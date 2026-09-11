---
"@hashintel/petrinaut": patch
---

The AI assistant's `getNetCompilationErrors` read and the post-mutation diagnostics context now report that diagnostics are pending when the refresh for the latest mutation has not landed within the bounded wait, instead of returning the previous version's diagnostics. The pending version stays armed until diagnostics actually pass it, so a following read cannot answer from stale text either.
