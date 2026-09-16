---
layer: ui.views.editor.drawer-frame
role: The parts of the chrome every Simulate drawer shares — a header that condenses once the body scrolls, its stat columns and status pill, the columns, the spanning card, the computing chip and the fold a part hides behind
---

`drawer-frame.tsx` in the parent folder is the frame: the header outside the body's scroll container, a body of fixed-height cards, a footer of actions. The parts here are what the frame and its adopters compose: `frame-header.tsx` (the title line, the stat strip that echoes as compact chips while condensed, the status pill, the progress bar), `frame-columns.tsx` (the surface and the cards laid out by the body's width), `frame-card.tsx` (a titled card across the body with a part folded behind its footer), `fold.tsx` (a part that folds away at a fixed height), `compute-batches-chip.tsx` (the computing chip and its batch list), and the hooks that condense the header (`use-body-scrolled.ts`, `use-header-engaged.ts`) behind the one animation switch (`frame-animate-context.ts`).
