# `@hashintel/brunch-agent-repertoire`

The harness's own teaching, as data: `repertoire.yaml` fills every guidance key
(`lenses`, `techniques`, `movements.slice`, `movements.sweep`, `licenses`,
`motifs`, `smells`, `rabbit_holes`, `failure_modes`) and every runbook key
(`kickoff`, `trajectory`, `close`) of every job (`construct`,
`review-and-revise`) with what an interviewer is taught before any plugin
speaks. The keys, their definitions, and the reader live in the harness
(`packages/core/src/keys.ts`, `repertoire.ts`); this package is the filling.

Two rules the reader enforces here and not on a plugin: every key is filled,
and every entry names its `source` — a run, a replay, a verified literature
finding, or an accepted decision. Admission is by evidence (ADR-0007
decision 7). Entries name no formalism and no domain; the test checks.
An entry may declare `for_precision`, a non-empty list of harness precision
words. The renderer includes it only for plugins that demand at least one of
those words.

## Topology

Depends on `@hashintel/brunch-agent` only. A binding depends on this package
and renders it interleaved with a plugin definition
(`renderInstructions(repertoire, definition)`), key by key: the harness's
definition of the key, then the default here, then the plugin's cell. A plugin
never imports the repertoire: its cell is written against the harness's
definition of the key, and adds to the default without overriding it.

## Changing it

Add an entry when a run, replay, or verified source shows the interviewer
needs it, and cite that source. Add a key only through the harness's catalogue
(`keys.ts`) and its changelog (`packages/core/schema/CHANGELOG.md`), which is
a working set until a co-authoring cycle changes no key (ADR-0007 decision 9).
Reference: `docs/adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md`.
