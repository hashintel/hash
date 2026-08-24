# Cross-ticket consistency pre-pass — Elicitation Kernel map

> Prep asset for [Assemble the spec](../issues/08-assemble-the-spec.md). Produced 2026-08-10 by a full read of `map.md`, `CONTEXT.md`, tickets 01–12, and §9 of the criteria inbox doc, at commit `0dc71e2` (plus the second-target rename decision, folded in). The assembler should treat this as the working checklist alongside the map.

**Rename incorporated:** the second target is the **assurance argument**, package `plugin-assurance`. That closes what would otherwise have been the sharpest contradiction in the set (_Formal-verification canon survey_ (09) §5.4 called "proof obligations" a category error, and _Shipping shape_ (06) then froze the flagged name into the topology a day later). Two follow-through notes for the assembler, not flagged as inconsistencies: _zil-lean survey_ (02) and _Dev-target portfolio confirmation_ (07) still say `elicit-proof-obligations` in body text, and 09's own three rename candidates ("obligation ledger / claim structure / assurance argument") should now read as a settled choice.

---

## 1. CONTRADICTIONS — the assembler must pick a side

**C1. Who implements the storage port: the host app, the binding, or the substrate?**

- _Shipping shape: kernel library vs. Flue agent_ (06), §Root and §Package topology: "every host authors its own thin `'use agent'` module, `app.ts` mount, and **storage adapter**"; "The dev app owns the `'use agent'` module, `app.ts`, `db.ts`, and the Vite build"; remote-parity constraint "**host-owned storage port**".
- _Multi-session elicitation & durable target state_ (12), §The storage flip: "The **storage port is harness-defined and binding-implemented**."
- Ticket 12's comment on 06 claims this "aligns with (and sharpens)" the host-owned constraint. It does not — it moves the implementation from the host application into `packages/flue`. **12 is later and authoritative on ownership**, but the spec must state the reconciliation explicitly, and the cleanest one available is: Flue's `db.ts` (substrate _conversation_ storage) stays host-authored because Flue requires it, while the harness's _capture store_ is the storage port, implemented in the binding. No ticket says this. Note also that 04's ownership table still assigns "storage port implementation" to the Host row — pre-split and pre-flip.

**C2. Are plugin operations pure over a snapshot, or can plugin code reach storage?**

- 04, §Operations: "plugin ops receive an **immutable state snapshot**, return observations/issues/deltas; the kernel validates and applies." _Logic-prototype: capture sweep & settlement_ (11) leans on exactly this to justify "op cadence is orchestration policy, not correctness — snapshot-in/deltas-out purity means the harness may run them at any time without changing outcomes."
- 12, §The storage flip: "if storage is addressable from plugin code at all, it is only through **harness-defined methods passed via the injected PluginContext**."
- If `project`/`validate`/`reconcile` can call storage methods, snapshot purity is gone and 11's cadence-as-policy result collapses. **Authoritative read: 04 + 11 win for the four operations** — they must stay pure — and 12's clause must be scoped to _non-op_ plugin code, or dropped. The spec has to say which, because "op cadence is free" is load-bearing for the harness's orchestration latitude.

**C3. Capture `status` — stored field or derived at read time?**

- 04, §The capture envelope: the envelope carries "status: `active | superseded | retracted`" as a field.
- 11, §5: "the winning capture keeps its original epistemic status while authority sits in the record, suggesting per-capture status be **derived at read time**." 12, §6 then treats "derived capture status" as settled fact.
- **12 is authoritative**: status is not a stored field. This is the load-bearing half of the derived-status chain and it changes the envelope schema in 04 that everything else quotes. Related unrecorded item: no ticket says how a capture becomes `retracted` — supersession and resolution records are specified, retraction is not.

**C4. Explicit-versus-inferred absence is unachievable over the proven transport.**

- 11, §3: "a dodge reads back as `declined (inferred)`, a strip tap as `deferred (explicit)`."
- _Walking skeleton: Flue question round-trip_ (10), §3: every reply arrived as a bare string — "typed text, choice-button labels, **absence taps**, a mid-stream redirect" — and _Questioning-UX contract_ (05) fixes inbound as string-only with "answer typing/validation happens entirely harness-side on read-back."
- A bare string cannot distinguish a one-tap `not-applicable` from a user typing "doesn't apply", so the harness cannot honestly assign `explicit` to a tap. Neither ticket noticed. The spec must either give the ui a canonical reply encoding for affordance taps (making tap-ness a transport fact) or accept that all absences are `inferred`. **10's transport finding is the physical constraint and wins**; 11's `deferred (explicit)` currently lacks a mechanism.

**C5. "Only true user entries are citable evidence" versus kernel invariant 1.**

- 12, §5: "Capture evidence spans anchor only on true user (and user-affordance-payload) entries."
- The ten kernel invariants that 04 adopts verbatim as spec acceptance material state (criteria doc §9, invariant 1): "Every projected value must point to a claim, a **declared default**, or a **documented transformation**." And 04's own epistemic-status enum includes `defaulted` and `external-lookup` — captures with no user utterance behind them.
- **Genuinely inconsistent as written.** 12 is later, but invariant 1 is the more carefully drafted rule: the reconciliation is that user-derived captures cite user entries only, while `defaulted` / `external-lookup` captures cite a declared default or a documented transformation instead. The spec must say that, or drop `defaulted`/`external-lookup` from the enum.

**C6. One channel multiplexing all affordance forms versus one live affordance slot.**

- 05, §3: "**One harness data channel** multiplexing all affordance forms"; §4 makes the interpretation render one of those forms.
- 10, verdict 1: writes to one channel name "materialize _last-write-wins per assistant message_", so the channel is a "current affordance" surface and per-ask identity and payload must ride the ask tool's `output` part. The invariant 10 derives covers only "**reject a second ask** in the same batch."
- An ask plus an interpretation render in one batch still clobber each other, and nothing forbids it. **10 is authoritative on the mechanism**; the spec must say where non-ask affordances (interpretation render, choice strip) ride, and whether the one-live-affordance rule is per-message or per-affordance-kind.

**C7. The wake wart's fix removes the reason no echo token is needed.** Both statements sit inside ticket 10.

- Verdict 3: "the agent bound every one to the correct `exchangeId` **because the pending question (with its id) is interpolated into the instructions** from `usePersistentState`" — that is the entire basis for "echo token: NOT NEEDED."
- Verdict 4 offers as a spec option: "**don't interpolate the pending question into instructions** (keep it in state only, or narrate it inside the ask tool's result)."
- Taking that option costs the binding mechanism that made the echo token unnecessary. The spec must pick the wake-wart remedy and the reply-binding mechanism **together**: interpolate and eat one wasted model call per ask, or stop interpolating and reinstate an explicit binding (narrate the pending id in the ask tool result, or restore the echo token).

---

## 2. STALE STATEMENTS — superseded, and misleading if read alone

**S1. The classification table in _Brunch exchange-schema audit_ (03) §2 has four rows that 05 overturned.** The table looks authoritative and was never edited. 05's "Audit lessons demoted by the reframe" and "Brunch disposition" sections demote: _declared continuations / non-forgeability_ (03 calls it "the single most transferable idea") to a covered-by-`epistemic_status: inferred` non-issue; _recovery scan / pending-present resumption_ (03: "Any interviewer needs this") to nothing, since there is no pending-exchange concept; _self-contained terminals_ to "patterns at most"; and the _`exchange_id` + `tool_meta` chain_ generalization, since the exchange-pair ontology stays behind entirely. Anyone mining 03's table for the spec will re-import all four.

**S2. Ticket 10's own vocabulary violates `CONTEXT.md`.** The proven mechanism names the channel `data-exchange` and the affordance identity `exchangeId`; `CONTEXT.md`'s **Affordance** entry lists "_Avoid_: exchange, exchange pair, terminal". Those names need renaming as the prototype is lifted, and the spec needs a term for affordance identity that isn't `exchangeId`.

**S3. Ticket 10 line 39 invokes the flipped hypothesis.** "Restart durability untested by design… consistent with the **deploy-target-owns-persistence hypothesis**." The map and 06 carry 12's flip; 10 does not.

**S4. `epistemicStatus: stated` (10, verdicts 3 and 4) is not a legal value.** 04's enum is `explicit | inferred | tentative | defaulted | external-lookup`. 11 uses the legal values. Ticket 10's prototype vocabulary drifted; the spec must pin one enum.

**S5. Ticket 04's "Host" row now splits three ways, not two.** The 2026-08-07 comment on 04 maps "Host" onto substrate + ui, but predates _Binding_ (introduced by 06) and the storage flip (12). Under the current model: input surfaces and identity → **ui**; deploy target, model/provider, artifact delivery → **substrate**; storage port implementation → **binding**.

**S6. Ticket 04's Plugin row "artifact persistence _shape_"** reads as plugin involvement in persistence, which 12 makes plugin-blind. The surviving legitimate meaning is "the plugin declares its payload/output shape" — say that instead.

**S7. Ticket 04 lists "the private scratchpad" as kernel-owned.** 05 demotes it to "pattern guidance for the spec", and 12 fixes per-session state as "**exactly three things**: the evidence log, the swept high-water mark, the pending-affordance slot" — no scratchpad. **12 is authoritative**, so the scratchpad is not harness session state; the spec should either drop it or say where it lives (Flue's `harness.prompt` private scratch conversation, per _Flue architecture deep-read_ (01), is the natural home and is a different thing from brunch's scratchpad).

**S8. The PROVED/CONDITIONAL/WEAK/BROKEN ladder is demoted from headline to derived label.** 02 §3 makes it the completion-criteria ladder and 07 adopts it as load-bearing vocabulary; 09 §5.1 rules that "the four-rung ladder is not canon; the audit list is… make the per-claim status a derived UI label, and make the **assumption ledger** the headline artifact," shipped as a Markdown table. 09 is the grounding ticket and wins.

**S9. Ticket 07's "Geolog (ARIA program, axioms addressed via Datalog-like queries) is plausibly adjacent" is refuted.** 09 §4 is an explicit negative result: no ARIA artifact named Geolog exists; Geolog is a coherent-logic language, and _that_ lineage (Datalog as the ∃-free, ⋁-free fragment of coherent-logic saturation) is the citable one. "Do not build on a claim that ARIA ships something called Geolog."

**S10. Ticket 02's ElicitationPack sketch is superseded by 09's contract sketch.** 02 proposes five kinds (`assumption`/`invariant`/`proposition-theorem`/`guarantee`/`constraint`) with per-item `source_span` and `paraphrase_confirmed: bool`; 09 replaces this with one `Statement` record + a ten-value `kind` discriminant + four edge kinds + five status strata. Two further reasons 02's version is stale: `source_span` duplicates the harness's evidence spans inside the plugin payload (the "hidden target leakage" smell 04 adopted as review vocabulary), and `paraphrase_confirmed` is a per-item confirmation gate — exactly the machinery 05 retired and the write-gating 12 forbids.

**S11. Ticket 06's title still says "kernel library"** while its body ratifies "**harness library**". Minor, but the title is what a skim reads.

**S12. `useElicitationKernel(plugin)`** (01 §5 recommendation, echoed in the map's 01 line) versus **`useElicitation(plugin)`** (06 §Root). 06 is later; fixed in the map 2026-08-10.

**S13. The map's lexicon line for _issue_** — "typed backpressure from projection/validation to the elicitation controller" — predates 11's two-validation-strata amendment, which gives the harness its own issue and advisory production (same-evidence duplicate actives, generic `possibly-equivalent`). Issues now have two producers. Fixed in the map 2026-08-10.

**S14. The ten kernel invariants are written in the criteria doc's vocabulary, not ours.** They say "claim" (we say **capture**), "core" (we say **harness**), and invariant 6 says "**target** issues are namespaced" (pre-split — should read target-domain / plugin-namespaced). The spec must restate them in current envelope vocabulary rather than quote them, or two vocabularies will coexist inside the acceptance criteria.

---

## 3. LOOSE ENDS

### 3a. Referenced as settled, never actually recorded

**L1. Settlement-trigger wiring is claimed as proven by a ticket that never mentions it.** Ticket 11 §1 says settlement decomposes into trigger and judgment, with "wiring proof **delegated to ticket 10**", and the map's ticket-11 line upgrades this to "lifecycle-event wiring **proven in ticket 10**". _Ticket 10 contains no settlement, lifecycle-event, or `useAgentFinish`/`useResponseFinish` finding at all._ The substrate lifecycle event that triggers the agent's settlement judgment is unproven and unspecified. This is the most consequential gap found.

**L2. Nothing establishes that the harness can read the substrate's session log — which is what a sweep is.** 11 defines a sweep as "an idempotent pass over a settled range of **session entries**", and 12 makes session logs durable truth. But 01 §3 records that there is "no documented path to Pi's agent loop, **message list**, or extension/package system from inside a Flue agent," and 01's primitive inventory contains no read-the-transcript capability. 10 proved read-back of durable history **on the ui side** via `useFlueAgent`; 11 ran against a **synthetic** log with no substrate at all. So the seam where the harness reads the entry range it sweeps is proven nowhere — and it is the hinge between the two prototypes.

**L3. 06's six-item substrate-capability list is incomplete after 10, 11 and 12.** The enumerated list is: register a tool · contribute instructions · persist state · emit an affordance payload · suspend-for-reply · private model call. Missing, each demanded by a later resolution: **read a session entry range** (L2); **inject an on-behalf-of-user state entry** (12's re-entry briefing — Flue's `kind: 'signal'` message with trusted-code `attributes`, per 01 §6, looks like the intended carrier and would also give the true-user-versus-injected distinction for free); **subscribe to a settlement-trigger lifecycle event** (L1); and a **transactional durable store** distinct from per-conversation state (12 requires whole-sweep-atomic application across sessions, which `usePersistentState` — conversation-scoped, per 01 — cannot provide). Since the capability list is the spec's portability seam and its early-smell detector, its completeness matters more than most items here.

**L4. How a session binds to a target-document is unstated.** 12 makes sessions attach to a durable target-document; 06 fixes one Flue agent per plugin with many conversations; 01 says `initialData` is validated once at creation, immutable after, and "is where an elicitation _target descriptor_ belongs". Nobody wrote down that a new session's `initialData` carries the target-document id, nor what happens when a caller dispatches to an existing conversation id versus a new one.

**L5. Where plugin-level derived labels are computed.** 09's five-stratum status rules are read-time derivations over the plugin's own graph, but 04's operation set has no derive-status op — the nearest is `project`. 11's derived capture status and 12's derived completion are harness-computed. The spec needs one sentence placing 09's derivation (inside `project`, or a new read-time op) and confirming the harness may invoke it at read time under 11's cadence-as-policy rule.

**L6. Advisory versus issue is two vocabularies for one thing.** 11 introduces the unaccounted-ask advisory and the resume-time unswept-tail advisory; 12 adds the world-moved advisory and a refusal that "carries the world-moved facts". 12's durable store holds "captures, issues, events" — advisories appear nowhere. Are advisories a non-blocking issue severity, a computed-not-stored fact, or a third kind?

**L7. Issue namespacing after two-strata validation.** 04's invariant 6 requires target issues be namespaced; 11 gives the harness its own issue production. The harness-versus-plugin issue namespace split is unwritten.

**L8. Two notions of capture identity coexist.** 04 gives the kernel "capture-id minting"; 11 makes the dedup key "evidence spans + payload/absence", content-based. Both can hold (a minted id plus a content-derived dedup key), but the spec should say so, since 11 explicitly excludes epistemic status from the key and that exclusion is load-bearing.

**L9. Ask-outcome vocabulary is unpinned.** 03 catalogs brunch's `answered | cancelled | unavailable` property-presence union; 10 observed `outcome: redirected`; 05 retires the terminal union while keeping the transport-versus-epistemic distinction. What the outcome vocabulary is — and whether `unavailable` survives given 05's universal markdown floor — is open.

**L10. Absence-state enum has near-duplicates and unmapped ui labels.** 04 lists seven states including both `not-yet-decided` and `deferred`; 05's strip offers three labels ("don't-know / not-applicable / decide-later"). The label→state mapping and the `not-yet-decided` / `deferred` distinction are unresolved.

**L11. `CONTEXT.md` is missing two terms the map's own lexicon carries: _pack_ and _issue_.** More broadly, the glossary covers shells, sessions and interaction but not the envelope vocabulary the spec is mostly about — no entry for capture envelope, evidence span, epistemic status, absence state, resolution record, supersession, kernel card, PluginContext, or storage port. Chain (e) otherwise checks out: `CONTEXT.md` agrees with 05 and 12 on substrate/ui/harness/plugin/binding and on the target-domain / target-document split. But the glossary is roughly half the vocabulary the spec needs.

**L12. "kernel" survives in three compounds the glossary forbids without exempting.** `CONTEXT.md`'s **Harness** entry says "_Avoid_: kernel", yet **kernel card** (granted survival by the map's lexicon, absent from `CONTEXT.md`), **kernel invariants** (04, 06, 10, 11), and stray shell-sense uses ("the kernel must reject a second ask", 10) all persist. The spec should decide: keep both compounds as terms of art and add them to the glossary, or rename to guidance card / harness invariants.

**L13. Milestone-one local storage must satisfy 12's atomicity, which constrains the "binding-internal" format choice.** The map defers JSONL-versus-YAML as "a binding-internal choice", but 12 requires a serialized store with whole-sweep-atomic application and refusals, which a flat append-only text file does not give. The spec should state the transactional requirement as a constraint on the format decision rather than leaving the format wholly free.

**L14. Plugin-declared form payloads versus frozen tool schemas.** 01 records that `defineTool` schemas are Valibot and "frozen at module load", so the harness's ask tool cannot carry a plugin-parameterised output schema per render. 10 confirmed `body: v.any()` works as the opaque payload slot. The spec should state that plugin form payloads are opaque at the tool boundary and validated harness-side against plugin declarations — closing the loop with 05's "answer typing/validation happens entirely harness-side on read-back".

**L15. Unretired proof obligations.** The interpretation-render plugin-renderer seam (05 §4: "exercised once real packs exist", ticket 07's portfolio) and restart durability (10: "untested by design") are both open and neither has a home ticket.

**L16. Minor:** ticket 05's frontmatter says `Resolved: 2026-08-07` while its Answer says "Resolved by HITL grilling, 2026-08-06". Affects only the reading order, where 05-before-10/11 is fixed by delegation anyway.

### 3b. Collected "the spec must…" obligations — one checklist

**Acceptance material**

1. Five proof obligations (independent variability, semantic conservation, explicit transformation, controlled elicitation, local implementation) as contract acceptance criteria — _04_.
2. Ten kernel invariants as harness-enforced test properties, restated in capture/harness vocabulary — _04_, criteria doc §9; see S14.
3. Gating tests: reprojection / projector substitution, minimal pairs, black-box authoring — _04_.
4. Named structural and semantic smells as review vocabulary — _04_.
5. Smallest-honest-plugin test, and **second-binding test** as its sibling — _04_, _06_.
6. Testing strategy: generation-first fixtures over a deterministic replay driver; kernel invariants as properties; `arbitraryFromSchema`; `fc.commands` over the envelope-derived command alphabet; model as offline generator, never CI oracle; regenerate on declaration change; shrunk counterexamples pinned as regressions and read as type-design feedback — _06_.
7. CI smoke = `vite build` + the simulation suite; optional secret-gated real-model `flue run` — _06_.

**Architecture and boundaries** 8. Enumerate the substrate-facing capability list as the core/binding seam — _06_; **it needs four more entries, see L3**. 9. State as a spec invariant: plugins depend on `core` only, never on the binding, never on Flue — _06_. 10. Record the Bun-workspace package layout as intended structure; nothing scaffolded during this map — _06_. 11. Name the deferred UI affordance package as intended (React renderers over `@flue/react`; non-React hosts on `@flue/sdk`) — _06_. 12. Describe the publishable shape; publishing waits on the real name — _06_. 13. Name the envisioned per-substrate binding packages as a payoff, not a commitment — _06_. 14. Charter the dev app with three roles, spec'd as roles not features (dev loop / target-gallery demo / diagnostic probe views) — _06_. 15. Pin remote-parity constraints: one-agent-many-conversations, pinned `agentName`, storage port owned outside the plugin, no dynamic agent creation — _06_, amended by _12_ per C1. 16. Name the five version axes (API contract / plugin impl / concept-schema / target-schema / persisted state); implement none — _04_. 17. Name the non-goals (substrate-agnostic core, executor-standalone) and the elicitor→executor seam — _map_, _08_. 18. Tool prefix derived from the product name, provisionally `bl_*`, never `elicit_*`; core names ops abstractly, the binding renders substrate tool names; all model-facing tools harness-owned — _06_.

**Mechanism** 19. Pin content-based, evidence-anchored capture identity, with epistemic status excluded from the key — _11_. 20. Name **both** supersession channels: the creation-time link (sweep-time correction) and the resolution record (issue-time adjudication) — _11_. 21. State op cadence as explicit harness policy, sweep-completion as the default trigger — _11_. 22. Spec the unaccounted-ask advisory and resume-time sweep reconciliation — _11_. 23. Spec the two validation strata: envelope-level harness-owned refusals plus advisories, versus payload-level plugin ops — _11_. 24. Make the ask tool **reject a second ask per batch** as mechanism, not instruction; per-ask identity and payload ride the tool's output part — _10_. 25. Resolve the wake wart, and jointly the reply-binding mechanism — _10_, see C7. 26. Require the ui to filter on `purpose` / `display` — _10_. 27. Record the Flue transport facts: outbound rich, inbound string-only, unknown part types silently dropped, hence the universal markdown floor — _05_, _10_. 28. Record that `@flue/vite` requires vite ^8 with the directive as the file's first statement, and that the dev controller owns the whole request space so the ui is a separate or app-served app — _10_. 29. State plainly that a target-document's authoritative state is the capture store plus session logs, never the render — _12_. 30. Evidence spans carry pointer **plus** quoted excerpt — _12_. 31. The data model distinguishes true user entries from on-behalf-of-user injected entries — _12_. 32. Completion is a derived read-time status, never a write gate; no lock, no terminal state — _12_. 33. A minimal user-visible insertion notice accompanies injected state messages — _12_.

**Targets** 34. Both packs authored before the pack interface freezes; gherkin wires end-to-end first — _07_. 35. Gherkin milestone-one validation = parse validity + pack-declared step lexicon — _07_. 36. Use the decided name — the **assurance argument** target, package `plugin-assurance` — and propagate it over the `elicit-proof-obligations` / `plugin-proof-obligations` occurrences still in 02 and 07 body text — _09_ + the 2026-08-10 rename decision. 37. Ship the assumption ledger as the headline artifact, as a Markdown table, with per-claim status a derived label — _09_. 38. Record acyclicity as a deliberate restriction and name `decreases` as the future escape hatch — _09_. 39. Sell the Datalog closure as well-formedness and taint propagation, never an assurance verdict; the ui never says "proved" unqualified — _09_. 40. Source `criticality` to safety engineering (DAL/SIL/ASIL), not Dafny or Lean, and say so — _09_. 41. Adopt the one-`Statement`-record, four-edge-kind, five-stratum contract sketch — _09_. 42. Carry as pattern guidance, not mechanism: comment-versus-message provenance, boundary-teaching schemas, hash-pinned prompt directives, private scratchpad — _05_, subject to S7.

---

## 4. AMENDMENT-ORDER READING GUIDE

Read `CONTEXT.md` and `map.md` first for vocabulary and charter, then the tickets in this order, then re-check `CONTEXT.md` against L11–L12.

| #   | Ticket                                                    | Take                                                                                                                                                                                                                                                                                 | Later tickets override                                                                                                                                                                                      |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Flue architecture deep-read** (01)                      | Substrate facts: hooks/render model, `defineTool`, `harness.prompt`, `usePersistentState`, `useDataWriter`, signals versus user messages, local/remote parity table, no ask primitive, Valibot lock-in, no path to Pi's message list                                                 | 06 renames the hook `useElicitation`; 12 flips persistence; the "no path to the message list" fact becomes loose end L2                                                                                     |
| 2   | **zil-lean survey** (02)                                  | Existence proof of the claim-graph layer: assurance lattice, prohibited promotions, derivation provenance, dependency-closure readiness                                                                                                                                              | 09 supersedes the pack sketches, the status-ladder emphasis and the format; `paraphrase_confirmed` / `source_span` conflict with the envelope; target name now `plugin-assurance`                           |
| 3   | **Brunch exchange-schema audit** (03)                     | The one-tool-four-shapes primitive, comment-versus-message provenance, boundary-teaching schemas, agenda-as-derived-state, hash-pinned directives, the strain marks, the fifteen inherit/avoid lessons                                                                               | 05 overturns four Generic classifications — declared continuations, recovery scan, self-contained terminals, the tool_meta chain (S1)                                                                       |
| 4   | **Dev-target portfolio confirmation** (07)                | Portfolio (gherkin + the formal target, BPMN third), hybrid order, both-packs-before-freeze rule, gherkin validator depth                                                                                                                                                            | 09 demotes the four-rung ladder and refutes the Geolog/ARIA guess; the target is now the assurance argument                                                                                                 |
| 5   | **Formal-verification canon survey** (09)                 | GSN skeleton + Dafny nouns + Lean sorry-taint; assumption ledger as headline; the `Statement`/edge/stratum sketch; derived labels; the rename argument                                                                                                                               | Nothing overrides it; its rename obligation is now discharged as `plugin-assurance`                                                                                                                         |
| 6   | **Contract decomposition** (04)                           | The spine: agent-forward hybrid, no universal IR, capture envelope, typed issue queue, operation tiering and snapshot-in/deltas-out, facts-computed-weights-judged, packs and kernel cards, Principle v2, all acceptance material                                                    | 05 renames the shells and retires the exchange ontology; 11 splits validation into two strata and frees op cadence; 12 flips storage, derives capture status, and shrinks per-session state (S5–S7, C2, C3) |
| 7   | **Questioning-UX contract** (05)                          | The reframe (no exchange-pair ontology; affordances as evidence; capture via range-sweeps on settlement), the shell renames, IoC via PluginContext, the six harness commitments, the brunch disposition                                                                              | 10 amends the one-channel commitment to a one-live-affordance slot and adds the reject-second-ask invariant; 11 hardens absence and resolution records; 12 supersedes its provenance rule                   |
| 8   | **Walking skeleton: Flue question round-trip** (10)       | Transport truth: one-live-affordance slot, identity on the tool output part, update-in-place settled, no echo token needed _as configured_, turn suspension plus the wake wart, `purpose`/`display` filtering, questionnaire as one multi-step affordance with ui-driven progression | Nothing amends it; its `exchangeId` / `data-exchange` / `epistemicStatus: stated` vocabulary needs renaming (S2, S4) and its persistence aside is stale (S3)                                                |
| 9   | **Logic-prototype: capture sweep & settlement** (11)      | All five capture hypotheses, each sharpened: trigger-versus-judgment, mechanical-versus-semantic idempotence, content-based identity, absences as evidence, two supersession channels — **and its three amendments to 04**                                                           | 12 settles the derived-status suggestion as fact and generalizes the cite-the-user rule; its `deferred (explicit)` needs a transport mechanism (C4)                                                         |
| 10  | **Shipping shape** (06)                                   | Harness library in a thin host-authored agent, the capability list and second-binding test, package topology and dependency invariant, Valibot, tool prefix, testing strategy, dev-app charter, remote-parity constraints                                                            | 12 flips the storage port to binding-implemented (C1); the capability list needs four more entries (L3); the plugin package is now `plugin-assurance`                                                       |
| 11  | **Multi-session elicitation & durable target state** (12) | Durable target-document, transient sessions, sweep as the only bridge; interleaved-only concurrency; re-entry briefing as injected state messages; only-true-user-entries-are-evidence; completion as derived status; the storage flip; evidence spans as pointer + excerpt          | Latest ticket — authoritative wherever it speaks, but see C2 (its PluginContext-storage clause versus snapshot purity) and C5 (its provenance rule versus kernel invariant 1)                               |

Reference material, read alongside 04: `docs/reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md` (four contracts, packs, IR) and `docs/reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md` (five proof obligations §1, swap tests §6, smells §7–8, ten invariants §9). Ticket 04 adopts these by reference and by count, not by content, so the spec cannot be assembled without them.

**Composability check on the derived-status chain — the three ideas do compose,** into one principle worth stating once: _no status is ever written; every status is computed at read time from stored captures, issues and events._ It operates at three strata, and the spec should name them separately — envelope status (harness-computed: `active`/`superseded` from links and resolution records, per 11); completion status (harness-computed by running plugin-declared criteria, per 12); and domain labels (plugin-computed by stratified derivation over its own payload graph, per 09). The only casualty is 04's stored `status` field (C3), and the only gap is where the plugin-level derivation is invoked (L5).

---

## 5. SIZE

| Material                                 | Bytes       | ≈ Tokens     |
| ---------------------------------------- | ----------- | ------------ |
| `map.md`                                 | 18,427      | 4,600        |
| `CONTEXT.md`                             | 5,415       | 1,350        |
| Tickets 01–12 (13 files, incl. 08)       | 143,209     | 35,800       |
| **Subtotal — map + glossary + tickets**  | **167,051** | **≈ 41,800** |
| `agentic-elicitation-challenges` (inbox) | 18,060      | 4,500        |
| `agentic-elicitation-criteria` (inbox)   | 32,612      | 8,150        |
| **Total the assembler must hold**        | **217,723** | **≈ 54,400** |

Roughly 54k tokens, of which about 42k is the map plus tickets and 13k is the two inbox docs where 04's acceptance material actually lives — comfortably one session, read raw; no digest subagents required.

Three of the largest files are early research tickets — 01, 02 and 03 total 62KB, about 15k tokens — and their load-bearing content is largely already condensed into the map's decision lines and into 04, 05, 07 and 09. The assembler can treat those three as lookup sources rather than sequential reads, with two exceptions: 03's classification table is needed and partly stale per S1, and 01's primitive inventory plus local/remote parity table are needed for the capability-list work in L3.
