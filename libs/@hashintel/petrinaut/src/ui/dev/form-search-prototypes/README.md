# Form search prototypes (FE-1558)

Four ways to fuzzy-find parameters, Variables, and places in the ad-hoc
scenario form, each layered over the REAL form (live LSP, Monaco, the
worksheet keyboard model) with a large generated bottling-plant fixture.
Run Storybook and open **Dev / Form Search Prototypes**. Nothing here
ships.

All four share two pieces:

- `fuzzy.ts` — an fzf-style ordered-subsequence scorer (word-start and
  consecutive bonuses, gap and length penalties) returning matched
  positions for highlighting.
- `search-index.ts` — the name index derived from the form's own state
  and context, each entry carrying the aria-label of the trigger that IS
  that thing in the form (the `adHocTargetLabel` conventions), plus the
  jump: scroll into view, focus (focus = selection in the worksheet
  model), flash.

The prototypes differ in where search lives and what a match does:

- **A · Command palette** — ⌘K overlay, ranked list, Enter jumps.
  Keyboard-first and familiar; results are read out of context.
- **B · Filter in place** — a persistent box that dims non-matching rows,
  so matches keep their surroundings. (Prototype-grade: the dimming is
  painted onto the rendered rows from outside; the real feature would
  thread a filter through the form.)
- **C · Quickfind** — `/` opens a browser-find bar; Enter cycles the
  focus through matches one at a time. Minimal chrome, sequential.
- **D · Outline rail** — a permanent grouped index beside the form with a
  filter on top; doubles as a map of the model. Costs width.

They compose: a shipped feature could pair B's in-place dimming with A's
palette over the same index, since both are views over one scorer.
