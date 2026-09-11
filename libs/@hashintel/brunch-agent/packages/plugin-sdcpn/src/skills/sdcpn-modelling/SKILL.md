---
name: sdcpn-modelling
description: Elicit or revise an operational process model, maintain its recoverable workpiece, and construct a checked SDCPN when Petrinaut capabilities are available. Use for a process-modelling interview, Petri net, or analysis or revision of either artifact.
---

# Capability-aware lifecycle

Use one conceptual lifecycle: orient, elicit or revise, maintain the workpiece, construct when supported, check, and deliver. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.

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

Settle the current account with `mutate_workpiece` before construction. Wait for the returned `revisionId` and `sha256` before citing it in a separate browser construction proposal; never combine settlement and browser construction in one batch. After settlement, use `read_workpiece` with `locateTexts` without candidate Markdown to obtain the actual current revision/hash and spans for construction basis. An unsettled candidate lookup does not authorize construction. Label retained prepared or legacy fenced material honestly rather than treating it as a settled revision.

### Construct

Construct only from the current workpiece. Read `references/pn-construction.md` and `references/checks.md` before beginning. Use mounted Petrinaut tools for every net change and inspect the resulting definition rather than emitting free-form net JSON. If the required tools are absent, limit the result to the workpiece and construction-ready notes.

Construction may infer a representation from recorded operational meaning; it may not invent operational facts. Record construction inferences, approximations, defaults, and target losses in the workpiece.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted. Deliver the current workpiece in every branch. Deliver a net only when the mounted tool path has produced and checked one. State what the result can support, what remains open, what was assumed or simplified, and what the target or current tools could not represent.

An explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.

### Explain a recorded change

When `query_workpiece` is mounted, read the live definition with `read_petrinaut_net` in its own browser step, then call `query_workpiece` by unique endpoint name or ID and the read's `observationToolCallId`. A model-supplied hash is not an observation. A `serialization-equivalent` result retains distinct verified observed/recorded hashes and proves only full-definition equality ignoring object-key insertion order; name that distinction, not hash equality or a reserialization actor. It never relaxes mutation/base checks. Without a correlated observation, explicitly answer as of the returned recorded hash; an unmatched hand edit, missing current state, absent record or conflicting outcome must not acquire conversation attribution.

Interpret the structured result in ordinary assistant prose: name the governing revision and passage, whether that revision is current or superseded, the verified recorded effect, the declared rationale and the relation's standing. Distinguish elicited declarations from inference, defaults, formalism constraints, external material and unsupported context. Operation-level basis does not independently support every field or unmapped effect. No-op, failed, stale or unknown attempts are not causes. Mechanically verified linkage is not a full-support, relevance, template-completeness, semantic-fidelity or useful-explanation verdict. Report those unassessed judgments rather than inventing a pass.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
