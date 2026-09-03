# Mission 4 — prove the Brunch core/plugin elicitation architecture is alive

## Status

**Live. Proof-of-life recut accepted by the owner on 2026-09-03** for [FE-1563](https://linear.app/hash/issue/FE-1563/redesign-the-elicitation-runbook-and-workpiece-against-the-frozen); this file is the sole execution authority. The owner accepted [`mission-4-activation-and-restraint-ruler-v1.md`](evaluations/oracles/mission-4-activation-and-restraint-ruler-v1.md) with a three-case proof floor, controlled S3/S4 review inputs, Orientation-before-activation allowance, opening-Battery guard, and corrected template-read ordering. The owner then accepted inlining the sole always-required universal elicitation resource into the capability skill before campaign freeze, removing an avoidable mandatory tool-call failure point without changing the skill boundary or guidance. These acceptances supply the oracle and repair authority; they do not prove the architecture, freeze a protocol, authorize paid calls, or accept a workpiece.

Current state: the agreed topology baseline is implemented on the current Graphite ancestry at `baba973269ce7ecf1a47de8749c751033b2ce471` (historical pre-restack implementation `93eb211dd3d7fa07bc5b1ff69ddb402b45b07cf9`), with the owner-accepted pre-freeze inlining repair recorded in [`mission-4-inline-universal-elicitation-2026-09-03.md`](docs/evidence/decisions/mission-4-inline-universal-elicitation-2026-09-03.md). Core mounts an independently activatable `elicitation` capability skill; plugin-sdcpn is a contribution bundle whose job skill activates it; plugin-gherkin and a stubbed plugin-dafny hold their proposed homes and are not composed. The YAML plugin machinery is removed; suspended code is isolated under `src/_suspended/`. The persona harness, six prospective case families, and client-tool hosts are landed evaluation infrastructure. The owner-shaped [`mission-4-proof-of-life-v1`](evaluations/protocols/mission-4-proof-of-life-v1/protocol.md) records the selected cases, models, budgets, order, replacement rule, and logical ceiling. Its 33-file [`instrument-manifest.json`](evaluations/protocols/mission-4-proof-of-life-v1/instrument-manifest.json) at `cc9a68497d` was accepted by the owner on 2026-09-03, together with a $10 USD paid ceiling under the frozen serial stop rules; see the [freeze acceptance](docs/evidence/decisions/mission-4-proof-of-life-freeze-acceptance-2026-09-03.md).

This recut removes the topology-neutral case portfolio, broad workpiece-quality campaign, Mission 3 comparative adjudication, Petrinaut browser witness, and comprehensive close-out sweep from FE-1563's blocking proof. The proposed [`mission-4-topology-neutral-case-matrix.md`](evaluations/cases/mission-4-topology-neutral-case-matrix.md) remains unaccepted future input to be allocated by the successor addendum and the first missions that make its individual cases load-bearing. Mission 4 will retain one exact conversation/workpiece/manifest bundle as a downstream handoff candidate, but will make no workpiece-quality, reusable-fixture, database-seed, or product-parity claim about it.

### Architecture kernel (owner-accepted)

1. **Topology.** Exactly this, per package; directories are homes, not mandatory slots, and `tools/` exists only where an executable capability is earned:

   ```text
   packages/core/src/
   ├── prompts/SYSTEM.md                     always-on universal invariants
   ├── skills/elicitation/{SKILL.md, skill.ts}
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
6. **Question dosage.** The accepted wording is the Ampcode text now in production: do not open with a battery of independent questions; deepen one answerable thread at a time; group questions only when they share one frame. "Exactly one question", "one interrogative sentence", and "at most one `?`" were narrower operationalizations introduced downstream and are withdrawn. The proof-of-life campaign gates only the opening prohibition and reports later dosage without making it acceptance-determining.
7. **Scope of experimental authority.** Behavioral evidence may falsify an implementation, a prompt wording, or a proof claim. It may not select or replace the topology in items 1, 3, or 4; a topology change is presented to the owner with the observed strain and a proposed smallest mitigation.
8. **Source-to-production manifest.** The current-ancestry selected sources are the Ampcode (`A`) and Five-Register (`F`) drafts at `ca57b45729260cc657f89b718fc505997a4e1b3c:libs/@hashintel/brunch-agent/packages/core/_drafts/`, byte-identical on those trees to historical recovery commit `e087f570d77507c12a4862604a30c6fcd640aa2f`; the Gherkin paper instrument (`G`) is `A`'s `plugin-gherkin/` copied unchanged to `evaluations/protocols/gherkin-shape-c-paper-v1/instrument/`. Current-ancestry topology baseline: `baba973269ce7ecf1a47de8749c751033b2ce471`; the inlining repair is the one additional accepted production delta before campaign freeze. Proof item 1 is run against this table and the repair record; any other difference is a stop condition.

   | Production file | Source | Permitted delta |
   | --- | --- | --- |
   | `core/src/prompts/SYSTEM.md` | `A core/SYSTEM.md` | none |
   | `core/src/skills/elicitation/SKILL.md` | accepted capability wrapper plus `A core/universal-elicitation.md` | the universal file's reference-only heading and preamble are removed; its operative guidance is otherwise inlined unchanged after the accepted wrapper |
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
   | removed: core `plugin/`, `schema/`, `teaching/`, `interpretation/`, `testing/`, `prompts.ts`; both `plugin.yaml`; binding `useElicitation` | retired YAML/typed-plugin machinery | removal is part of the accepted implementation; last present on current ancestry at `f7f77544dab022be667f535ca73181ddc57535e0`, byte-identical on the named retired paths to historical `924be780ce6a5e7ebbbc0e43b72042ceb93c8387` |

## Imperative

Prove that the implemented core/plugin architecture is alive on the production Flue `ChatAgent` path: SDCPN work that needs human operational knowledge activates core's independently mounted `elicitation` capability before substantive questioning, required judgment is disclosed before reliance, and named construct-only and resolvable-review paths refrain from elicitation. Retain one exact full-run conversation/workpiece bundle as a downstream handoff candidate without promoting it to accepted workpiece, reusable fixture, database seed, or Petrinaut product evidence.

## Throughline

```text
accepted topology baseline at baba973269 + accepted universal-guidance inlining repair
→ production ChatAgent mounting and disclosure proof
→ canonical raw-history snapshot + mechanically derived ordered trace
→ persona-driven full conversation plus two cross-case activation probes
→ controlled resolvable-review and knowledge-gap-review checks
→ one exact conversation/workpiece/manifest handoff candidate
→ owner adjudication of the bounded proof-of-life claim
→ FE-1563 PR close report and successor handoff
```

The exercised production door is the persona harness's direct Flue client → long-running production `ChatAgent` → provider. This crosses the real agent, skill, tool, settlement, and conversation-storage boundary. It does not cross Petrinaut's `/api/chat` AI SDK adapter, browser `useChat`/`onToolCall`, live editor document, browser persistence, deployment replacement, or remote infrastructure boundary.

## Proof

This proof establishes bounded cross-case activation and restraint through the production agent and retains one attributable downstream candidate. It does not establish general reliability, full workpiece quality, the topology-neutral case portfolio, comparative superiority to Mission 3, fixture or seed validity, Petrinaut browser parity, deployment, or comprehensive mission-family closure.

1. **Topology and translation fidelity.** Production matches the architecture kernel and source manifest with only the permitted deltas. Oracle: exact protected-surface comparisons from [`mission-4-restacked-authority-sha-audit-2026-09-03.md`](docs/evidence/decisions/mission-4-restacked-authority-sha-audit-2026-09-03.md), rerun at freeze; `packages/core/test/architecture/boundaries.test.ts`; and the SDCPN, Gherkin, and Dafny skill packaging tests.
2. **Production mounting and disclosure.** The built `ChatAgent` presents the core prompt, SDCPN append, and a catalog containing `elicitation` and `sdcpn-modelling`; scripted activation exposes exact packaged resources. Oracle: `apps/brunch-agent/test/build-artifact.test.ts` and `apps/brunch-agent/test/petrinaut-chat.test.ts` driving the production `ChatAgent` integration without treating the test UI projection as campaign evidence.
3. **Canonical evidence mechanism.** Every proof run can retain the raw settled `history()` snapshot and a mechanically derived ordered trace of user turns, skill activations with names/outcomes, conditional resource reads, other tools/executors, and workpiece-bearing text. Construct-only results record activated skill names. Oracle: focused unit tests for trace derivation, raw snapshot writing, canonical event order, and the extended `runbook-headless` result, followed by inspection that each frozen run directory contains snapshot, transcript, trace, adjudication, manifest, and SHA-256 values.
4. **Interactive activation proof of life.** Per elicitor model, the frozen campaign obtains three valid 4a-gradable runs over three distinct current persona case families: one full 6–10-turn conversation that emits a recoverable workpiece and two probes that stop after the first Substantive text. All three must show successful `sdcpn-modelling` then `elicitation` activation and the conditional SDCPN profile read before the first Substantive text. Orientation may precede activation. Oracle: accepted [`mission-4-activation-and-restraint-ruler-v1.md`](evaluations/oracles/mission-4-activation-and-restraint-ruler-v1.md), canonical traces, quoted independent adjudication, and exact `3/3`; invalid or no-Substantive members remain separately visible and do not satisfy the floor.
5. **Controlled restraint and complement.** Construct-only execution does not activate elicitation; exact S3 resolvable review identifies the supplied target defect without elicitation; exact S4 knowledge-gap review activates elicitation and asks for the missing operational rule without inventing it. Oracle: the accepted ruler, extended `runbook-headless` test, and one retained canonical run each for the exact S3/S4 prompt strings and hashes recorded by the ruler. These controlled cues do not prove uncued review-routing robustness.
6. **Opening and resource restraint.** No interactive run's first Substantive text is a Battery; activated universal guidance and the conditional profile precede reliance; construction resources are absent from ordinary interviewing; if the full run emits a workpiece, the template read precedes the first workpiece text in canonical order in the same turn. Later-turn dosage is classified and reported but does not determine proof-of-life acceptance. Oracle: accepted ruler and retained trace/adjudication.
7. **Downstream handoff candidate.** The full run retains one recoverable Markdown workpiece beside its exact raw Flue conversation, trace, elicitor/persona model manifest, case identity, source/frozen commit, validity and adjudication records, and SHA-256 values. The manifest labels it `evaluation-run` and `handoff-candidate`, never accepted workpiece, reusable fixture, database seed, product conversation, or Petrinaut witness. Oracle: mechanical hash verification plus a check that every named file exists and the workpiece's recorded source message id resolves in the raw snapshot.
8. **Integrity and bounded close.** Core, binding, transport, three plugins, and app build/type/lint/unit checks pass at the frozen commit; Mission 3 evidence remains unchanged from current-ancestry close commit `4c11c7a6c4e1df26c9d76cec30e32af8f013042d`; the PR close report states the bounded claim, invalid members, candidate status, and every deferral; the mission receives external owner adjudication before archival. Oracle: focused Turbo checks, an empty diff over `libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1` from `4c11c7a6c4...` to the frozen commit, artifact inspection, and owner decision.

## Constraints

- The owner retains candidate text changes, instrument freeze, paid ceiling, proof adjudication, candidate promotion, and closure. These are external actions an agent waits for and records only afterwards.
- No production prompt, skill, resource, or topology edit occurs without a repair record naming observed failure, responsible disclosure layer, smallest change, and regression risk, followed by owner acceptance and one focused commit.
- The accepted ruler may falsify behavior but may not redefine topology or interaction policy. No question-count, sentence-count, punctuation-count, response-length, or packaged-topology proxy enters production text or acceptance.
- Persona infrastructure is not campaign authority. A protocol becomes authoritative only when exact case allocation, models, budgets, validity, retry/stop rules, retention layout, and hashes are frozen in a focused commit.
- No paid call occurs before a clean frozen instrument and an explicit owner ceiling and stop rule covering elicitor, persona, review checks, invalid replacements, and adjudication.
- Every admitted run receives a unique run id; invalid and failed members are retained; no user utterance is silently resent after admission.
- Canonical Flue history is evidence. Pi rendering, persona summaries, browser/debug projections, and evaluation-side tool details are corroboration only.
- The handoff candidate is not a fixture or seed. No Flue database rows, generated submission/incarnation ids, capture ids, browser principal/conversation mapping, or headless document state are copied and presented as authentic product state.
- Preserve the immutable Mission 3 campaign, its recorded source commit `b738aa1be1a62a9f9cdde89ced78558f04293a77`, and its ruler unchanged. The restacked patch-equivalent `57b8900a04c56aa9e0d833fcbab8d290ab9756eb` improves current-ancestry resolvability but never rewrites historical run provenance.
- Keep one model-facing agent, Flue-native `useInstruction`/`useSkill`/`useTool`, progressive disclosure, the `ChatAgent` door, and skill directories packaged through `defineSkill`. No loader, workflow engine, second elicitor, TUI, YAML plugin definition, or repertoire runtime.
- Construction stays outside ordinary elicitation. The real-headless client host is an in-memory Petrinaut-core callback executor, not browser execution, product persistence, or parity proof.
- Read-only audits may run in parallel; no concurrent writers in the shared worktree.

## Fog-line

Do not design past these until the frozen proof or a successor owner settles them:

- Whether the selected Sonnet 4.6 elicitor, GPT-5.6 medium-thinking persona, and Opus 4.6 high-thinking adjudicator resolve under their exact requested provider ids in the unsandboxed restricted runners, and the resulting normal/worst-case currency estimate.
- Whether simulator refusal can be bounded by a content-neutral retry rule without biasing valid members; the protocol must diagnose and pre-register its handling before paid execution.
- Whether the accepted independent activation succeeds `3/3`; any miss is strain to adjudicate, not permission to switch topology.
- Whether the full conversation emits a recoverable candidate within its selected 6–10-turn budget and what limitations remain visible in that workpiece.
- Whether that candidate is eligible for Mission 5 promotion after proof of life; Mission 4 records no semantic-quality acceptance.
- Whether direct-Flue persona evidence can later be promoted into a deterministic fixture or product/database seed without fabricating identity, settlement, tool-execution, capture, or browser-document provenance.
- Which topology-neutral cases become load-bearing in the successor addendum, Mission 5 provenance work, Mission 6 projection, Mission 7 revision, or a later readiness sweep.

## Stop or reorient

Stop and surface the evidence if:

- the raw snapshot and derived trace disagree, required ordering cannot be mechanically recovered, or a retained artifact cannot be bound by hash to its source run;
- any of the three valid interactive members fails activation or required-read ordering, or the exact S3/S4/construct-only checks violate their expected activation boundary;
- a first Substantive text is an opening Battery, the conditional profile is missing or late, or a template/construction resource is used before its accepted branch;
- simulator, provider, transport, or client-tool invalidity is counted as a behavioral pass/fail, silently replaced, or rerun under the same id;
- an oracle or repair changes topology or introduces a stricter interaction rule without a separate owner decision;
- a candidate run touches the immutable Mission 3 control or historical run records;
- the direct Flue path is described as `/api/chat`, Petrinaut browser execution, populated product state, deployment, or remote proof;
- the handoff candidate is called accepted, fixture-ready, seeded, or product-authentic without the successor promotion contract;
- paid execution begins without a clean freeze and explicit owner ceiling;
- closure is recorded before external owner adjudication of the bounded proof-of-life claim.

## Deferred

A separate issue, branch, PR, and mission authority will own the Mission 4 close-out addendum: broader reliability/hardening if warranted; Petrinaut `/api/chat` and browser parity; fixture/seed promotion contracts; topology-neutral case allocation; contract/readiness sweeps; authority/archive cleanup; and reconciliation with the landed but not remotely proved Mission 8 application contract. Gate A remains proposed input, not an accepted whole-suite obligation.

Mission 5 may be cut in parallel from the proof-of-life base and later restacked onto the addendum if it consumes addendum contracts. It may inspect the retained handoff candidate immediately, but must establish and owner-gate the minimum workpiece eligibility, identity mapping, capture provenance, and fixture/seed promotion it actually consumes; it may not inherit those claims from Mission 4.

Mission 6 owns automatic traceable projection into one meaningful live SDCPN region. Mission 7 owns bounded authorized reviewer revision and scoped net patching. Mission 8's existing deployment branch stopped after local application proof and still lacks remote infrastructure proof. Mission 9 owns the optimisation handoff after its consumer contract exists. Broad observer, compaction, voice, structured-question, remote-release, Gherkin/Dafny production-route, and complete topology-neutral regression work remain future planning rather than FE-1563 authority.
