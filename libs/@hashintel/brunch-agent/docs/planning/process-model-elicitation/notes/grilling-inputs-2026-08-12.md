# Grilling inputs — carried forward from the 2026-08-11/12 session

State capture ahead of the HITL tickets (FE-1361/62/63/64). Everything here is _input to
decisions_, not decisions. Sources: the three research resolutions (gists on FE-1358/59/60,
full findings in [`../research/`](../research/)), the talkthrough discussion, and
[Dora's PRO-98 checklist](https://www.notion.so/hashintel/3b93c81fe0248019a7beda9bb31df2c8).

## 1. Destination trend (Lu, 2026-08-12)

The arc is trending toward **a spec for elicitation plugins generally, or at least the
cyber-physical one, which will inform the general one**. The research supports an inversion:
most interviewing-strategy value is _generic_ (harness / strategy-quiver layer, now
literature-sourced); the CPS plugin is a comparatively thin domain shell (facet catalogs +
projection). Candidate shape: a generic elicitation-plugin spec (pack model + strategy quiver +
completion machinery) plus a CPS instantiation that stresses it. To be ratified in grilling —
would amend the FE-1357 destination wording.

## 2. The facets/motions schema (Lu's meta-methodology, mapped in the talkthrough)

Organizing schema for the generic strategy layer, imported from Lu's software-dev skill systems:

- **Facets** (declarative; what a _plugin_ fills in):
  - _entities & types catalog_ — what to capture (≈ Robinson's component/detail tables; colour
    types; ElicitationPack concept declarations)
  - _clusters/figures/motifs_ — repeating patterns to query against (≈ the small parameterized
    quiver **with variant selectors**; note the per-object-type-template counter-evidence)
  - _quality/completeness/value-add heuristics_ — when the model beats the incumbent flat
    representation (≈ emergence/degeneracy triad, question-relative completeness, VUT earning
    test)
- **Motions** (procedural; _harness-generic_):
  - _slice motions_ — one case end-to-end first (tour question, CDM walkthrough); slice before
    sweep = the literature's overview-before-contrived-probes
  - _sweep motions_ — make one property hold across one stratum (every activity a duration,
    every contention point a policy); **mechanically checkable → harness-computed gap facts →
    typed issues**
  - _impact/leverage order_ — objectives-first is the maximal instance; source-router the
    economic form; propositions-per-task-minute the measurement; NB elicitation leverage has a
    human-budget term (rapport/fatigue) that dev leverage lacks
- The motion vocabulary appears **original** (no KA/RE/conceptual-modelling equivalent found) —
  testable in the baseline: motions-prompted vs facet-checklist-prompted elicitor.
- Maps to Principle v2: facets = anchors/shapes; motions = procedure for mechanism.

## 3. Dora's checklist — adopt/validate split

**Adopt** (convergent with research, independently arrived): purpose as core-interview beat 2
("the purpose determines which ontology categories are high-priority"); the **Maps-to column's
"lives only in the intermediate representation"** entries (policies, penalty weights,
regulatory refs, rationale) — PM-side confirmation of net-as-projection _and_ of the term IR;
workflow-sketch slice; best/average/worst-day scenarios; "rules nobody wrote down"; user
identity as elicitation-shaping metadata; jargon-avoidance phrasing table (with fix #3 below).

**Validate before adopting** (each with its home):

| #   | Claim                                                              | Problem                                                                                            | Warrant                                          | Home                       |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| 1   | Static 3-tier category ordering                                    | Contradicts her own purpose-conditional prose; literature says ordering derives from purpose       | Robinson/Sargent objectives-first                | pack design (spec)         |
| 2   | "Steps become transitions; states between become places"           | Factoring is a modelling act; Petrinaut has **no duration field** (a timed step ≠ one transition)  | representational-bias literature + format survey | FE-1364                    |
| 3   | "Typical / fastest / slowest" phrasing                             | = min/mode/max triple; naive fit published ~69% error                                              | Holm & Barra 2011; IDEA/SHELF quantile forms     | pack design                |
| 4   | Stop signal "last 3 questions didn't change the model"             | = representational stability, a premature-termination rule (professionals stopped at 57% coverage) | Browne & Pitts 2004                              | completion contract (spec) |
| 5   | Session initiation: in-Petrinaut, one-shot-then-iterate            | Presumes the vehicle                                                                               | open decision                                    | FE-1362                    |
| 6   | Blanket 3–4 question batching                                      | Tension with depth-of-probing finding + horizon problem                                            | LLM-interviewer lit; two-phase scoping           | pack design                |
| 7   | "Stochastic differential equations" for place dynamics             | Petrinaut dynamics are deterministic ODEs                                                          | format survey                                    | minor fix                  |
| 8   | (Absence) no provenance/absence/contradiction/validation machinery | Checklist implicitly assumes a harness that supplies all of it                                     | Petrinaut survey: none exists in the stack       | differentiation narrative  |

A draft comment for Dora covering items 1–4 was prepared 2026-08-12 (Lu to deliver).

## 4. Standing tensions for the grilling sessions

1. **Objectives-first vs. element-mapped questioning** — if accepted, the elicitor's opening
   phase elicits _the questions the model must answer_, and that table = scope + completion +
   validation criterion (spec-level commitment).
2. **Depth vs. batching** — breadth phase batchable, probe phase sequential; argue the trade,
   don't assume it.
3. **Functional motifs vs. per-object-type templates** — decides part of the IR shape (FE-1364).
4. **Differentiation** — the incumbent already interviews; the demo's claim must be what a
   prompt-in-a-panel cannot do (durable capture, provenance, completion accounting, IR).

## 5. Frontier state (2026-08-12)

- FE-1361 baseline: three-condition design + mistake-questionnaire instrument on the ticket;
  v0 prompt should encode objectives-first, probe catalogs, quantile elicitation.
- FE-1362 vehicle: unblocked; all inputs in (survey, voice tiers, "entirely new" stance,
  Dora's claim #5); Kostandin back ~2026-08-18; demo 2026-09-17/18, format TBD.
- FE-1363 use case: needs Dora + Yannis; earning tests (VUT, colour-as-folding) give the
  technical criterion; candidates truck-fleet / cold-chain / scheduling.
- FE-1364 IR: blocked by FE-1363 only; inputs: quiver-with-variant-selectors, what-lives-
  outside-the-net list, Dora's Maps-to column, format facts (scenario-or-dead-net, code-string
  generation, no timed transitions).
