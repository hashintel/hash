# Five-Register Synthesis Evaluation Protocol

**Status: Stage 1 complete; Candidates A and C remain eligible, Candidate B is eliminated, and no candidate has won.** See [`evaluation/stage-1-mechanical-and-authority-audit.md`](evaluation/stage-1-mechanical-and-authority-audit.md). This protocol belongs to the non-authoritative workbench. It does not modify the frozen prospective v1 baseline or authorize a paid run.

## Decision this protocol must produce

Select one coherent relationship among plugin Coverage, workpiece organization, and SDCPN construction readiness. Then decide whether the deduplicated elicitation references exhibit enough observed attention or retrieval strain to earn finer progressive disclosure.

This protocol can establish which candidate best satisfies the current Mission 4 contract under the cases and runs named here. It cannot establish a universally optimal interview structure or statistical superiority across domains, models, or target formalisms.

## Candidates

### A — domain-primary Coverage and workpiece

Use `plugin-sdcpn/sdcpn-modelling/profile.md` and `plugin-sdcpn/sdcpn-modelling/workpiece-template.md` as currently authored. Target readiness remains distributed between the profile's Verification register and `checks.md`.

**Stage 1: eligible.**

### B — formalism-primary Coverage and workpiece

Replace the profile's Coverage register with `plugin-sdcpn/sdcpn-modelling/coverage-alternatives/formalism-primary.md` and use `plugin-sdcpn/sdcpn-modelling/coverage-alternatives/formalism-primary-workpiece-template.md`. All other authored material remains identical to A.

**Stage 1: eliminated.** Its mandatory Coverage resource exposes concrete SDCPN construction mechanics during ordinary elicitation, violating a preregistered hard gate.

### C — domain-primary elicitation plus a separate construction-readiness view

Use [`plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/`](plugin-sdcpn/sdcpn-modelling/candidates/domain-primary-with-readiness/). Its candidate-specific profile retains domain-primary Coverage and removes construction-readiness checks from ordinary elicitation; its skill composition reuses the domain-primary workpiece and adds a construction-only SDCPN readiness resource. The resulting view cites authoritative workpiece claims under the existing `Construction notes` without reorganizing or duplicating them. This candidate was preregistered here before its wording was authored.

**Stage 1: eligible.**

## Shared invariants

Every candidate uses the same:

- core and plugin system prompts;
- universal progressive reference;
- lifecycle instructions and runtime branches;
- additive, register-pure plugin guidance outside the candidate-specific Coverage and construction-readiness treatment;
- workpiece locality rule;
- construction guidance and three evidence levels;
- tool set, model configuration, case inputs, turn limits, graders, and stop rules within a comparison stage.

If a candidate requires changing another listed invariant, stop: the comparison is confounded and needs a new protocol version.

## Freeze and manifest

Before any model-facing comparison:

1. Give each candidate an immutable id and copy or render its complete model-facing instrument into a candidate-specific manifest.
2. Record the source commit and SHA-256 hash of every system prompt, skill instruction, progressive resource, template, case input, grader, and protocol file.
3. Record the packaged skill resource names and the built server artifact hash.
4. Refuse a paid run when a scoped instrument file is dirty.
5. Never overwrite an observed artifact. Mark invalid runs invalid and retain their evidence.

Changing a frozen candidate or setting creates a new candidate id or protocol version.

## Stage 1 — mechanical and authority audit

Run this before judging prose quality.

For each candidate, record:

- total words in always-on instructions, activated skill instructions, mandatory elicitation references, conditionally read references, and workpiece template;
- packaged resource names and whether each instruction pointer resolves to an advertised `read_skill_resource` path;
- required register presence and order;
- exact duplicate sentences across universal and plugin references;
- operational propositions repeated in more than one authoritative workpiece location;
- centralized summaries that restate local claims;
- construction guidance visible before the construction branch;
- claims of reachability, conservation, exclusivity, validity, or simulation unsupported by the stated evidence level.

A candidate fails this stage if a resource pointer is broken, a workpiece proposition has competing authoritative homes, construction mechanics enter ordinary elicitation, or a check claims a stronger oracle than the available method.

## Stage 2 — owner-led paper walkthrough

Walk every Stage 1-eligible candidate through the same cases without rewriting candidate guidance during the comparison.

### Cases

1. **Reusable resource reservation and release:** two activities need the same limited crew; the crew is unavailable while held and returns either unchanged or with a consequential changed state.
2. **Failure, retry, and recovery:** an activity can fail, repeat only part of the process, and either retain or release occupied resources before retry.
3. **Contextual location:** a physical location may act as a boundary, eligibility condition, capacity, travel-time source, state distinction, resource, or irrelevant detail depending on the operation.
4. **External event versus internal threshold:** work may begin because something arrives from outside or because an evolving internal quantity crosses a threshold.
5. **Directional mode change:** A-to-B and B-to-A have different time, scrap, material, capacity, or sequencing losses.
6. **Hidden waiting:** a case waits because of policy, batching, calendar, transport, resource availability, approval, or recovery rather than because “queue” is an independently elicited object.
7. **Correction versus contextual coexistence:** a later account either replaces an earlier statement or reveals a condition under which both remain true.
8. **Unknown versus unasked:** the person explicitly does not know one value while a different consequential topic has never been raised.

### Walkthrough trace

For each case, produce one row containing:

| Observation | Required record |
| --- | --- |
| Signal | What the profile's Recognition register notices without treating it as fact |
| Next move | Which Operation applies and why it is the smallest useful move |
| Coverage | Where the resulting operational knowledge belongs |
| Workpiece authority | The single location of the claim, its evidence, and epistemic treatment |
| Construction boundary | What remains hidden until construction |
| Readiness | How an SDCPN-relevant gap becomes visible and when |
| Verification | The observable failure and repair if the information is mishandled |
| Evidence level | What any resulting net claim may honestly say |

Do not score a candidate from the elegance of its headings. Record the concrete navigation steps and any point at which the reviewer must translate the same fact twice, choose between competing homes, or introduce formalism vocabulary into the expert-facing move.

## Stage 3 — model-facing candidate probes

Run only candidates that pass Stages 1 and 2 and remain indistinguishable on the decision. Do not pay to run an alternative already eliminated by a structural discriminator. Obtain explicit owner authorization for the paid budget before starting.

### Frozen diagnostic settings

| Setting | Value |
| --- | --- |
| Case | `evaluations/cases/vestera-scheduling` |
| Opening message | `evaluations/cases/vestera-scheduling/opening-message.md` |
| Simulated-expert pack | `evaluations/cases/vestera-scheduling/situation-pack.md` |
| Prospective ledger | `evaluations/oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml` |
| Quality ruler | `evaluations/protocols/ir-quality-ruler-v1` |
| Interviewer model | `claude-sonnet-4-5` |
| Simulated expert model | `claude-sonnet-4-5` |
| Interview turns | 8 before the final workpiece request |
| Per-logical-turn latency stop | 180,000 ms |
| Sampling | provider default; no seed |
| Diagnostic replications | 2 independent runs per remaining candidate |
| Omniscient grader | one fresh `claude-sonnet-4-5` context per run |
| Cold reviewer | a separate fresh `claude-sonnet-4-5` context per run |
| Output | a new immutable `docs/evidence/evaluations/five-register-candidate-comparison-v1/` location |

The current production runner does not select a draft candidate manifest. Stage 3 is not executable until a versioned comparison runner can package one declared candidate without editing active sources between runs, records that candidate's exact manifest and built artifact hash, and passes the existing hermetic artifact/recovery checks. Do not compare candidates by manually swapping active files under one run id.

Use a fresh conversation for every candidate/run and keep all shared invariants fixed.

### Elicitation probes

For each candidate, use the same opening request and simulated-expert input. Record:

- first-turn question count and whether questions share one frame;
- occurrences of schema- or PN-shaped language in user-facing questions;
- which resources were read, in what order, and why;
- words or tokens loaded from each resource;
- whether each useful stretch updates a single authoritative workpiece claim;
- duplicate propositions across workpiece sections;
- target-relevant gaps identified before construction versus first discovered during construction;
- distinctions among unknown, unasked, declined, deferred, conflict, correction, and contextual coexistence;
- turn latency, model calls, tokens, and recorded cost.

### Construction probes

Use the same frozen workpiece input for each eligible candidate. Record separately:

- tool-schema acceptance and rejected calls;
- agent-reviewed structural discrepancies against the workpiece;
- target gaps that block or materially alter construction;
- unsupported assumptions introduced during construction;
- whether resource acquisition/release, hidden waiting, directional losses, and contextual quantities are visibly represented;
- any actual simulation or stronger analysis, including its scenario and scope;
- the exact evidence level used in delivery claims.

A parser-accepted or tool-schema-accepted definition is not behavioral success. An observed simulation trace is not a universal invariant.

## Stage 4 — selected-candidate campaign against the frozen control

Select one candidate through Stages 1–3 before running the Mission 4 campaign. Do not pay to campaign every lightly reasoned variant.

Create a new versioned protocol/output location based on `evaluations/protocols/prospective-runbook-v1/`. Preserve its case wall, grader separation, immutable manifests, artifact retention, and three-invocation campaign shape unless a separately accepted protocol decision changes one. Never write into `docs/evidence/evaluations/vestera-prospective-baseline-v1/`.

For each valid selected-candidate run:

1. Recover the full latest workpiece.
2. Run an independent omniscient grade with the frozen ruler and prospective ledger.
3. Run a separate cold review with only the opening request and workpiece.
4. Human-review every hard failure, grader disagreement, and new mistake class.
5. Record resource reads, loaded context, duplicate claims, target-gap timing, latency, tokens, cost, and evidence-level discipline alongside the frozen ruler outputs.

Campaign adjudication reports ranges and individual vectors rather than collapsing baseline or candidate variation to one mean.

## Observable comparison criteria

### Hard gates

A candidate is ineligible if it:

- invents operational content or silently hardens evidence;
- collapses conflict, correction, or contextual coexistence;
- presents unasked material as person-declared unknown;
- interviews through workpiece or target-schema headings;
- creates competing authoritative workpiece claims;
- loads construction mechanics to frame ordinary elicitation;
- loses a reusable resource's reservation/release semantics or a directional/contextual distinction already present in the input;
- claims behavioral validity above the evidence level actually reached;
- fails to emit a recoverable latest workpiece.

### Comparative observations

Among gate-passing candidates, compare:

- objective-aligned acquisition and smallest-next-question quality;
- cold reconstruction of the process spine and target-relevant distinctions;
- number and consequence of target gaps discovered only at construction;
- workpiece claim duplication and reader effort;
- schema-shaped questioning and formalism leakage;
- resource reads and loaded context cost;
- construction correspondence and explicit losses;
- honest separation of tool acceptance, structural review, and behavioral evidence.

No one scalar decides the result. Context cost is a tie-breaker after fidelity, acquisition, workpiece authority, and evidence discipline.

## Disposition rule

1. Eliminate hard-gate failures and retain their artifacts.
2. Prefer the candidate that preserves operational language and single-home workpiece authority while exposing consequential target gaps no later than they are needed.
3. Treat differences inside the frozen baseline's observed variation as uncertain unless a structural discriminator explains them.
4. When candidates trade gains, record the owner-selected trade-off explicitly; do not manufacture a mean score to hide it.
5. If no candidate dominates on the mission imperative, retain the smallest reversible candidate and name the next discriminating probe.
6. After selection, remove losing alternatives from the candidate instrument. Preserve the comparison result as evidence rather than keeping several live prompt shapes.

## Progressive-disclosure decision

Do not split the universal reference or plugin profile because of word count alone. A split is earned when the deduplicated candidate shows one or more of these under the probes:

- irrelevant sections are repeatedly loaded for branches that never use them;
- the model misses or contradicts guidance that is present but buried;
- conditional topics such as quantity distributions, rare events, or construction checks form clear branches with reliable pointers;
- a smaller directly named resource measurably reduces loaded context without delaying a load-bearing question or check.

If no observed strain meets that bar, retain the shallower resource topology and close the disclosure concern without adding files.

## Stop or reorient

Stop the comparison if:

- candidate instruments differ outside the declared Coverage/workpiece/readiness surface;
- a resource fails to package or its exact run instrument cannot be reconstructed;
- a grader uses information outside its allowed wall;
- the workpiece locality or evidence-level contract is ambiguous enough that reviewers cannot apply it consistently;
- a runtime failure prevents normal artifact retention;
- a proposed fix requires typed capture, completion, projection, or workflow machinery outside Mission 4.

Repair the protocol or candidate at the owning boundary, assign a new version where required, and restart only the invalidated stage.
