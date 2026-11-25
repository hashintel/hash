---
"@hashintel/petrinaut": patch
---

**Breaking:** Petrinaut no longer bundles Inter, and uses the system fonts by default everywhere except the code editor, which stays in JetBrains Mono. To use other fonts, load them and set the `--salt-font-body` and `--salt-font-mono` CSS variables.
