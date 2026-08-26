# Spec: the plugin contract — one definition per target formalism

Status: **provisional**, reshaped 2026-08-25 by
[ADR-0006](../adr/0006-plugins-per-target-formalism.md) (a plugin is per formalism, never per
domain) and amended the same day by
[ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md) (a plugin is data
under harness-owned keys). Ratification condition (inherited from
[ADR-0003](../adr/0003-three-register-ir.md)): a worked pass across at least three plugin
targets on a real fold. Decided on: FE-1405 (registers), FE-1480 (ADR-0005 outputs), FE-1431
(the key contract), and the 2026-08-25 design-convergence review. The normative exemplars are
[`plugin-sdcpn/plugin.yaml`](../../packages/plugin-sdcpn/plugin.yaml) and
[`plugin-gherkin/plugin.yaml`](../../packages/plugin-gherkin/plugin.yaml), co-authored against the
same schema; where this document and the schema
([`packages/core/schema/plugin.schema.json`](../../packages/core/schema/plugin.schema.json),
derived from `PluginDefinitionSchema`) disagree about shape, the schema wins and this document is
amended. The retired declarative draft is archived at
[`plugin-contract-2026-08-25-declarative-draft.md`](../archive/specs/plugin-contract-2026-08-25-declarative-draft.md).

## What a plugin is

A plugin is **per target formalism** — Gherkin, SDCPN — never per domain. It is one authored
`plugin.yaml` whose keys are fixed by the harness, plus a small amount of code for `project` and
`validate`. The harness reads the contract keys into the model vocabulary, the demand list, and
the pattern index; it renders every other key into the interviewer's instructions interleaved
with its own teaching — for each key, the harness's definition of the key, then the repertoire's
default, then the plugin's cell. The end user never edits the file.

The keys fall in four groups (ADR-0007 decision 2), under an identity block `plugin` (`id`,
`version`, `formalism`, `jobs`, `purpose`):

| group       | keys                                                                                              | who fills it                                        |
| ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| contract    | `ontology` (`kinds`, `not_kinds`, `attributes`), `schema` (`anchor`, `floor`, `must_know`, `proposals`), `patterns` | the plugin alone; the harness reads it as data      |
| guidance    | `lenses` · `techniques` · `movements{slice,sweep}` · `licenses` · `motifs` · `smells` · `rabbit_holes` · `failure_modes` | repertoire default + plugin cell, concatenated      |
| runbooks    | `kickoff` · `trajectory` · `close`, once per job the plugin declares (`construct`, `review-and-revise`) | repertoire default + plugin cell, concatenated      |
| machinery   | `checks` · `tools`                                                                                | identifiers of harness or plugin machinery; unconsumed in cycle one |

Every guidance and runbook cell is a list of `{name, text, signature?, source?}` items. A cell
adds to the default; it never overrides it and never restates what the harness enforces. A plugin
may leave any cell blank — the default is then the whole of the key — and may add no key: an
unknown key anywhere fails to load. The catalogue of keys, and the one-paragraph definition the
interviewer reads above each, lives in `packages/core/src/keys.ts`; the catalogue is a working set
until a co-authoring cycle changes no key (ADR-0007 decision 9), with changes recorded in
`packages/core/schema/CHANGELOG.md`.

Domain-neutrality rule: nothing in the definition may name a domain. A new case that seems to
need a new row is a finding about the abstraction, decided by review, never content added to a
plugin.

## Relation to the three registers

[ADR-0003](../adr/0003-three-register-ir.md) is unchanged. Register 1 is the capture store:
envelope-wrapped assertions carrying verbatim forms, hedges, absences, provenance. Register 2 is
the elicited model — a graph of nodes, each of exactly one **kind** from `ontology.kinds`, each
with the slots `schema.must_know` names for that kind — derived by a pure fold over active
captures and never stored. Register 3 is the projections. Write-time-only semantics governs
assembly: the fold is forbidden to interpret, so every bridge from user language into a slot is a
capture, and the model is a pure function of the store.

## The contract keys

Shapes are fixed by the schema; the exemplars are normative for value vocabularies.

| key                 | rows                                                                       | read as                                                                                                          |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ontology.kinds`    | `kind`, `is`, `projects_to`                                                | the closed node-kind catalog (Layer-A property 1); `projects_to` is documentation for the loss report, not code    |
| `ontology.not_kinds`| `name`, `text`                                                             | things that look like kinds and are not — rendered, never folded                                                  |
| `ontology.attributes` | `name`, `on`, `values?`, `text`                                          | cross-kind attributes (`quantity`, `source-regime`, `rationale`, `status`); a plugin may not scope them to some kinds |
| `schema.anchor`     | `kind`, `depends_on`                                                       | the completion anchor, declared: the kind whose named slot is the dependency slice (was `objective` by convention) |
| `schema.floor`      | `kind`, `at_least`                                                         | the static floor as counts                                                                                       |
| `schema.must_know`  | `kind`, `slot`, `precision`, `not_applicable`, `why`                       | one demand row per (kind, slot); `precision` is one harness precision word, a non-empty any-of list, or `at least N` |
| `schema.proposals`  | `type`, `payload`                                                          | the proposal types the plugin's code declares (`slot-asserted`/`slot-assertion` for a kind-and-slot plugin)        |
| `patterns.items`    | `id`, `on`, `slot?`, `when`, `ask`                                         | discretionary interviewing patterns indexed by the kinds in `on`; a slot-scoped pattern surfaces only while that slot is unsatisfied |

Rules the reader enforces beyond the schema:

- Every `must_know` row names a kind present in `kinds`; every kind has at least one row.
- The anchor's `depends_on` is a `must_know` row on the anchor kind demanding `at least N`.
- `precision` is harness vocabulary (`named`, `number`, `range`, `spread`, `spelled out`,
  `at least N`; `PRECISION_LADDER` in core), rendered for every plugin. A non-empty list accepts
  any listed word for one semantic slot. Grade means narrowing of interpretation space, never
  claim strength. A plugin no longer declares its own precision table.
- The completion rule itself is fixed by [`elicitation-completion.md`](elicitation-completion.md);
  the plugin supplies only the floor and the anchor.
- Runbooks may be given only for jobs the identity block declares.
- A pattern's optional `slot` must be demanded by every explicitly indexed kind, or by at least
  one kind when `on` is empty. Patterns are never mandates. The harness surfaces; the interviewer
  decides.

## Version binding

The identity block declares an immutable version string (`sdcpn/2026-08-25.2`,
`gherkin/2026-08-25.1`). Every completion evaluation, projection output, and delivered report
carries that version together with the target-document revision it read. A report for one plugin
version is not comparable with a model folded under another; the caller retries rather than
mixing them. The repertoire carries its own version (`repertoire/…`).

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
- **Smallest honest plugin.** A definition whose `kinds` has one row and whose `must_know`
  demands one `named` slot must load and run (kernel §11.3).
- **Readability oracle.** Someone who has read one exemplar can write the other by analogy in a
  sitting, and a reader sees the two as siblings rather than one as the template the other was
  forced into. A harness change that breaks this is a regression even if all tests pass.
- **Cells add, never override.** No plugin cell may contradict the harness's definition of its
  key or restate what the harness enforces; the harness surfaces, and never selects on a plugin's
  behalf (ADR-0007 decision 5).

## Testing

The primary seam is still the fold: `fold(definition, activeCaptures) → model`, golden-tested
with hand-worked capture sets in and slot states out. Gates: the **definition read gate** (schema
match with no unknown key; every `must_know` kind exists; the anchor is a counted row; runbooks
belong to declared jobs), the **shipped-definition gate** (both plugins load, add no key, name no
domain, and declare different anchors under the same schema), the **schema drift gate**
(`plugin.schema.json` equals the emitted view of the valibot schema), the **repertoire gate**
(every key filled, every entry sourced, no formalism or domain word), the **render-order gate**
(preamble → contract → guidance keys in catalogue order → runbooks per declared job; definition
before default before cell), and the **completion fixtures** of `evaluateCompletion` described in
[`elicitation-completion.md`](elicitation-completion.md). Test-fit order stands: smallest honest
plugin, then Gherkin, then SDCPN — with Gherkin and SDCPN authored in the same cycle.

## Open strains (first-class, with owners)

- **Dependency-slice closure (was strain 5).** `schema.anchor.depends_on` is a `must_know` slot on
  the anchor kind; the closure rule over reference-bearing captures still needs one hand-worked
  pass before it is machine-read. Owner: FE-1393, with the completion fixtures as consumer.
- **Temporal patterns (strain 6, roped off).** Scheduling stays out of scope; calendar algebra is
  neither claimed nor planned.
- **Sweep-time concentration (strain 7).** Write-time-only semantics makes the sweep the single
  point of semantic failure; mitigations travel with FE-1392/FE-1393/FE-1407.
- **Absence locator (envelope pressure #2).** Authority remains the active soft edge in
  [STEERING](../control/STEERING.md#active-soft-edges).
- **Catalogue convergence (ADR-0007 decision 9).** Which keys survive is decided by co-authoring
  cycles, not by this document; cycle-one open questions are listed in
  `packages/core/schema/CHANGELOG.md`.

## Retired 2026-08-25 by ADR-0007

- **Fixed Markdown headings as the contract** (`## Purpose` · `## Kinds` · `## Must know` ·
  `## Patterns` · `## Moves` · `## Deliverable`): the contract is the schema; the headings the
  interviewer reads are rendered from keys.
- **The plugin's own `Precision words` table:** precision is harness vocabulary.
- **`objective` as the anchor by convention:** the anchor is declared under `schema.anchor`, so a
  formalism whose completion hangs off a `feature` fits the same reader.
- **`Moves` and `Deliverable` prose sections:** their content is distributed over the guidance
  and runbook keys, where the harness's default can be stated once and specialised per plugin.

## Retired 2026-08-25 by ADR-0006

Full text survives in the
[archive copy](../archive/specs/plugin-contract-2026-08-25-declarative-draft.md).

- **Domain-keyed CPS `DemandTable`** (`where(kind, role=…)` scopes, `ROW-BREAKDOWN` and kin):
  it keyed demands to one baseline case's domain, so every new case needed new rows.
- **Typed `ScopeExpr` / `where` / `inSupport` algebra:** demands are now per (kind, slot), and
  the anchor's dependency slice replaces `inSupport`; the algebra had nothing left to select.
- **`ProposalType.affordance.firesWhen` (closed 7-value enum):** patterns are surfaced by a
  node matching `when` with an unsatisfied slot, which needs no per-proposal predicate.
- **`NodeKind.completionAnchor`:** replaced first by rule, then by the declared `schema.anchor`.
- **Typed `foldTable` / `demandTable` / `variantDimension` / `lossCategories` declaration:** the
  fold derives from the `must_know` rows, the demand list *is* that key, `source-regime` is a
  fixed cross-kind attribute, and loss categories are fixed by kernel §6.1.
- **Interview cards as separate artifacts:** they became kind-indexed patterns P01–P13 and
  guidance cells (mapping recorded on the
  [archived guidance](../archive/specs/cps-interview-guidance-2026-08-25.md)).
- **The `ProposalType` catalog and standard-interiors library as plugin-authored declarations:**
  utterance-shaped proposal interiors remain a harness concern (FE-1392/FE-1393); the plugin
  declares only which proposal types its code supplies.
