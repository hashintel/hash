---
"@hashintel/ds-components": minor
"@hashintel/ds-helpers": minor
---

**Breaking:** `fonts.display` is removed in favour of `fonts.body`, `fonts.body` and `fonts.mono` now default to the system fonts instead of Inter and Geist Mono, and `--font-inter`, `--font-inter-tight` and `--font-geist-mono` are no longer read. To use Inter, Geist Mono or any other font, load it and set the new `--salt-font-body` and `--salt-font-mono` CSS variables.
