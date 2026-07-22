---
"@hashintel/petrinaut": patch
---

Remove "Petrinaut" branding from the AI assistant panel: the tab now reads "AI", and the empty-state, composer label and auto-layout widget copy refer to the assistant neutrally. The `topBarStart` slot now renders after the built-in sidebar-toggle and menu buttons, immediately before the net title, so hosts can lead into the title with breadcrumbs, and a new `slots.titleStyle` hook lets hosts apply an inline style to the title input (e.g. tinting it as the final crumb).
