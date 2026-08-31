# Mission 4 — owner-led runbook and workpiece redesign

## Status

Live. This file is execution authority for [FE-1563](https://linear.app/hash/issue/FE-1563/redesign-the-elicitation-runbook-and-workpiece-against-the-frozen). Mission 3's frozen prospective campaign is the immutable control: one invalid runtime member, two valid independently graded workpieces, and an adjudicated range recorded in [`docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md`](docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md). Its observed artifacts and source revision `b738aa1be1a62a9f9cdde89ced78558f04293a77` remain the exact instrument of record; current source may be relocated, but no relocated branch-tip file may be represented as the frozen v1 instrument.

Later projection, provenance, bounded revision, observer, host-continuity, and optimisation concerns remain in [`MISSION.next.md`](MISSION.next.md). They are not implementation authority here.

### Accepted design decision — Flue-native package ownership

**Observed strain:** the app-local `ChatAgent` mixed the core Brunch prompt, SDCPN steering and runbook resources, SDCPN construction tools, Petrinaut host tools, and transport conventions, making none of their package authorities visible. **Local obligation:** follow Flue's native distinction between the agent's returned core instructions, `useInstruction` contributions, progressively disclosed `useSkill` resources, and `useTool` capabilities while exposing core and SDCPN ownership directly. **Alternatives:** preserving a substrate-neutral core would have kept agent composition in `binding-flue`, contrary to the intended split; making core and plugin Flue-native keeps the app as the required directive-marked registration and host composition point. **Owner acceptance:** the owner explicitly selected the Flue-native core/plugin alternative before implementation. This decision relocates the existing instrument without changing its runbook semantics and does not reactivate the generalized repertoire/`useElicitation()` runtime.

## Imperative

Manually reshape the technically viable Mission 3 elicitation runbook and Markdown workpiece into a stronger, research-informed candidate that the owner understands and endorses one consequential decision at a time.

Use the completed research synthesis, historical workpieces, owner-supplied edge cases, and frozen prospective baseline as evidence rather than treating any one source as a specification. The mission should expose where the current package's teaching order, question dosage, epistemic treatment, phase boundaries, or workpiece structure strain under real modelling, make the least structural change that answers each observed strain, and establish the gains, regressions, and remaining uncertainty of the resulting candidate against the frozen control.

This is not an autonomous rewrite and not a statistical claim of universal superiority. The design conversation and manual walkthroughs are part of the work: the owner expects remodeling itself to reveal consequential corner cases that an agent-generated replacement would miss.

## Throughline

One stepwise redesign through the production core-agent and SDCPN-plugin package seam:

```text
research synthesis + historical workpieces + current authored resources
→ owner and agent inspect one observed strain or edge case
→ agree the local obligation and smallest structural or teaching change
→ manually revise the one-skill runbook/workpiece package
→ walk known and owner-supplied cases through that revision
→ repeat only at the new fog-line
→ freeze a versioned candidate instrument
→ run it through the production Flue ChatAgent
→ grade the recovered workpiece with the frozen ruler
→ compare candidate evidence with Mission 3's frozen control
```

The semantic edit surface is the SDCPN plugin's existing modelling skill: `SKILL.md`, `elicitation.md`, `ir-template.md`, and only the construction/check material whose phase ownership is directly implicated. Brunch core owns the stable Flue agent prompt; plugin-sdcpn owns its additional prompt material, runbook skill, and target-specific tools; the app owns only the directive-marked registration point and Petrinaut host composition. Amend the structural-typing specification only when an accepted redesign decision contradicts it. Keep changes reviewable in small semantic steps rather than replacing the package wholesale.

The baseline is available as a comparison input, not a design prescription. Its observed range and dispositions must be considered before the candidate instrument is frozen or any improvement claim is made. Candidate runs use a new versioned protocol/output location and preserve their own instrument manifest; they never write into or modify the baseline campaign.

## Proof

This proof establishes that the owner-led redesign produces a coherent candidate runbook/workpiece package with inspectable evidence of its effects. It does not establish projection, provenance, observer consolidation, scoped net revision, comprehensive domain semantics, or final demo readiness.

Observe all of the following:

1. Each consequential redesign has a recorded observed strain or edge case, the local obligation it answers, the alternatives considered where material, and owner acceptance before implementation.
2. The package remains one real Flue skill with progressive disclosure. Ordinary elicitation stays in operational vocabulary; IR headings, SDCPN structures, and construction schemas do not become an opening questionnaire.
3. The workpiece gives an authoritative, cold-readable home to the objective and process spine; expert evidence; agent inference; assumptions with reason and how-to-check; unknown, unasked, declined, deferred, and conflicting material where present; corrections or contextual coexistence; and construction-opened losses without laundering authorship.
4. Concrete walkthroughs exercise at least opening overload, policy versus practice, contextual quantities, scarce-resource reservation/release, hidden waiting, directional loss, correction versus contextual coexistence, and genuine unknown versus not-yet-asked. Owner-supplied cases may deepen this set.
5. One frozen candidate version runs through the production Flue `ChatAgent` and emits a recoverable workpiece. Its run artifacts record the exact candidate instrument and remain separate from the Mission 3 baseline.
6. Independent omniscient and cold review with the frozen ruler identifies gains, regressions, disagreements, and new mistakes relative to the control. A human adjudication states what the evidence supports without collapsing baseline variation to one mean score.
7. The resulting candidate is sufficient to prepare the prebuilt FE-1476 workpiece or explicitly names the smallest remaining workpiece gap. No projection success is inferred from workpiece quality.

Prefer one coherent candidate and a discriminating comparison over many lightly reasoned variants. A fluent interview or attractive template by itself is not proof.

## Constraints

- Preserve the Mission 3 prospective baseline artifacts unchanged and treat source revision `b738aa1be1a62a9f9cdde89ced78558f04293a77` as the committed v1 instrument. Current source may move without compatibility wrappers; candidate runs must record the relocated files under a new versioned campaign and may not write into the v1 output location.
- Treat the authoritative elicitation research synthesis as evidence and decision support, not a backlog to implement wholesale. Shared-source repetition is not independent corroboration.
- The owner leads semantic and editorial choices. The agent presents alternatives, traces consequences, edits accepted decisions, and runs probes; it does not infer approval or silently choose the final package.
- Work one observed strain or owner-supplied edge at a time. Prefer subtraction, relocation, and clearer authority before adding another catalog, abstraction, or artifact.
- Keep universal elicitation, SDCPN investigation, workpiece structure, and PN construction distinct enough that each can change without turning questions into schema slots.
- Preserve one model-facing agent, one runbook skill, Flue's native returned instructions, `useInstruction`, `useSkill`, `useTool`, resource disclosure, and the production `ChatAgent` door. Do not add a loader, workflow engine, second agent, or TUI.
- Do not add a comprehensive ontology, closed claim kinds, typed completion algebra, generalized plugin/repertoire runtime, observer fold, projection engine, capture-store join, or live Petrinaut mutation path. The statically composed Flue-native core and SDCPN package contributions are the production path, not a reactivation of generalized `useElicitation()`.
- Preserve exact expert evidence and honest authorship. Normalized prose, agent assumptions, unasked material, and explicit user unknowns remain distinguishable.
- Do not tune reusable guidance only to Vestera. Scenario facts and owner examples may test the package but do not enter reusable teaching as universal facts.
- Keep construction outside ordinary elicitation. Move construction-owned material only when the redesign can observe the effect; do not broaden into Mission 5's provider-schema problem.
- Update affected Petrinaut user-facing documentation only if this mission changes user-visible behavior in Petrinaut packages; internal runbook resource edits alone do not create that obligation.

## Fog-line

Do not design the whole candidate before resolving these questions with the owner at the affected resource:

- Whether the first useful change is teaching order/dosage, workpiece structure, authorship/epistemic treatment, or a smaller combination.
- Whether broad headings survive, collapse into a case/process spine plus epistemic ledger, or become objective slices with supporting cases. Versioned assertion clusters are not the default.
- Whether question batching guidance belongs in always-on routing, the skill body, or elicitation resources, and whether the prospective control replicates historical opening overload.
- How much `Transform to PN` guidance should leave elicitation and whether projection losses should open only during construction.
- How to represent correction, contextual coexistence, declined/deferred material, and directional/context-dependent values without mandatory per-statement semantic typing.
- Which duplicate summaries can be removed only after one authoritative home is demonstrated.
- The smallest candidate campaign that can reveal regression given baseline variance without pretending one scenario proves universal superiority.
- Whether a manually discovered edge belongs in reusable guidance, a probe/grader catalog, the workpiece shape, or mission evidence only.

Resolve each at the smallest real or paper boundary and record the decision before continuing. A longer fog-line after a walkthrough is calibration, not failure.

## Stop or reorient

Stop and surface the evidence if:

- the redesign edits or overwrites the frozen baseline artifacts, case, graders, ruler, or source revision, or presents relocated current source as the v1 instrument;
- the agent produces a wholesale replacement before the owner works through its consequential choices;
- headings or typologies become a scripted intake form or dictate the interview's opening order;
- uncertainty is handled by inventing more mandatory fields rather than preserving it honestly;
- normalized agent prose is presented as verbatim expert evidence or never-asked material becomes a user-declared unknown;
- concrete Vestera or owner-supplied facts leak into reusable teaching;
- construction, projection, provenance, observer scheduling, capture folding, or live net mutation expands into this mission because a later mission may need it;
- a candidate is called better from fluency, parser shape, aesthetics, or one favorable anecdote without the frozen comparison ruler and explicit regressions;
- the redesign requires restoring Condition 5's foreground `brunch_ask`, typed extraction/fold, completion accounting, or minute-scale ordinary turns.

A need for one stronger structural distinction is not permission to rebuild the retired typed kernel. Name the exact ambiguity and test the least mechanism that could resolve it.

## Deferred

Mission 5 owns the first workpiece-to-live-SDCPN projection and evidence-backed provenance answer. Mission 6 owns bounded reviewer re-elicitation and scoped net patching. Mission 7 owns the complete six-beat rehearsal and optimisation handoff. The inferential observer remains an optional spike rather than this mission's workpiece mechanism. Host/session continuity, compaction, voice, broad observability, simulated-conversation viewing, and remote release remain in `MISSION.next.md` unless this mission's real throughline exposes a direct blocker.
