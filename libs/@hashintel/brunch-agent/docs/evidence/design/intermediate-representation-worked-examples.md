# IR worked examples — Layer-A validation (FE-1397)

Resolved 2026-08-13. This document discharges the ratification condition on the generic IR
definition ([`ir-design.md`](../../specs/intermediate-representation.md), Layer A): speculative payload type systems drafted
across three plugin targets at different complexity levels, each checked against the five MUST
properties and three MAY patterns. **Desk validation only** — nothing here has run through a
working harness; Layer-A claims stay provisional until the September build exercises them.

Four data points, not three: **Gherkin** (thin; drafted here), **CPS** (thick; `ir-design.md`
Layer B is worked example #2), **BPMN/process-mining** (mid; drafted here — the kernel spec's
named third dev target, §13), and the **assurance plugin** (spec §13.2) read as a fourth, free
corroborant since its payload design already exists in spec canon.

## Worked example 1 — Gherkin (thin, known)

The milestone-one tracer target (spec §13.1). Speculative kind catalog, namespace `gherkin/`:

| #   | Kind                     | Holds                                                                         | Projects to (`.feature`)                      |
| --- | ------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | **feature**              | a capability under specification and its value narrative (who benefits, why)  | `Feature:` header + description               |
| 2   | **rule**                 | a business rule the behavior must honor                                       | `Rule:` block                                 |
| 3   | **example**              | one concrete case as the user stated it — context, action, expected outcome   | `Scenario:`, with steps factored by `project` |
| 4   | **background-condition** | a precondition common to a feature's cases                                    | `Background:` steps                           |
| 5   | **actor**                | a persona or system that acts or is acted on                                  | step subject vocabulary; tags                 |
| 6   | **term**                 | a domain word with agreed meaning, bindable to the pack-declared step lexicon | step phrasing normalization                   |

**No `step` kind — statement granularity bites even at the thin end.** Users state cases ("an
expired token shows an error page"), not Given/When/Then triples; factoring a case into steps is
`project`'s work, exactly as CPS activity factoring is. A Gherkin-literate user may well dictate
literal Given/When/Then — then statement granularity _coincides_ with artifact granularity, which
is coincidence, not violation; the payload holds what was said either way. The property's force
is that the interviewer never _requires_ the artifact's decomposition mid-conversation.

**References** are symbolic by name: example → its feature ("the password-reset flow"), example →
the rule it illustrates, background-condition → the feature it scopes; `reconcile` folds name
variants. **Completion** needs no distinct objective kind: the anchor role is filled by existing
kinds — every rule has at least one illustrating example (plus a contrastive counter-example
where the rule has an edge), every feature a happy path. The feature's value narrative is the
purpose statement.

**Projection and loss.** Nearly everything lands `mapped-exactly` or `normalized` — Gherkin has
free-text description slots, so even rationale rides along. Actor and term captures emit no
distinct artifact element; they are consumed as naming/phrasing policy (`collapsed`). The loss
report is almost empty at the thin end: the _mechanism_ holds but earns little — its value grows
with domain–format distance. Validation stays as spec §13.1 has it (parse validity + step-lexicon
binding), payload-stratum work.

**Property stress notes.** (1) six kinds, closed — holds. (2) holds, with the coincidence note
above. (3) is the interesting one: the plugin is _named after its projection target_, and its
domain vocabulary ("scenario", "rule") is the format's vocabulary — the property cannot demand a
distance that does not exist. What it operatively demands still holds: kinds no projection
consumes (actor, term as glossary) are legitimate IR content, and the loss report keeps them
honest. (4) holds — references are payload data. (5) holds — "rule uncovered by any example" is a
read-time label, never stored.

## Worked example 2 — CPS (thick)

`ir-design.md` Layer B, in full; not restated here. What it contributes to the property check:

- The **granularity rule** (Dora's claim #2, corrected) is the sharpest property-2 evidence in
  the set: Petrinaut has no timing field, so a timed step cannot be one transition — storing
  net-granularity elements would make every factoring change masquerade as a knowledge change.
- **Property 3 is carried by the net-bearing/IR-only split** (kinds 7–10) plus the typed loss
  report — the demo's story is precisely that the IR legitimately holds kinds the projection
  cannot consume.
- **Attribute patterns** (quantity, rationale, source-regime) show that not everything
  cross-cutting deserves kind-hood — a payload-design idiom Layer A did not name, tested again by
  BPMN below.
- Ten kinds, symbolic references, objective-anchored completion, read-time labels: properties 1,
  4, 5 and both first MAY patterns exercised without strain.

## Worked example 3 — BPMN / process-mining (mid, speculative)

The triangulation point, chosen because it varies both axes at once: a process domain like CPS
but a different artifact family (BPMN 2.0 XML, not Petrinaut), and — via process mining — the one
evidence source neither other target has: **event logs**, i.e. captures whose provenance is not
an utterance. Speculative kind catalog, namespace `bpmn/`:

| #   | Kind              | Holds                                                                  | Projects to (BPMN 2.0)                            |
| --- | ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | **role**          | who does the work — org units, people, systems                         | participants (pools) + lanes                      |
| 2   | **activity**      | a unit of work as the expert states it — actor, inputs, outcomes       | tasks (factored; task type derived)               |
| 3   | **trigger**       | what starts or interrupts work — timers, messages, failures            | events (start/intermediate/boundary)              |
| 4   | **ordering/flow** | sequencing and branching with conditions                               | sequence flows + gateways                         |
| 5   | **decision**      | the rule applied at a branch point                                     | gateway conditions where compilable; else IR-only |
| 6   | **case-story**    | one concrete trace ("the Meyer order last Tuesday went…")              | nothing directly; validates flows                 |
| 7   | **deviation**     | how practice departs from the nominal path                             | boundary events / alternate flows, partially      |
| 8   | **artifact**      | documents and data objects flowing through the process                 | data objects + associations                       |
| 9   | **objective**     | KPIs and the questions the model must answer (cycle time, conformance) | nothing — BPMN has no KPI element; IR-only        |
| 10  | **log-binding**   | model element ↔ event-log field (case id, activity, timestamp)         | nothing; IR-only, consumed by conformance tooling |

**Event-log evidence needs no envelope change.** A mining proposal ("credit check precedes
approval in 92% of traces") enters as an ordinary capture with `epistemic_status:
external-lookup`, citing the log and a documented transformation instead of a user span — exactly
the C5 adjudication (spec §5, Appendix A). What it _does_ expose is a wording gap in property 2:
"the granularity the user stated it" has no user here; the mined capture's granularity is set by
the documented transformation. The property generalizes from _statement_ granularity to
**evidence granularity**, with the user's utterance as the primary case.

**Regime and epistemics compose; no third regime value.** The org manual says X, the expert says
actually-Y, the log shows Z. The de jure/de facto split is the regime (`prescribed | practiced`,
from CPS); expert-belief vs. log-observation within `practiced` is already the envelope's
epistemic status (`explicit` vs. `external-lookup`). Divergences land as ordinary typed
`conflicting` issues. The **source-regime attribute pattern thus recurs across both process
plugins** — sublimation pressure, resolved one layer up (a Layer-A MAY pattern for process-shaped
domains), _not_ harness-ward: the harness has no domain notion of "manual" or "shop floor".

**`decision` recurs from CPS `policy` — convergence is not sublimation.** The kind appears in
both process plugins, but §11.5's ownership rule (guidance ownership follows vocabulary
ownership) routes only the _technique_ to the generic quiver — contrastive choice-point pressure
("when two X compete for one Y, who wins, by what rule?") operates on harness vocabulary. The
_kind_ stays in each plugin's catalog; if the process family grows, the seam is a shared
process-domain pack, not the kernel.

**Completion** anchors on `objective` again (KPIs + the questions the model must answer), over a
floor of roles, a happy-path flow, and at least one case-story validating it. **Loss sketch**
(illustrative, per-ProjectionPack): roles/activities/flows normalized; decisions approximate;
objectives and log-bindings unrepresentable; case-stories omitted (consumed at validation time,
not projected). One instructive contrast: BPMN carries a `documentation` element on every node,
so rationale attached to a projected element is `normalized` here — where Petrinaut, which strips
unknown keys, makes the same rationale `unrepresentable`. **Loss tables are ProjectionPack facts,
not plugin facts**, which is why the binding table belongs to each plugin spec's ProjectionPack.

## Verdicts

Per Layer-A MUST property (`survives / amended / demoted to guidance`):

| #   | Property                   | Verdict               | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Closed, named kind catalog | **survives**          | Catalog sizes 1 (assurance's single `Statement` record) through 10 (CPS, BPMN); closure held everywhere; extension pressure is absorbed by the concept-schema version axis (spec §12.6), not by opening the catalog.                                                                                                                                                                                                                                            |
| 2   | Statement granularity      | **survives, amended** | Generalized to **evidence granularity**: payloads hold one assertion at the resolution the evidence states it — the user's utterance in the primary case, the documented transformation for `defaulted`/`external-lookup` captures. Two clarifications: one utterance may yield several single-assertion captures (granularity is per-assertion, not per-utterance), and coincidence with artifact granularity (Gherkin-literate dictation) is not a violation. |
| 3   | Projection-independence    | **survives, amended** | Restated operatively, because its bite is proportional to domain–format distance and Gherkin has almost none: kinds are defined in domain vocabulary _and the IR legitimately holds kinds no current projection consumes, with the typed loss report keeping that honest_. The second clause is the enforceable content; the first degenerates gracefully where the target format is the domain.                                                                |
| 4   | Relations as payload data  | **survives**          | Flow-heavy BPMN is the strongest test — an edge-dense domain still needed no envelope structure; symbolic name references appear in all four designs.                                                                                                                                                                                                                                                                                                           |
| 5   | Read-time label derivation | **survives**          | Uncovered-rule (Gherkin), the net-bearing/IR-only split and five-stratum status (CPS, assurance), conformance/coverage labels (BPMN) — all `project`-computed, none stored.                                                                                                                                                                                                                                                                                     |

Per MAY pattern:

| Pattern                                               | Verdict                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symbolic name references + `reconcile`                | **Promoted MAY → SHOULD.** All four designs use it; it matches how experts talk and survives supersession without dangling edges. A plugin departing from it should say why.                                                                                                                                                                    |
| Objective kind anchoring question-relative completion | **Survives, generalized to completion-anchor kinds.** A distinct `objective` kind where the domain has explicit purposes (CPS, BPMN); existing purpose-shaped kinds otherwise (Gherkin's feature narrative + rules; assurance's `goal`). The pattern is "completion anchors on purpose-bearing captures", not "declare a kind named objective". |
| Non-load-bearing motif annotations                    | **Demoted to named escape hatch.** Zero uptake across all four designs — CPS explicitly keeps the motif quiver as pack question-guidance, BPMN's workflow patterns are likewise pack material, Gherkin and assurance have no use for it. Retained as a name only, pending a projection that demonstrably needs the hint.                        |

**New Layer-A pattern earned by triangulation:** **source-regime** (`prescribed | practiced`) as
a MAY for process-shaped domains — one model, never parallel models; divergence surfaces as
ordinary `conflicting` issues; regime composes with (never duplicates) epistemic status.

**Sublimation findings.** The standing expectation held, with better resolution on _where_
content lands when it moves:

- **Layer-B → Layer-A**: source-regime moved one layer up, to pattern status. That is the
  assurance precedent's shape repeated (technique moving to the shared layer), at pattern rather
  than mechanism grade.
- **Confirmed quiver-bound, not payload**: choice-point interviewing technique (CPS `policy`,
  BPMN `decision`) — the kinds stay put; the technique is generic.
- **Validated, not migrated**: event-log evidence exercised envelope vocabulary that already
  existed (`external-lookup`, C5) and added nothing.
- **The counter-rule**: convergent kinds across sibling plugins do not migrate harness-ward —
  vocabulary ownership (spec §11.5) decides, and the envelope's domain-freedom survived contact
  with all three targets. No kind moved into the envelope.

## Handoff to plugin-spec authoring

What the plugin spec should inherit from this exercise:

1. The **five MUST properties as amended** (evidence granularity; operative
   projection-independence) — `ir-design.md` Layer A carries the amended wording.
2. **Symbolic references at SHOULD grade**, with `reconcile` as the standard identity seam.
3. **Completion-anchor language**: require every plugin to name its anchor kinds; do not require
   a kind named `objective`.
4. The **source-regime pattern** for process-shaped domains.
5. **Loss tables are ProjectionPack content**, never plugin-level: the same rationale capture is
   `normalized` under a BPMN projection and `unrepresentable` under a Petrinaut projection.
6. The standing caveat: all of this is desk-validated; the September harness run is the real
   test, and any property it bends gets re-amended there.
