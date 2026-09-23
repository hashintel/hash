---
name: sdcpn-modelling
description: Elicit or revise an operational process model, maintain its recoverable workpiece, and construct a checked SDCPN when Petrinaut capabilities are available. Use for a process-modelling interview, Petri net, or analysis or revision of either artifact.
---

# Capability-aware lifecycle

Interleave elicitation, workpiece settlement, supported construction and checks. These are recurring steps, not an interview phase followed by a construction phase. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.

## Select the runtime branch

### Interactive elicitation or revision

Interview in the person's operational vocabulary. Activate the `elicitation` skill and read `references/profile.md` before substantive questions or revision. Read `templates/workpiece.md` when creating or materially revising the shared workpiece. Construct only when the mounted capabilities actually permit construction in this conversation.

### Construct-only execution

Apply core's non-interactive routing rule to the supplied modelling workpiece. Read `references/pn-construction.md` and `references/checks.md`, then use the mounted construction tools.

## Procedure

### Orient

Establish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.

### Elicit or revise

For a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the `elicitation` skill's universal guidance and `references/profile.md` for detailed operations and coverage; do not turn their register order into question order.

### Maintain the workpiece

Treat the workpiece as the recoverable operational account construction will consume. Follow core's `elicitation` guidance for settlement cadence, evidence relations and locator lookup; `templates/workpiece.md` supplies the process-specific recording shape.

Settle the current account with one `mutate_workpiece` call before construction, declaring evidence by literal text in that same call. Wait for the result and reuse the submitted Markdown as authoritative for that exact settlement; never combine settlement and browser construction in one batch. The host owns protocol correlation and resolves the current Ledger revision, evidence standing, document base, and retained effects around canonical Petrinaut calls. Do not make the model copy revision or document hashes, observation call IDs, text locators or basis tables into experiment draft inputs. The host resolves them from the verified canonical read and settled Ledger. Label retained prepared or legacy fenced material honestly rather than treating it as a settled revision.

### Construct

Construct only from the current workpiece. Read `references/pn-construction.md` and `references/checks.md` before beginning. Use mounted Petrinaut tools for every net change and inspect the resulting definition rather than emitting free-form net JSON. If the required tools are absent, limit the result to the workpiece and construction-ready notes.

After each meaning-bearing settlement, compare the supported account with the current net and take exactly one disposition before the next unrelated interview question. **Changed:** observe the current net, apply the bounded missing or changed fragment, run `references/checks.md`. **Already represented:** a wording-only revision or meaning the net already carries needs no mutation, judged from a verified current observation that stays reusable while no mutation or stale marker invalidates it; reread only when it is absent, stale or unknown. **Blocked:** the fragment lacks a load-bearing fact or the target cannot represent it; ask the smallest resolving question when interactive, otherwise record the exact missing fact or lost representation in the workpiece, and do not treat that record as a new settlement requiring another disposition. Unrelated unknowns do not postpone supported construction.

Construction may infer a representation from recorded operational meaning; it may not invent operational facts without authorization. An explicit request to use sensible defaults, decide on the person's behalf, make up a suitable example, or equivalent authorization permits purpose-bounded assumptions without another interview round. Record construction inferences, labelled defaults, approximations and target losses in the workpiece. Labelling an unsupported operational default as an assumption does not authorize using it when that authorization is absent.

Saved scenarios and metrics are ordinary construction: build them when the workpiece settles a regime or a measure, not when an experiment is proposed. When the settled workpiece states a decision the model should answer, read `references/experiment-configuration.md` as part of the same disposition and assess experiment readiness from the workpiece's meaning and the current net's executability together. Propose the derived experiment when both are present, once per configuration; when only the net is missing something, construct it; when only a fact is missing, ask for it. Parameters or metrics in the net never trigger a proposal by themselves, and integrated Brunch prefers a reviewed draft and nothing runs until the person presses Run on its card. Call canonical `createExperiment` directly only if the person explicitly requests immediate execution.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted. Deliver the current workpiece in every branch. Deliver a net only when the mounted tool path has produced and checked one. State what the result can support, what remains open, what was assumed or simplified, and what the target or current tools could not represent.

An explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.

### Explain a recorded change

When `query_workpiece` is mounted, use the latest verified canonical definition-read result for the currently confirmed document revision. When the host can attach that current read correlation, call `query_workpiece` by unique endpoint name or ID; do not make up or copy an observation call ID or hash. The host attaches the verified read's correlation to the `query_workpiece` selector; submit only the model-visible selector fields. Obtain a fresh read in its own browser step when a stale/unknown marker is present or no current verified read exists. Mutation success alone never establishes a current net observation or revision. A model-supplied hash is not an observation. A `serialization-equivalent` result retains distinct verified observed/recorded hashes and proves only full-definition equality ignoring object-key insertion order; name that distinction, not hash equality or a reserialization actor. It never relaxes mutation/base checks. Without a correlated observation, explicitly answer as of the returned recorded hash; an unmatched hand edit, missing current state, absent record or conflicting outcome must not acquire conversation attribution.

Interpret the structured result in ordinary assistant prose: name the governing revision and passage, whether that revision is current or superseded, the verified recorded effect, the declared rationale and the relation's standing. Distinguish elicited declarations from inference, defaults, formalism constraints, external material and unsupported context. Operation-level basis does not independently support every field or unmapped effect. No-op, failed, stale or unknown attempts are not causes. Mechanically verified linkage is not a full-support, relevance, template-completeness, semantic-fidelity or useful-explanation verdict. Report those unassessed judgments rather than inventing a pass.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
