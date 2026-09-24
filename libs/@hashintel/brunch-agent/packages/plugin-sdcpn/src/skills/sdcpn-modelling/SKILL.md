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

Treat the workpiece as the recoverable operational account. In integrated I mode, construction can also begin from a directly authorized live-document request before a revision exists; a later workpiece may record what the canonical result established. Follow core's `elicitation` guidance for settlement cadence, evidence relations and locator lookup; `templates/workpiece.md` supplies the process-specific recording shape.

Settle the operational account with `mutate_workpiece` as meaning becomes clear. In I, independent server and browser calls may share a proposal, but a concurrent Ledger revision cannot attest to a browser effect until its canonical result returns. Reuse submitted Markdown as authoritative for its exact settlement, not as proof that a concurrent document change succeeded. The host associates settled document revisions with applied canonical calls; draft authorization uses the latest canonical net read and settled Ledger revision. Do not put protocol identities or basis tables into experiment draft inputs.

### Construct

Construct from the current workpiece or from a directly authorized user request against the live document in I. Read `references/pn-construction.md` and `references/checks.md` before beginning. Use mounted Petrinaut tools for every net change and inspect the resulting definition rather than emitting free-form net JSON. If the required tools are absent, limit the result to the workpiece and construction-ready notes.

After each meaning-bearing settlement, compare the supported account with the current net and take exactly one disposition before the next unrelated interview question. **Changed:** observe the current net, apply the bounded missing or changed fragment, run `references/checks.md`. **Already represented:** a wording-only revision or meaning the net already carries needs no mutation, judged from a current canonical read that stays reusable while the document does not change; reread when it is absent or the document changes. **Blocked:** the fragment lacks a load-bearing fact or the target cannot represent it; ask the smallest resolving question when interactive, otherwise record the exact missing fact or lost representation in the workpiece, and do not treat that record as a new settlement requiring another disposition. Unrelated unknowns do not postpone supported construction.

Construction may infer a representation from recorded operational meaning; it may not invent operational facts without authorization. An explicit request to use sensible defaults, decide on the person's behalf, make up a suitable example, or equivalent authorization permits purpose-bounded assumptions without another interview round. Record construction inferences, labelled defaults, approximations and target losses in the workpiece. Labelling an unsupported operational default as an assumption does not authorize using it when that authorization is absent.

Saved scenarios and metrics are ordinary construction: build them when the workpiece settles a regime or a measure, or in integrated I mode when the person directly authorizes them against the live document, not merely when an experiment is proposed. Their settled document revisions identify the calls that changed the net, not a semantic Ledger cause. When the settled workpiece states a decision the model should answer, read `references/experiment-configuration.md` as part of the same disposition and assess experiment readiness from the workpiece's meaning and the current net's executability together. Propose the derived experiment when both are present, once per configuration; when only the net is missing something, construct it; when only a fact is missing, ask for it. Parameters or metrics in the net never trigger a proposal by themselves, and integrated Brunch prefers a reviewed draft and nothing runs until the person presses Run on its card. Call canonical `createExperiment` directly only if the person explicitly requests immediate execution.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted. Deliver the current workpiece in every branch. Deliver a net only when the mounted tool path has produced and checked one. State what the result can support, what remains open, what was assumed or simplified, and what the target or current tools could not represent.

An explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.

### Explain a recorded change

When `query_workpiece` is mounted, take a current `getLatestNetDefinition` read before explaining a visible element. Call `query_workpiece` with its kind and unique name or ID from that read; for an arc, supply its transition ID, input/output direction and place ID. The result associates applied canonical calls with the element ID and names the workpiece revision current at each call, including that revision's turn range and user message IDs. A hand edit or absent recorded call has no conversation attribution.

Interpret the structured result in ordinary assistant prose: name the associated calls and the workpiece revision current at each. No declaration links the revision's content to an element in I; chronological association is not semantic support. If no applied call matches, say the basis is absent rather than inventing a cause.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
