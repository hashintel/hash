---
"@hashintel/petrinaut-core": patch
---

Start the ELK layout engine the first time a layout is calculated, rather than when the package is imported, so the package can be imported where ELK can't start, such as in a Temporal workflow.
