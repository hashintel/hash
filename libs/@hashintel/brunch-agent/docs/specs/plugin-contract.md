# Spec: the plugin contract — one file per target formalism

Status: **provisional**, reshaped 2026-08-25 by
[ADR-0006](../adr/0006-plugins-per-target-formalism.md). Ratification condition (inherited from
[ADR-0003](../adr/0003-three-register-ir.md)): a worked pass across at least three plugin
targets on a real fold. Decided on: FE-1405 (registers), FE-1480 (ADR-0005 outputs), and the
2026-08-25 design-convergence review (per-formalism plugin file). The normative exemplar for
every row and column shape named here is [`plugin-sdcpn/plugin.md`](../../packages/plugin-sdcpn/plugin.md); where this
document and that file disagree about shape, the file wins and this document is amended.
The retired declarative draft is archived at
[`plugin-contract-2026-08-25-declarative-draft.md`](../archive/specs/plugin-contract-2026-08-25-declarative-draft.md).

## What a plugin is

A plugin is **per target formalism** — Gherkin, SDCPN — never per domain. It is one authored
Markdown file with fixed section headings, plus a small amount of code for `project` and
`validate`. The harness parses three tables from the file into the model vocabulary, the demand
list, and the pattern index; every other section is concatenated, in order, into the
interviewer's instructions. The end user never edits the file.

Fixed headings, in this order: `## Purpose` · `## Kinds` · `## Must know` · `## Patterns` ·
`## Moves` · `## Deliverable`. Subsections under a heading belong to that section. A plugin file
with a missing, renamed, or reordered contract heading does not load.

Domain-neutrality rule: nothing in the file may name a domain. A new case that seems to need a
new row is a finding about the abstraction, decided by review, never content added to a plugin.

## Relation to the three registers

[ADR-0003](../adr/0003-three-register-ir.md) is unchanged. Register 1 is the capture store:
envelope-wrapped assertions carrying verbatim forms, hedges, absences, provenance. Register 2 is
the elicited model — a graph of nodes, each of exactly one **kind** from the `Kinds` table, each
with the slots the `Must know` table names for that kind — derived by a pure fold over active
captures and never stored. Register 3 is the projections. Write-time-only semantics governs
assembly: the fold is forbidden to interpret, so every bridge from user language into a slot is a
capture, and the model is a pure function of the store.

## The three machine-read tables

Column sets are fixed; the exemplar is normative for their names, order, and value vocabularies.

| table          | columns                                                                 | read as                                                                                         |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `## Kinds`     | `#`, `kind`, `what it is`, `projects to`                                | the closed node-kind catalog (Layer-A property 1); `projects to` is documentation for the loss report, not code |
| `## Must know` | `kind`, `slot`, `precision`, `"not applicable" allowed`, `why the model needs it` | one demand row per (kind, slot); `precision` is a word from the file's `Precision words` table  |
| `## Patterns`  | `id`, `when`, `ask`                                                     | discretionary, kind-indexed interviewing patterns; surfaced when a node matches `when` and a slot is unsatisfied |

Rules the tables carry:

- Every `Must know` row names a kind present in `Kinds`; every kind has at least one row.
- `precision` maps to an IR grade through the plugin's own `Precision words` table (`named`,
  `number`, `range`, `spread`, `spelled out`, `at least N`). Grade means narrowing of
  interpretation space, never claim strength.
- The static floor and the completion rule are stated in prose under `## Must know`; the harness
  reads the floor's counts, and the rule itself is fixed by
  [`elicitation-completion.md`](elicitation-completion.md).
- Cross-kind attributes (`quantity`, `source-regime`, `rationale`) are declared in prose under
  `## Kinds` and apply to every kind; a plugin may not scope them to some kinds.
- Patterns are never mandates. The harness surfaces; the interviewer decides.

## Version binding

The plugin header declares an immutable version string (`sdcpn/2026-08-25.1`). Every completion
evaluation, projection output, and delivered report carries that version together with the
target-document revision it read. A report for one plugin version is not comparable with a model
folded under another; the caller retries rather than mixing them.

## Code operations (ADR-0005 unchanged)

`project` and `validate` remain plugin **code**, pure and snapshot-in/deltas-out (kernel §6.1,
adjudication C2). For a code-bearing target, `project` emits three outputs from register 2:

1. a versioned scaffold with deterministic structure and field-local comments;
2. a sidecar of typed code obligations — target element and field, semantic intent, available
   symbols, supporting capture ids, acceptance checks;
3. the typed loss report (`mapped-exactly / normalized / approximate / collapsed / omitted /
   defaulted / unrepresentable`, per capture).

The sidecar is the machine contract; comments are its readable projection. Artifact realization
is downstream application work
([ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md)); realized code is never a capture,
IR slot, fourth register, or plugin operation. `reconcile` remains optional.

## Invariants that survive

- **Acceptance oracle.** A second projection consumes register 2 without rereading the
  transcript or interpreting generic capture fields; if it cannot, we have a capture ledger, not
  an IR.
- **Promotion, never refusal.** Low-precision statements are captured honestly and never promote
  to a demanded precision without a higher-precision capture superseding them.
- **Typed conflict, never a silent pick.** Competing active values on one slot fold to
  `conflicted`; a divergence between `prescribed` and `practiced` is recorded on the same node
  as an ordinary typed conflict — one model, never two.
- **Status ≠ precision ≠ confidence.** Epistemic status says how content relates to its source;
  precision says how narrow the value is; confidence (`firm | hedged | speculative`) says claim
  strength. None substitutes for another.
- **The envelope is untouched.** The absence-locator pressure (a field-specific absence cannot
  name its slot) is adjudicated at the FE-1383 seam, not forked around here.
- **Smallest honest plugin.** A file whose `Kinds` table has one row and whose `Must know` table
  demands one `named` slot must load and run (kernel §11.3).
- **Readability oracle.** Someone who has read `plugin-sdcpn/plugin.md` can write the Gherkin plugin
  file by analogy in a sitting. A harness change that breaks this is a regression even if all
  tests pass.

## Testing

The primary seam is still the fold: `fold(pluginFile, activeCaptures) → model`, golden-tested
with hand-worked capture sets in and slot states out. Two gates replace the retired meta-schema
validation: the **plugin-file parse gate** (headings fixed and complete, three tables parse, every
`Must know` kind exists, every precision word is declared) and the **completion fixtures** of
`evaluateCompletion` described in [`elicitation-completion.md`](elicitation-completion.md).
Test-fit order stands: smallest honest plugin, then Gherkin, then SDCPN.

## Open strains (first-class, with owners)

- **Dependency-slice closure (was strain 5).** "The nodes it depends on" is a `Must know` slot on
  `objective`; the closure rule over reference-bearing captures still needs one hand-worked pass
  before it is machine-read. Owner: FE-1393, with the completion fixtures as consumer.
- **Temporal patterns (strain 6, roped off).** Scheduling stays out of scope; calendar algebra is
  neither claimed nor planned.
- **Sweep-time concentration (strain 7).** Write-time-only semantics makes the sweep the single
  point of semantic failure; mitigations travel with FE-1392/FE-1393/FE-1407.
- **Absence locator (envelope pressure #2).** Authority remains the active soft edge in
  [STEERING](../control/STEERING.md#active-soft-edges).

## Retired 2026-08-25

Retired by [ADR-0006](../adr/0006-plugins-per-target-formalism.md); the full text survives in
the [archive copy](../archive/specs/plugin-contract-2026-08-25-declarative-draft.md).

- **Domain-keyed CPS `DemandTable`** (`where(kind, role=…)` scopes, `ROW-BREAKDOWN` and kin):
  it keyed demands to one baseline case's domain, so every new case needed new rows.
- **Typed `ScopeExpr` / `where` / `inSupport` algebra:** demands are now per (kind, slot), and
  the objective's dependency slice replaces `inSupport`; the algebra had nothing left to select.
- **`ProposalType.affordance.firesWhen` (closed 7-value enum):** patterns are surfaced by a
  node matching `when` with an unsatisfied slot, which needs no per-proposal predicate.
- **`NodeKind.completionAnchor`:** `objective` is the anchor kind by rule, not by flag.
- **Typed `foldTable` / `demandTable` / `variantDimension` / `lossCategories` declaration:** the
  fold derives from the `Must know` rows, the demand list *is* that table, `source-regime` is a
  fixed cross-kind attribute, and loss categories are fixed by kernel §6.1.
- **Interview cards as separate artifacts:** they became kind-indexed patterns P01–P13 and
  `Moves` steps in the plugin file (mapping recorded on the
  [archived guidance](../archive/specs/cps-interview-guidance-2026-08-25.md)).
- **The `ProposalType` catalog and standard-interiors library as plugin-authored declarations:**
  utterance-shaped proposal interiors remain a harness concern (FE-1392/FE-1393); the plugin
  file does not declare them.
