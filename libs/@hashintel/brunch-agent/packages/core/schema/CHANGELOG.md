# Plugin schema changelog

The key catalogue is a working set until a co-authoring cycle changes no key
(ADR-0007 decision 9). Each cycle records here what it added, merged, dropped,
or left alone, and why, with the evidence that moved it. `plugin.schema.json`
is derived from `PluginDefinitionSchema` in `src/plugin-definition.ts`; a test
fails when the two drift.

## Cycle 1 — 2026-08-25

First materialisation. Both test-case plugins (`plugin-sdcpn`, `plugin-gherkin`)
and the repertoire were written against this shape together.

- **Groups:** `plugin` (identity, not a key), `ontology`, `schema`, `patterns`,
  `guidance`, `runbooks`, `machinery`.
- **Contract keys:** `ontology.kinds` (`kind`, `is`, `projects_to`), optional
  `ontology.not_kinds` and `ontology.attributes`; `schema.anchor` (declared,
  replacing the `objective`-by-convention anchor of the Markdown plugin file),
  `schema.floor`, `schema.must_know`, `schema.proposals`; `patterns.items`
  (`id`, `on`, `when`, `ask`).
- **Guidance keys:** `lenses`, `techniques`, `movements{slice,sweep}`,
  `licenses`, `motifs`, `smells`, `rabbit_holes`, `failure_modes` — each a
  list of `{name, text, signature?, source?}` so that default and cell
  concatenate.
- **Runbook keys:** `kickoff`, `trajectory`, `close` per declared job.
- **Machinery:** `checks` and `tools` as identifier lists; nothing consumes
  them yet.
- **Dropped from the Markdown plugin file:** the precision-words table (now
  harness vocabulary, `PRECISION_LADDER`), the `Moves` and `Deliverable` prose
  sections (their content is distributed over guidance and runbook keys), and
  the fixed heading order as the contract (the schema is).
- **Open after this cycle:** whether `motifs` needs parameters as data rather
  than prose; whether `licenses` has any plugin-specific content at all (both
  plugins left it blank); whether `machinery.checks` should name harness
  check implementations or plugin-provided ones.
