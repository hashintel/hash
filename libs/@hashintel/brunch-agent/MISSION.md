# Mission 4 — ship and prove the Brunch core/plugin elicitation architecture

## Status

**Live. Recut accepted by the owner on 2026-09-02** for [FE-1563](https://linear.app/hash/issue/FE-1563/redesign-the-elicitation-runbook-and-workpiece-against-the-frozen); this file is the sole execution authority. The owner granted a pre-proof oracle-design gate for the three `ORACLE GAP` leaves below: items 4 and 5 close when the merged testing approach supplies their oracles, and item 7 closes when the owner performs the acceptance gate on the staged topology-neutral case matrix. Until those gates are performed, authorized work is merging the testing approach, closing the gaps, and the hermetic proof items; no real-model evaluation, freeze, or paid call is authorized.

Current state: the agreed topology was implemented and committed as `93eb211dd3` under the owner's direct redirection of 2026-09-02, before this recut existed; this draft governs what follows it, not that commit retroactively. Core mounts an independently activatable `elicitation` capability skill; plugin-sdcpn is a contribution bundle whose job skill activates it; plugin-gherkin and a stubbed plugin-dafny hold their proposed homes and are not composed. The YAML plugin machinery is removed; suspended code is isolated under `src/_suspended/`. No instrument is frozen, no paid authorization exists, and no campaign protocol is live. The owner set aside the skill-composition side-quest evidence and every campaign design after v3; a new testing approach is to be merged before evaluation resumes. Campaign history is in `docs/evidence/evaluations/` and is not repeated here.

Mission 3's prospective campaign remains the immutable control: one invalid runtime member, two valid independently graded workpieces, adjudicated range in [`vestera-prospective-baseline-v1/campaign-adjudication.md`](docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md), source revision `b738aa1be1a62a9f9cdde89ced78558f04293a77`.

### Architecture kernel (owner-accepted)

1. **Topology.** Exactly this, per package; directories are homes, not mandatory slots, and `tools/` exists only where an executable capability is earned:

   ```text
   packages/core/src/
   ├── prompts/SYSTEM.md                     always-on universal invariants
   ├── skills/elicitation/{SKILL.md, references/universal-elicitation.md, skill.ts}
   ├── skills/skill-markdown.ts              SKILL.md + files → defineSkill
   └── flue.ts                               useBrunchAgent(): model, elicitation skill, prompt
   packages/plugin-<pairing>/src/
   ├── prompts/APPEND_SYSTEM.md              optional always-on plugin policy
   ├── skills/<job>/{SKILL.md, references/, templates/, skill.ts}
   ├── tools/                                only when a real capability exists
   └── flue.ts                               use<Pairing>Plugin(): selected mounting
   apps/brunch-agent                         registration, transport, diagnostics, app tools
   ```

   Authored paths equal the packaged paths the model reads. This follows Flue's native skill-directory convention (`skills/<name>/SKILL.md` with frontmatter and supporting files; name equals directory).
2. **Responsibility test.** A prompt carries invariants that must hold for the whole mounted lifetime of a contribution. A skill carries the procedure **and judgment** for a recognizable job or capability. A tool contract carries the semantics and constraints of one executable operation. Package authority (core, plugin, app, binding) and primitive type are independent axes; core-owned does not imply always-on.
3. **Core capability.** `elicitation` is core's one capability skill: adaptive human-knowledge acquisition and epistemic correction. It excludes target review, target mutation, construction, and tool execution. Job skills activate it when progress requires knowledge that cannot be responsibly inferred from existing evidence. This is the owner's topology; it is not a hypothesis under test by routing experiments.
4. **Plugin cardinality.** A plugin is a contribution bundle, not a symmetric inventory. It contributes the smallest set of independently activatable job skills its real user jobs earn. `sdcpn-modelling` and `gherkin-specification` are one job each; Dafny's specification/verification split is an open pressure-test question, not a commitment.
5. **Content basis.** Ampcode is the conceptual basis ([design evidence](docs/evidence/design/mission-4-prompt-skill-tool-architecture.md)); Five-Register supplies the domain-primary workpiece template and the evidence-level checks. No third synthesis. Registers classify what guidance does; they are not phases, question order, schemas, or file topology.
6. **Question dosage.** The accepted wording is the Ampcode text now in production: do not open with a battery of independent questions; deepen one answerable thread at a time; group questions only when they share one frame. "Exactly one question", "one interrogative sentence", and "at most one `?`" were narrower operationalizations introduced downstream and are withdrawn. Any stricter rule is an owner decision, never a checker implementation detail.
7. **Scope of experimental authority.** Behavioral evidence may falsify an implementation, a prompt wording, or a proof claim. It may not select or replace the topology in items 1, 3, or 4; a topology change is presented to the owner with the observed strain and a proposed smallest mitigation.
8. **Source-to-production manifest.** Selected sources are the Ampcode (`A`) and Five-Register (`F`) drafts at `e087f570d7:libs/@hashintel/brunch-agent/packages/core/_drafts/`; the Gherkin paper instrument (`G`) is `A`'s `plugin-gherkin/` copied unchanged to `evaluations/protocols/gherkin-shape-c-paper-v1/instrument/`. Implementation commit: `93eb211dd3`. Proof item 1 is run against this table; any other difference is a stop condition.

   | Production file | Source | Permitted delta |
   | --- | --- | --- |
   | `core/src/prompts/SYSTEM.md` | `A core/SYSTEM.md` | none |
   | `core/src/skills/elicitation/references/universal-elicitation.md` | `A core/universal-elicitation.md` | none |
   | `core/src/skills/elicitation/SKILL.md` | none; new text accepted by the owner in conversation on 2026-09-02 | the committed text is the accepted text |
   | `core/src/skills/skill-markdown.ts`, `core/src/flue.ts`, each `skill.ts`, each `flue.ts` | none; mounting code | must package each `SKILL.md` and its files at the authored relative paths |
   | `plugin-sdcpn/src/prompts/APPEND_SYSTEM.md` | `A plugin-sdcpn/APPEND_SYSTEM.md` | none |
   | `plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md` | `A .../sdcpn-modelling/SKILL.md` | "Activate the `elicitation` skill" replaces reading the packaged universal reference; `references/` and `templates/` path prefixes; the exact `/.flue/packaged-skills/...` resource-URI sentence |
   | `plugin-sdcpn/.../references/profile.md` | `A .../sdcpn-elicitation.md` | filename only |
   | `plugin-sdcpn/.../references/pn-construction.md` | `A .../pn-construction.md` | none |
   | `plugin-sdcpn/.../references/checks.md` | `F .../checks.md` | none |
   | `plugin-sdcpn/.../templates/workpiece.md` | `F .../workpiece-template.md` | filename only |
   | `plugin-gherkin/src/prompts/APPEND_SYSTEM.md` and `skills/gherkin-specification/{references/*, templates/workpiece.md}` | `G` | filenames and path prefixes only |
   | `plugin-gherkin/src/skills/gherkin-specification/SKILL.md` | `G SKILL.md` | the same three adaptations as the SDCPN skill |
   | `plugin-dafny/**` | none; stub homes authored 2026-09-02, marked "Stub" in every file | placeholder only; no procedure, no mounting by any app |
   | removed: core `plugin/`, `schema/`, `teaching/`, `interpretation/`, `testing/`, `prompts.ts`; both `plugin.yaml`; binding `useElicitation` | retired YAML/typed-plugin machinery | removal is part of the accepted implementation; last present at `924be780ce` |

   Rationale for the shape is [design evidence](docs/evidence/design/mission-4-prompt-skill-tool-architecture.md), whose superseded packaged-resource portions are marked in its header.

## Imperative

Prove that the implemented core/plugin architecture behaves as designed on the production Flue `ChatAgent` path: the job skill routes to core's `elicitation` capability, universal and plugin judgment are disclosed when and only when their branch requires them, the workpiece is cold-readable and evidence-honest, and construction stays outside ordinary elicitation. Establish gains, regressions, and remaining uncertainty against Mission 3's immutable control, cross an honest local/restricted Petrinaut product boundary, and hand Mission 5 one selected frozen workpiece with its exact source conversation, instrument manifest, and adjudication.

The architecture is decided. This mission evaluates it methodically and step-wise, following Flue's documented mechanics, and does not reopen topology, capture, projection, provenance, observer machinery, or live net mutation.

## Throughline

```text
implemented topology (93eb211dd3)
→ hermetic mounting, activation, and disclosure proof on the built ChatAgent
→ step-wise real-model evaluation under the merged testing approach
→ each observed failure → repair record → owner decision → one focused commit
→ frozen instrument (hashes) → owner-authorized ceiling
→ campaign through the production ChatAgent → independent grading → human adjudication vs control
→ local/restricted Petrinaut panel → AI SDK → ChatAgent witness of the same instrument
→ selected frozen Mission 5 workpiece + source conversation + manifest + adjudication
```

The production door is Petrinaut panel → AI SDK `useChat`/`onToolCall` transport → long-running Flue `ChatAgent` → provider. Core returns the universal prompt and mounts `elicitation`; plugin-sdcpn mounts its append, `sdcpn-modelling`, the read-only documentation tool, and conditionally the construction tools; the app composes these contributions and owns no core elicitation or plugin-domain semantics.

## Proof

This proof establishes that the implemented architecture was exercised on the production path, behaved coherently on the named cases, crossed the local product boundary, and produced an inspectable Mission 5 handoff. It does not establish universal superiority, remote deployment, durable capture, projection, provenance, or behavior not exercised by a named oracle.

1. **Topology and translation fidelity.** Production matches the kernel tree and the selected sources with only the permitted deltas. Oracle: `git diff --no-index` of each production file against its source in the item 8 manifest showing only the permitted delta; `packages/core/test/architecture/boundaries.test.ts`; `packages/plugin-sdcpn/test/sdcpn-modelling-skill.test.ts`, `packages/plugin-gherkin/test/gherkin-specification-skill.test.ts`, `packages/plugin-dafny/test/dafny-verification-skill.test.ts` (each asserts packaged paths equal authored paths).
2. **Mounting and disclosure.** The built `ChatAgent` presents the core prompt, the SDCPN append, and a catalog containing `elicitation` and `sdcpn-modelling`; activating the job skill and then the capability skill exposes their resources at exact packaged paths. Oracle: `apps/brunch-agent/test/build-artifact.test.ts` ("packages the authored skill without the retired filesystem loader") and `apps/brunch-agent/test/petrinaut-chat.test.ts` driving `petrinaut-chat.integration.ts`, whose scripted provider activates `sdcpn-modelling`, then `elicitation`, then reads `references/universal-elicitation.md` at its advertised packaged path.
3. **Construct-only path.** Construct-only execution activates `sdcpn-modelling`, reads only construction resources, uses only mounted tools, and reports evidence levels honestly. Oracle: `apps/brunch-agent/test/runbook-headless.test.ts` driving `runbook-headless.integration.ts` with the fixture `test/fixtures/candidate-process-model-workpiece.md`; expected: `resourceFilesRead` is exactly the two construction resources, no capture-store write, honest evidence level.
4. **Capability activation on the real path.** `sdcpn-modelling` activates `elicitation` before substantive interactive questions in a materially reliable proportion of real-model runs, and does not activate it on construct-only or resolvable-review paths. `ORACLE GAP`: supplied by the merged testing approach; must resolve before this leaf is claimed. This is the known risk of the accepted topology and is reported to the owner as strain, not resolved by switching topology.
5. **Routing, dosage, and restraint.** Interactive turns obey the accepted dosage wording (item 6); required resources are read before they are relied on; the workpiece template is read at first creation or material revision and not before; irrelevant resources are avoided. `ORACLE GAP`: behavioral observation under the merged testing approach; the oracle observes overload and frame coherence, not character counts.
6. **Workpiece contract.** One cold-readable authoritative home per claim; expert evidence, normalization, inference, assumption with reason and check, unknown, not-yet-asked, declined, deferred, conflict, correction, contextual coexistence, omission, and loss where material; construction-opened decisions without laundering authorship. Oracle: the topology-neutral case matrix of item 7 applied to each recovered workpiece, plus one complete fresh-context run of `evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md` per graded workpiece, retained beside it in the campaign's evidence directory.
7. **Named adversarial cases.** Opening overload, policy/practice, contextual quantities, scarce-resource reservation/release, hidden waiting, directional loss, correction versus contextual coexistence, unknown versus not-yet-asked, construction-opened loss ownership. Oracle: the proposed [`mission-4-topology-neutral-case-matrix.md`](evaluations/cases/mission-4-topology-neutral-case-matrix.md), which maps recognition → operation → answerable question shape → authoritative home and epistemic treatment → construction boundary → expected observation without question-count or topology proxies. The owner must accept or amend that matrix before this leaf is claimed. The former [`exact-candidate-walkthrough.md`](docs/evidence/evaluations/vestera-prospective-candidate-v2/exact-candidate-walkthrough.md) is historical evidence of the rejected packaged candidate and carries the withdrawn one-question wording; it is not the oracle. `ORACLE GAP` pending owner acceptance of the proposed matrix.
8. **Production integrity.** Build, typecheck, lint, and unit tests pass for core, binding, transport, the three plugins, and the app; ordinary paths expose no structured-question, capture-mutation, or construction-mutation tools. Oracle: `turbo run build lint:tsc lint:eslint test:unit` over `@hashintel/brunch-agent`, `@hashintel/brunch-agent-binding-flue`, `@hashintel/brunch-agent-transport-aisdk`, the three plugins, and `@apps/brunch-agent`, all green at the frozen commit; `apps/brunch-agent/test/build-artifact.test.ts` asserts the authored skills are packaged without the retired loader, while `apps/brunch-agent/test/petrinaut-chat.test.ts` asserts that the ordinary production path exposes no `brunch_ask`, `sweep`, `brunch_sweep`, or construction mutation tools.
9. **Frozen campaign against the control.** A new versioned protocol hashes the exact instrument and the two valid flat-prompt control workpieces, runs through the production `ChatAgent`, and receives independent fresh-context grading with the frozen ruler. Human adjudication compares only against the named control range without collapsing either side to a mean. Runtime and simulator failures are reported separately. Precondition: the simulated-expert refusal defect is diagnosed and a pre-registered mitigation is in the protocol before any paid member.
10. **Visible witness.** A human uses the same frozen instrument through the local/restricted Petrinaut panel and inspects the recovered workpiece, with raw trace binding browser, route, conversation, activations, resource reads, and absence of construction tools. Oracle: screenshots, accessibility snapshots, a network record binding the panel to `/api/chat`, the raw Flue conversation snapshot with ordered tool and resource calls, the built-server manifest matched to the campaign member, and SHA-256 hashes, all under `docs/evidence/evaluations/<campaign>/product-witness/`; the owner adjudicates.
11. **Mission 5 handoff.** One selected workpiece frozen with its exact source Flue conversation, instrument/model manifest, and adjudication. Oracle: a `mission-5-handoff.md` in the campaign's evidence directory naming the workpiece file, the raw conversation snapshot, and the manifest with their SHA-256 hashes, plus one cold reviewer run over the selected workpiece alone.
12. **Close integrity.** Mission 3 evidence untouched; disposal only after surviving content has an authoritative home; planning reconciled without loss; archive and PR close report. Oracle: `git diff --stat b738aa1be1a62a9f9cdde89ced78558f04293a77..HEAD -- docs/evidence/evaluations/vestera-prospective-baseline-v1` empty; every removed workbench's surviving rationale located in `docs/evidence/`; `docs/mission-archive/README.md` lists this mission; PR close report present.

## Constraints

- The owner retains this contract, every candidate text change, the paid ceiling, campaign adjudication, witness acceptance, handoff selection, and closure. These are external actions an agent waits for, not facts it records.
- A prompt, skill, or resource edit occurs only through a repair record (observed failure, responsible disclosure layer, smallest change, regression risk), owner acceptance, and one focused commit. Recut, implementation, freeze, and close never share a commit.
- Oracles may falsify; they may not redefine. No checker operationalization stricter than item 6 enters production text.
- Preserve the Mission 3 campaign and ruler unchanged. Never write into `vestera-prospective-baseline-v1`; use only its two valid workpieces as the quality control; keep operational validity separate from workpiece quality.
- No paid call before a frozen clean instrument and an explicit owner ceiling and stop rule covering candidates, graders, retries, and witness together.
- Keep one model-facing agent, Flue-native `useInstruction`/`useSkill`/`useTool`, progressive disclosure, the `ChatAgent` door, and skill directories packaged through `defineSkill`. No loader, workflow engine, second agent, TUI, YAML plugin definition, or repertoire runtime.
- Universal elicitation is core-authored and core-mounted. Plugins never restate universal rules; they add typology or formalism consequences. Plugins name concepts, never facts or nouns from a concrete scenario.
- Construction stays outside ordinary elicitation; it may select a representation, never invent operational facts; evidence levels stay distinct.
- Suspended code stays under `src/_suspended/` and unmounted. No capture consumption, projection, provenance, observer, scoped patching, structured-question revival, or live mutation beyond the mounted construct-only path.
- Read-only audits may run in parallel; no concurrent writers in the shared worktree.

## Fog-line

Do not design past these until evidence or the owner settles them:

- Whether independent `elicitation` activation is reliable enough on the real path, and if not, which mitigations are legitimate within the accepted topology (skill description wording, append routing sentence, job-skill instruction order) versus which require an owner decision.
- The exact protocol, oracles, and cadence of the merged testing approach; items 4 and 5 remain `ORACLE GAP` until it lands.
- Whether the owner accepts or amends the proposed topology-neutral case matrix; item 7 remains `ORACLE GAP` until that gate is performed.
- The cause of simulated-expert refusals and the cheapest pre-registered mitigation (same-message retry, different expert model, or a content-neutralized situation pack).
- Whether the withdrawn review-routing branch and template-read gate are re-added as owner decisions after observed failure, or left out.
- Whether the gherkin and dafny bundles expose a boundary strain in the two-level architecture that the SDCPN bundle alone did not.
- Which valid candidate workpiece is the strongest Mission 5 handoff.
- Whether the local witness exposes a product-boundary failure invisible in headless runs.

## Stop or reorient

Stop and surface the evidence if:

- any production prompt, skill, or resource text changes without a repair record and owner acceptance, or outside the permitted deltas in item 8;
- an oracle is stricter than item 6, or a prompt is edited to satisfy a checker;
- an experiment result is used to change items 1, 3, or 4 rather than reported as strain;
- an agent records a freeze, adjudication, acceptance, handoff, or closure the owner has not performed;
- a candidate run touches the frozen control, ruler, case truth, graders, or v1 output location;
- universal teaching is duplicated in an append or plugin skill, or the template or construction resources are read before their branch requires them;
- a concrete scenario fact enters reusable teaching;
- capture, projection, provenance, observer, deployment, or live mutation scope expands;
- a paid call begins without a frozen clean instrument and explicit ceiling;
- a candidate is called better from fluency, aesthetics, one favorable member, or a collapsed mean;
- a headless run, image, HTTP status, or local panel interaction is described as a remote deployment;
- closure cannot name one exact selected workpiece, source conversation, manifest, and adjudication.

## Deferred

Mission 5 owns capture-backed review and the first evidence-backed "why" over the frozen prepared pair. Mission 6 owns automatic traceable projection into one meaningful live SDCPN region. Mission 7 owns bounded authorized reviewer revision and scoped net patching. Mission 8's deployment branch stopped after local application proof. Mission 9 owns the optimisation handoff after its consumer contract exists. The observer, host continuity, compaction, voice, observability, simulated-conversation viewing, remote release, structured questions, and Gherkin/Dafny production routes remain in [`MISSION.next.md`](MISSION.next.md) and its drafts; none is implementation authority here.
