# Follow-up review of provenance-by-lineage replanning — 2026-09-04

> Review evidence, not execution authority. This document evaluates the revised [`provenance-and-tooling-decision-log-2026-09-04.md`](provenance-and-tooling-decision-log-2026-09-04.md) and [`provenance-by-lineage-mini-spec-2026-09-04.md`](provenance-by-lineage-mini-spec-2026-09-04.md) after dispositions F1–F16. It focuses on gaps that remain after the first [`independent review`](provenance-by-lineage-independent-review-2026-09-04.md), using checked-out code, installed Flue 2.0.3 documentation, the canonical future-planning record, and three additional adversarial reviews. It changes no owner-settled policy and authorizes no implementation.

## Executive verdict

The revised design is materially stronger. First-class workpiece revisions, constructor-declared mutation basis, canonical mutation transition records, explicit refusal under incomplete lineage, schema-carrier repair before construction breadth, and a genuine production-path fixture are sound directions. The revision correctly stopped treating temporal adjacency alone as causal provenance.

The design is not ready to become Mission 7 authority. Two concrete Flue contradictions make the depicted update-and-mutate path unreliable, and several remaining semantic gaps permit complete-looking lineage to overstate what the records establish. Strategically, the consolidated mission cannot defer readiness closure for its own visible claim, and the required probes currently have neither result-conditioned stop branches nor an unambiguous execution-authority home.

The most important correction is to treat the design as four distinct contracts:

1. **Revision protocol:** a workpiece revision settles and becomes addressable before a mutation can cite it.
2. **Provenance semantics:** mutation basis, passage evidence, element origin, current-state history, and actor identity are distinct relations.
3. **Document reconciliation:** the current live Petrinaut state is compared with recorded transitions before provenance is reported.
4. **Mission readiness:** M7 closes the safety and utility obligations required by its own construction-and-explanation claim; only breadth first made load-bearing by the following visible advance moves later.

## Critical factual and semantic gaps

### 1. The depicted mixed tool batch will not reliably produce the browser handoff

The mini spec depicts `update_workpiece` and a Petrinaut mutation as sibling calls in one assistant turn, followed by a separate `client-tool-result` submission:

```text
assistant turn T1
  ├─ update_workpiece {markdown}
  └─ addArc {…, basis}
submission S2
  system dispatch client-tool-result
```

The current Petrinaut client tools return `{ awaiting: "client" }` with `terminate: true` in [`packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts). The proposed `update_workpiece` specifies `durable: true` but does not specify termination. Flue 2.0.3 documents that a multi-tool batch ends the turn only when every result terminates. A non-terminating workpiece result alongside a terminating browser tool therefore does not guarantee the depicted handoff.

**Required correction:** prohibit the mixed batch or define termination behavior that preserves the browser handoff. The safer contract is a completed workpiece update followed by mutation in a later render.

### 2. “Revision current at the request” is undefined when update and mutation are sibling calls

The mini spec says the mutation basis locates passages in “the workpiece revision current at the request,” while the topology makes the update and mutation siblings. Flue runs calls in one batch in parallel; persistent-state reads are render-time snapshots, writes do not cause a mid-run re-render, and the writes commit with the batch. Assistant-part order is therefore not a dependable state order.

The mutation cannot reliably regard the sibling `update_workpiece` as current, and a model cannot name the new update call’s generated call ID before the call settles.

**Required protocol:**

```text
update_workpiece settles
→ next render exposes revisionId and sha256
→ mutation request explicitly names that revisionId and sha256
→ browser mutation executes
```

A mutation must cite an already-settled revision explicitly; “latest” or sibling order is insufficient.

### 3. Declared basis repairs mutation → passage, but passage → evidence remains temporal

F5 adds the missing mutation-to-passage declaration. The next hop still resolves a passage to “turns between it and the previous revision.” That range does not establish the evidence for a passage that:

- survives unchanged from an older revision;
- synthesizes several non-adjacent ranges;
- reuses earlier evidence;
- incorporates a correction or qualification;
- records constructor inference, a default, an external source, or a formalism constraint.

The design can honestly call this range **conversation context temporally associated with the revision**. It cannot call the range support for the passage without another relation.

**Required decision:** either add the least revision-time passage-to-evidence relation, including multiple and inherited ranges, or consistently label this hop as temporal context rather than evidence or support. The adversarial tracer should include a carried-forward passage, non-adjacent evidence, a correction, and multi-source synthesis.

### 4. Current-state provenance cannot be checked from history alone

The adversarial tracer includes one hand edit, and the visible operation asks why an element in the current net exists. A transition history can establish the last reconciled recorded state, but a hand edit after the last recorded mutation leaves no Flue record. The server-side why resolver therefore cannot discover that the current element differs from its last attributable state unless it obtains a fresh observation from the browser.

**Required decision:** every why query either:

- acquires and reconciles the live document identity and hash before answering; or
- says explicitly that the answer is “as of the last reconciled recorded state.”

Without this, a hand-edited element can receive stale but apparently authoritative provenance.

### 5. Per-conversation workpiece state does not settle target-document ownership

`usePersistentState` is per conversation. The current workpiece and mutation lineage concern a Petrinaut target document, which may be reopened, copied, reviewed from another conversation, or targeted by more than one conversation owned by the same principal. The design does not define the binding among conversation identity/incarnation, document identity/incarnation, and current workpiece revision.

The repository’s [`Flue routing guidance`](../../reference/architecture/flue-routing.md) explicitly distinguishes per-conversation state from cross-conversation target-document state.

**Required decision:** either constrain M7 to an immutable one-conversation ↔ one-document-incarnation binding or place shared current-workpiece and lineage indexes behind a document-scoped durable owner. A single-principal limit does not solve multiple conversations owned by that principal.

### 6. “Who did what” has no implementable identity source

The mini spec promises separate workpiece author, evidence actor, requesting principal, and mutation actor. The proposed records do not contain trusted values for those identities:

- workpiece state contains call ID, hash, revision, and Markdown;
- the transition record contains document/hash/outcome/effects;
- the current client-result envelope contains call ID, tool name, and output;
- Flue message roles are not human identity, and agent-authored metadata is not authenticated identity.

F11’s single-principal limitation narrows authorization but does not establish who spoke quoted material or which human or browser actor applied a mutation.

**Required correction:** define the trusted source and persistence rule for each actor field, including restored fixtures, or narrow the release wording to recorded roles such as “assistant tool call” and “local browser executor,” with human identity explicitly unknown.

### 7. “When” currently means stream order, not wall-clock time

The intent defines lineage as who changed what, in response to what, when. The supported Flue snapshot and Brunch history projection provide canonical message order, message IDs, submission IDs, and optional turn IDs, but no authenticated operation timestamp.

**Required correction:** say **in what canonical stream order** unless a trusted timestamp source is added to retained revision and transition records.

## Provenance quality and Goodhart risks

### 8. Declared basis can become circular provenance laundering

The constructor authors both the workpiece and the basis relation. Under the current wording it may decide on a mutation, write a convenient Construction note, cite that note as the mutation’s basis, and present the cycle as provenance. A locator plus one-line rationale proves that the constructor asserted a relation; it does not prove relevance, compatibility, or evidentiary support.

The escape saying a mutation without basis may be justified in Construction notes compounds the problem.

**Minimum correction:**

```text
basis =
  | declared { revisionId, locators, rationale, scope }
  | absent { reason }
```

Additionally:

- the cited revision must already have settled;
- Construction notes are not a substitute for absent basis;
- the answer visibly labels the relation **constructor-declared**;
- the output distinguishes elicited evidence, constructor inference, default, formalism constraint, external source, and construction rationale;
- basis quality is graded for relevance, contradiction, granularity, and omitted dependencies, not only presence and readability.

### 9. Request-level basis does not establish element-level basis

One mutation can affect several explicit or derived elements, while the request carries one undifferentiated set of locators. Assigning every locator to every actual effect overstates provenance for batches, cascaded deletes, layout, generated entities, and unexpected side effects.

**Required correction:** either carry an intended-effect-to-locator mapping or label the relation as **operation-level basis** only. An actual effect without a specific mapping is basis-absent or unanticipated; it does not inherit all request locators.

### 10. Origin, current state, change history, and attempt history are conflated

The resolver privileges the creating request, but after corrections the creation basis may explain an obsolete definition rather than the current element. Delete-and-recreate is more dangerous if an ID is reused.

Define separate query semantics:

- **origin:** basis for the identity epoch’s creation;
- **current state:** applied transitions whose effects compose the present definition;
- **change history:** all applied changes and corrections;
- **attempt history:** failed, no-op, stale, and unknown requests, never treated as causes.

Element IDs must not be silently reused across identity epochs.

### 11. The transition record permits unverifiable self-report

The current proposal accepts affected element IDs **or** retained pre/post definitions. The first option lets the browser self-report a favorable affected set without enough evidence to prove that it accounts for the canonical document diff. An expected base hash can also merely echo the request rather than prove which base the browser observed.

The outcome shape is internally strained as well: an `unknown` outcome cannot always have a confirmed post hash.

**Safer minimum:**

- requested base hash;
- independently observed pre-apply hash;
- canonical post-apply observation when available;
- mechanically derived, disjoint `created`, `updated`, `deleted`, and `derived` sets;
- verification that those effects account for the canonical document diff;
- conflicting duplicate outcomes resolve to `unknown`, never winner-by-arrival;
- failed, no-op, stale, and unknown calls contribute only attempt history.

### 12. External import can wash away unexplained provenance

The design permits provenance to resume after an explicit external revision is imported. A permissive import could make an unexplained current state the new clean baseline, erasing which elements or fields remain externally sourced.

**Required correction:** an external revision records actor or unknown actor, principal, observed parent hash, canonical diff, and import reason. Every imported changed element or field retains an `external/unsupported` disposition until a later recorded transition replaces it. Import resets continuity; it does not explain imported content retrospectively.

### 13. Passage identity is partly policy, not terrain discoverable by probe

A probe can test whether a locator remains syntactically usable. It cannot decide whether a paraphrase preserves identity. Split, merge, deletion, and reintroduction require explicit lineage policy. An anchor can mechanically survive while denoting materially different meaning, and a whole-section locator can make every basis superficially stable.

Predeclare the invariants:

- passage IDs are never reused after deletion;
- split and merge record predecessor and successor sets;
- ambiguous paraphrase refuses continuity;
- reintroduction starts a new identity unless continuity is explicitly declared;
- a locator resolves to an immutable revision-local span;
- duplicate headings and quotations are tested;
- an overbroad span fails basis quality when a materially narrower sufficient span exists.

If these semantics are too expensive, retain revision-local passage text and refuse cross-revision “introduced by” claims as F6 permits.

### 14. A genuine fixture can still be unrepresentative or accepted off-path

A synthetic persona can produce a genuine production-agent run with short, unique wording that makes provenance trivial. That proves the path, not performance on messy human conversation. Acceptance can also drift toward inspecting retained `snapshot.json` projections rather than exercising the reopened authorized product query.

**Required correction:**

- label sources as synthetic-persona, internal-human, or customer-derived;
- run acceptance assertions through the same reopened authorized why operation used by the product;
- treat snapshots and projections as diagnostics only;
- include duplicate wording, rejected quotations, constructor inference, correction, and unrelated context in at least one adversarial fixture.

### 15. The consequential inventory can be gamed after generation

Freezing the element inventory before grading still permits defining “consequential” after inspecting the generated artifact. Parameters, scenarios, type elements, arc attributes, expressions, document-level settings, derived entities, and deleted/recreated identity epochs can be excluded by a favorable rule.

**Required correction:** freeze the consequential rule before the run, generate the inventory mechanically from the final canonical document, include every identity-bearing or behavior-affecting entity or field required by the selected claim, and assign exactly one disposition to every inventory item. Publish numerator, denominator, and exclusions.

### 16. Refusal safety can satisfy the contract while destroying utility

“Deterministic answer or explicit refusal” is a safety contract. An implementation that refuses every difficult query can satisfy the literal wording while providing no reviewer value. Basis absence has no threshold, and “judged by a human” has no fixed task or rubric.

Separate two gates:

1. **Safety:** no false attribution; required refusals are correct.
2. **Utility:** a predeclared nonzero proportion of consequential elements yields usable current-state answers, with minimum coverage across selected entity classes.

Use a blinded reviewer task and a fixed rubric: can the reviewer identify the governing passage, distinguish elicited evidence from constructor inference, understand the current definition and latest correction, and decide whether the answer changes their review judgment?

## Tool-admission factual gaps

### 17. The subset is scenario-selected, not mechanically derived from scenario requirements

Petrinaut schemas can be mechanically sourced from the canonical AI bundle. The choice of entity classes from natural-language cases is interpretive. The mini spec should say **scenario-selected operations with canonically derived schemas**, not that admission itself is mechanically generated.

Two concrete discrepancies remain:

- F13 lists add/update/remove for type elements, while the mini spec additionally admits “move element.”
- F13 says Vestera names metrics, but the Vestera case and oracle describe scheduling objectives and prohibit invented numerical objective weights; they do not clearly require Petrinaut executable `Metric` entities. A natural-language objective does not mechanically entail the formalism’s metric class.

Remove unearned classes or cite the exact case requirement and Petrinaut operation each class discharges. Tool breadth should follow the selected mission scenario and observed need, even if the later persona programme spans six cases.

## Strategic mission and planning gaps

### 18. M7 cannot defer readiness closure for its own visible claim

F12 says construction and explanation ship together while the following mission takes projection breadth, repeat and changed-input behavior, and readiness closure. This conflicts with [`AGENTS.md`](../../../AGENTS.md): the mission making a visible claim performs its readiness decision and closes the obligations required to trust that claim. A provisional line cannot silently become the following mission’s hardened departure base.

The consolidated M7 also contains two product-manager-visible advances: the workpiece pane is called an advance in its own right, while construction-and-explanation is the mission release.

**Required decision:** name M7’s exact contract stratum and close every identity, failure, durability, basis-quality, current-state, and oracle obligation required for its construction-and-explanation claim. Move only breadth first made load-bearing by the following visible advance into M9.

### 19. The probe sequence lacks result-conditioned stop and reorientation branches

The mini spec lists compaction, relocation, passage identity, carrier repair, revision cadence, basis quality, reviewer usefulness, and token-cost probes, but F16 orders them and then proceeds toward recutting and the persona campaign. It does not say what each negative result changes.

Before cutting authority, give every probe a decision table:

| Result | Consequence |
| --- | --- |
| Pass | Continue under the named claim |
| Partial | Narrow the claim or change the mechanism |
| Fail | Stop the cut or split predecessor work |
| Re-entry | Evidence required to reopen the rejected route |

At minimum:

- persistent unusable basis or reviewer-useless why answers stop the explainability claim;
- no supported relocation blocks the retained-live-fixture route and forces an explicitly labelled alternative;
- no passage-continuity policy narrows the release to revision-local text;
- carrier failure produces a crisp upstream blocker rather than a local schema copy;
- sparse revision cadence changes the blame claim or update interaction before persona breadth.

### 20. F16’s executable probes have no unambiguous authority home

F16 places probes before mission topology is recut, while the mini spec calls the adversarial tracer the first act inside the consolidated mission. Under the one-live-mission rule, executable probes still need authority.

Choose explicitly among:

- a bounded owner-authorized side quest under M6;
- a separate probe mission;
- an initially narrow M7 authority with an owner gate before amendment into construction breadth.

Do not leave implementation-relevant probes in design evidence with no lawful execution home.

### 21. The canonical future record still embodies the superseded topology

The current planning record still says:

- M7 is capture-backed review over a prepared pair;
- M9 is where automatic projection begins;
- Draft M7 requires a hand-authored derivation fixture;
- Draft M9 inherits a Mission 7 prebuilt pair and retains the obsolete same-turn client-result wording;
- Draft M10 still depends on the old capture/derivation seam.

F15’s migration matrix concerns runtime and persisted-data compatibility. A separate **planning-content migration matrix** is needed to satisfy the one-authoritative-home and no-silent-loss rules.

Before promotion, map every old hypothesis, accepted decision, rejected alternative, oracle gap, deferred item, and readiness obligation to exactly one surviving destination. Then update `MISSION.next.md` and drafts atomically, remove consumed drafts under the lifecycle rules, and compare before/after planning content for unexplained loss or duplication.

### 22. Existing archival machinery is conflated with the rejected capture semantics

The decision documents often speak of the capture store as though re-entry means reviving one-envelope-per-user semantic capture. The current binding already archives materialized Flue history through [`packages/binding-flue/src/history-reader.ts`](../../../packages/binding-flue/src/history-reader.ts) and the capture storage contract’s session-log archive. If the compaction probe is negative, the least response may be to harden or reposition that existing archive lane rather than revive sweep envelopes or invent a third log.

The recut should distinguish:

- capture envelopes and sweep semantics, which are rejected for M7 provenance;
- the existing session-log archive capability;
- any new immutable lineage projection actually required by compaction, relocation, or authorization.

### 23. Mission 11 still has a circular readiness statement

Draft M11 says the first accepted handoff is also the completion bar because consumer acceptance is the readiness decision, then says lateral package, transfer, execution, result, credibility, repeatability, access, and retention obligations are enumerated after the handoff works.

Distinguish:

1. consumer contract acceptance;
2. working handoff throughline;
3. post-throughline readiness closure sufficient to begin the experiment without reconstruction.

Consumer enthusiasm or artifact receipt is not the same as an executable witnessed experiment start.

## Recommended decision sequence before cutting Mission 7

1. **Correct the Flue protocol.** Require a settled `update_workpiece` revision before mutation; prohibit ambiguous mixed batching and bind every mutation to an explicit revision ID and hash.
2. **Settle document ownership and reconciliation.** Define conversation ↔ document-incarnation binding, observed pre-state, current-state checks for why queries, and external-import continuity.
3. **Separate provenance relations.** Distinguish operation basis, element basis, passage evidence, origin, current-state changes, attempts, and actor roles or identities.
4. **Define passage identity policy.** State invariants and refusal cases before using edit probes to test ergonomics and model compliance.
5. **Make effects independently verifiable.** Derive canonical effects from observed pre/post state and fail conflicting or unknown outcomes closed.
6. **Narrow tool admission.** Select classes from the actual proving scenario, mechanically source their schemas from Petrinaut, and remove metrics or movement operations unless exact case evidence earns them.
7. **Freeze safety and utility gates.** Predeclare the consequential rule, mechanical inventory, required dispositions, minimum useful coverage, reviewer task, and behavioral discriminator.
8. **Attach stop branches and authority to probes.** Decide where executable probes live and what each result permits, reshapes, or stops.
9. **Define M7’s own readiness stratum.** Do not defer trustworthiness of the construction-and-explanation release to M9.
10. **Perform a lossless planning migration.** Recut `MISSION.next.md` and drafts 7/9/10/11 only after the observed probe results, with one surviving home for every obligation.

## Evidence consulted

- [`provenance-and-tooling-decision-log-2026-09-04.md`](provenance-and-tooling-decision-log-2026-09-04.md)
- [`provenance-by-lineage-mini-spec-2026-09-04.md`](provenance-by-lineage-mini-spec-2026-09-04.md)
- [`provenance-by-lineage-independent-review-2026-09-04.md`](provenance-by-lineage-independent-review-2026-09-04.md)
- [`../../../AGENTS.md`](../../../AGENTS.md)
- [`../../../MISSION.next.md`](../../../MISSION.next.md)
- [`../../mission-drafts/7-capture-backed-review.md`](../../mission-drafts/7-capture-backed-review.md)
- [`../../mission-drafts/9-traceable-projection.md`](../../mission-drafts/9-traceable-projection.md)
- [`../../mission-drafts/10-bounded-reviewer-revision.md`](../../mission-drafts/10-bounded-reviewer-revision.md)
- [`../../mission-drafts/11-optimisation-handoff.md`](../../mission-drafts/11-optimisation-handoff.md)
- [`../../reference/architecture/flue-routing.md`](../../reference/architecture/flue-routing.md)
- [`../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts)
- [`../../../packages/core/src/workpiece.ts`](../../../packages/core/src/workpiece.ts)
- [`../../../packages/core/src/evidence/capture-store.ts`](../../../packages/core/src/evidence/capture-store.ts)
- [`../../../packages/binding-flue/src/history-reader.ts`](../../../packages/binding-flue/src/history-reader.ts)
- [`../../../packages/transport-aisdk/src/client-tool-history.ts`](../../../packages/transport-aisdk/src/client-tool-history.ts)
- [`../../../../../../apps/brunch-agent/src/conversation/identity.ts`](../../../../../../apps/brunch-agent/src/conversation/identity.ts)
- [`../../../../../../apps/brunch-agent/src/http/ownership.ts`](../../../../../../apps/brunch-agent/src/http/ownership.ts)
- installed Flue 2.0.3 documentation under `node_modules/@flue/runtime/docs/reference/`, especially `agent-api.md`, `agent-behavior.md`, `agent-hooks-api.md`, and `streaming-protocol.md`
- Vestera case and oracle under `evaluations/cases/vestera-scheduling/` and `evaluations/oracles/vestera-scheduling/`
- Petrinaut metric schema under `libs/@hashintel/petrinaut-core/src/schemas/metric-schema.ts`

## Review disposition

Do not discard the lineage design. Its useful core is a visible revisioned workpiece, constructor-declared relations, and verifiable document transitions over a real production conversation. Before mission authority is cut, make revision ordering explicit, separate declaration from evidence, reconcile against current document state, and define M7’s own safety and utility readiness gates. The next design move should remove ambiguity from the protocol and claim, not add a broader provenance platform.
