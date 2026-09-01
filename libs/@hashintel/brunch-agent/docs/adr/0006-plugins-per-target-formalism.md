# ADR-0006: Plugins are per target formalism, authored as sectioned Markdown

Date: 2026-08-25
Status: accepted; superseded in part by Mission 4 on 2026-09-01. The historical decision that a plugin unit is the target formalism alone is replaced by one reusable domain-typology / target-formalism pairing. The prohibition survives for concrete domains, situations, and scenarios.
Amended by: [ADR-0007](0007-harness-teaching-meets-plugin-content-at-fixed-keys.md) (2026-08-25),
decisions 2 and 5 — the machine-read tables become schema-validated data, the prose becomes cells
under harness-owned keys, and the harness-generic lift is designed there
Amends: [ADR-0003](0003-three-register-ir.md), first consequence only — the plugin contract's
_form_ (a sectioned Markdown file with three parsed tables replaces the typed model-schema /
proposal-catalog / fold-table / demand-table declaration); the three registers are unchanged
Supersedes: the declarative plugin-contract draft, the CPS interview-guidance spec, and the full
completion-contract draft, all archived under
[`docs/archive/specs/`](../archive/specs/) on 2026-08-25
Decided on: the `ln/sdcpn-plugin-pivot` arc (FE-1482 lane), 2026-08-25; recorded with
[S-007](../control/STRATEGY-LOG.md#s-007)

## Context

The general use case is to elicit a model of _any_ cyber-physical system. The domain — packaging
line, truck fleet, coating plant — is unknown before the conversation starts. A plugin therefore
cannot be keyed to a domain; the only thing fixed before the first turn is the target formalism the
model will be projected into.

The IR spec's [Layer B](../specs/intermediate-representation.md#layer-b--the-cps-plugins-ir)
already defined the CPS plugin at exactly that level: ten kinds, cross-kind `quantity` /
`source-regime` / `rationale` attributes, and question-relative completion over a static floor.
The design-convergence queue selected by S-005 then drifted below it. The FE-1402 rehearsal
needed an oracle and authored a provisional DemandTable keyed to the baseline coatings-plant domain
(`dynamics[line-failure].occurrenceFrequency`, objective rows `ROW-BREAKDOWN`, `ROW-IDLE-WASH`,
…) with `where(kind, role=…)` scopes — contradicting the plugin contract's "September ships
kind-only", which was in fact correct; the oracle was at the wrong level. FE-1403 tagged five
cards `domain`; each lifts without loss to a kind-level pattern (stochastic event, mode switch,
batching, gate/trigger, shared-resource contention). FE-1404 built a 5,400-line preregistered
instrument — an LLM operator emitting a Valibot-validated projection, an activation matrix,
seal-bound append-only recovery, a 51-component result vector — through nine rejected
fresh-context review renderings; it never ran, and its committed lock is the rejected draft lock
(5/11 hashes stale, 10/21 canonical paths missing; the runner's own `--verify-seal` refuses it).
Structurally the instrument is a shadow harness: operator ≈ capture store + fold; projection
schema ≈ model state + `evaluateCompletion`; diagnostic priority ≈ affordance cue; quote-novelty
streak ≈ controller stopping policy; sealed segments ≈ session archive. The S-005 cut ("during
design convergence do not implement SDK surface, projection, …") displaced implementation into
`evaluations/`, where it does not compound.

Meanwhile [`packages/plugin-sdcpn/plugin.yaml`](../../packages/plugin-sdcpn/plugin.yaml) showed that the whole target
fits one file: the twenty domain rows collapse onto kind-level rows instantiated on discovered
nodes, and the five domain cards become kind-indexed patterns P01–P05. This record ratifies that
file's shape as the plugin contract.

## Decision

1. **The plugin unit is the target formalism** (`gherkin`, `sdcpn`) — never a domain, situation,
   or scenario. The domain is unknown at conversation start and is discovered, not declared.

2. **A plugin is one sectioned Markdown file** with fixed contract headings
   `Purpose · Kinds · Must know · Patterns · Moves · Deliverable`. The headings are the contract and
   are identical across plugins. The harness parses the `Kinds`, `Must know`, and `Patterns`
   tables into the model vocabulary, the demand list, and the pattern index; every other section
   concatenates into the interviewer's instructions. `packages/plugin-sdcpn/plugin.yaml` is the normative
   exemplar; it moves unchanged to `packages/plugin-sdcpn/` with the walking skeleton.

3. **Demand rows are kind-level.** Each row is a slot on a kind with a required precision, an
   accepted-absence flag, and a rationale; scopes are kinds only. Every node discovered in
   conversation is checked against its kind's rows. Completion is question-relative (Layer B): the
   static floor holds, and every node in the dependency slice of every active `objective`
   satisfies its rows.

4. **Domain-neutrality rule.** No domain nouns in a plugin file. A new case that appears to need a
   new heading is a finding about the abstraction, decided through an ADR — never content to add.
   The generality test for a plugin is that a second domain adds zero headings and zero rows.

5. **Patterns and moves.** Patterns are discretionary, kind-indexed heuristics (trigger →
   question), surfaced by the harness when a node matches the trigger and the slot is unsatisfied.
   Moves are job runbooks; a plugin may carry more than one runbook over one `Kinds` / `Must know`
   set (this one carries `construct` and `review and revise`). Harness-generic patterns may later
   lift into a harness repertoire (FE-1406, gist: strategy quiver).

6. **Code stays where ADR-0005 put it.** `project` and `validate` remain plugin code operations;
   the three-register IR (ADR-0003) is unchanged. The file declares what the model is and what
   must be known; code derives the artifact from it.

7. **Retired**, each with its replacement:

   | Retired | Replacement |
   | --- | --- |
   | `ScopeExpr` with `where` and `inSupport(anchor)` constructors | The kind column of a `Must know` row. Objective-relative depth comes from the dependency slice the harness computes from `objective` nodes, not from a scope expression. |
   | `ProposalType.affordance.firesWhen` (closed 7-value enum, singular per proposal type) | The `when` column of the `Patterns` table: kind-indexed triggers, any number per kind, matched against node state at read time. |
   | `NodeKind.completionAnchor` | The `objective` kind is the anchor by construction: its "the nodes it depends on" row defines the slice. |
   | Typed `foldTable` / `demandTable` / `variantDimension` / `lossCategories` declarative contract | Fold rules derive from the `Kinds` table's slots (default fold-by-slot; no override table until a case forces one). `demandTable` → the `Must know` table. `variantDimension` → the `source-regime` attribute on every kind. `lossCategories` → the seven fixed categories of Layer B's loss report, owned by the harness, not declared per plugin. |
   | Interview cards as separate artifacts (Detects / Goal / Questions / Artifacts, tag, mechanism) | `Patterns` rows (trigger → question) inside the plugin file; the domain/envelope-generic tag dissolves because no pattern may name a domain. |
   | Activation matrices | None. The harness matches pattern triggers against node state; nothing is frozen per experiment. |
   | Objective-anchor registries and `whenObjective`-keyed demand rows | The `objective` node's dependency-slice slot; every node in the slice is checked against its kind's rows. |

## Condition

Revisit if a second target formalism cannot be expressed under the fixed headings, or if kind-only
demand rows demonstrably cannot express a formalism's completion. Either is a finding about the
abstraction and reopens this record; neither licenses a per-domain plugin or a per-case heading.

## Consequences

- The plugin-contract spec shrinks to the heading contract, the table grammar, and the
  `project` / `validate` code seam.
- The elicitation-completion spec reduces to invariants on `evaluateCompletion` over the parsed
  `Must know` table: static floor, slice-relative demand, boolean plus failure list, computed from
  the model and never from the conversation.
- The CPS interview-guidance spec is superseded; its surviving cards live on as patterns P01–P05.
- The FE-1404 instrument is archived as test-bed material. Salvage its Valibot projection schema
  and validators; discard the operator, activation matrix, and seal machinery.
- FE-1431's seven plugin-authoring seams dissolve: there is no typed authoring surface to
  ratify, only a file format and a parser.
- The walking skeleton implements the parser, the fold, `evaluateCompletion`, the sweep, and the
  affordance cue in the production path, against the `sdcpn` file. The generality test (a second
  formalism, `gherkin`, adds no headings) follows the skeleton rather than gating it.
