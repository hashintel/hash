---
name: sdcpn-modelling
description: Elicit or revise an operational process model, maintain its recoverable workpiece, and construct a checked SDCPN when Petrinaut capabilities are available. Use for a process-modelling interview, Petri net, or analysis or revision of either artifact.
---

# Capability-aware lifecycle

Interleave elicitation, workpiece settlement, supported construction and checks. These are recurring steps, not an interview phase followed by a construction phase. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.

## Before substantive work

Interview in the person's operational vocabulary. Activate the `elicitation` skill and read `references/profile.md` before substantive questions or revision. Read `templates/workpiece.md` when creating or materially revising the shared workpiece. Construct only when the mounted capabilities actually permit construction in this conversation.

## Procedure

### Orient

Establish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.

### Elicit or revise

For a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the `elicitation` skill's universal guidance and `references/profile.md` for detailed operations and coverage; do not turn their register order into question order.

#### Interview length

Apply this section only when an interview length is supplied. Without one, follow the ordinary procedure unchanged. A level is supplied, with a question cap for every level except Deep. Treat this as posture already stated; do not ask for it again. Record the level on the first turn under **Available time and assumption appetite**. The chosen length changes which absences you pursue and how many, never what counts as evidence. Every reply before closing consumes one question, including confirmations; a grouped question counts as one.

- **Quick:** Pursue only essentials the net cannot be built without. Group related questions only when they share one frame. Use only authorized construction defaults, recording each as **Assumed**, with its reason and how to check it. Selecting Quick does not authorize inventing operational facts, ranges or units. Leave unsupported facts open. Do not propose an experiment.
- **Standard:** One thread per question, quantities with their units. Offer a supported default and ask; do not adopt an unconfirmed operational default just because the cap is reached. Propose an experiment only with the person's stated range and unit and the existing readiness checks satisfied.
- **Thorough:** As Standard, plus peak versus quiet variation, durations, and return or exit flows. Leave missing facts **Unknown**. Ask for the range the person would consider before proposing an experiment.
- **Deep:** As Thorough, plus units, ranges, edge cases and restrictions. Never assume missing facts. No cap: offer a pause between topics instead of closing because of the count.

When **remaining is 1**, ask for the most consequential open fact. When **remaining is 0**, settle the latest answer and close without another question, including a correction question: list stated facts, **Assumed** facts and open items by name. Reaching the cap does not make the model complete or runnable. Gaps are listed, not filled. Mention that continuing at a higher level is available without opening a new question.

When the level changes, update the recorded level in the next settlement and replan. Earlier questions still count against the new cap. Do not repeat a settled fact.

### Maintain the workpiece

Treat the workpiece as the recoverable operational account. Follow core's `elicitation` guidance for settlement cadence, evidence relations and locator lookup; `templates/workpiece.md` supplies the process-specific recording shape.

Settle the operational account with `mutate_workpiece` as meaning becomes clear.

### Construct

Read `references/pn-construction.md` and `references/checks.md` before beginning. Use mounted Petrinaut tools for every net change and inspect the resulting definition rather than emitting free-form net JSON. If the required tools are absent, limit the result to the workpiece and construction-ready notes.

After each meaning-bearing answer, compare the supported account with the current net and take exactly one disposition before the next unrelated interview question. **Changed:** observe the current net, apply the bounded missing or changed fragment, run `references/checks.md`. **Already represented:** meaning the net already carries needs no mutation, judged from a current canonical read that stays reusable while the document does not change; reread when it is absent or the document changes. **Blocked:** the fragment lacks a load-bearing fact or the target cannot represent it; ask the smallest resolving question or record the exact missing fact or lost representation in the workpiece. Unrelated unknowns do not postpone supported construction.

Construction may infer a representation from established operational meaning; it may not invent operational facts without authorization. An explicit request to use sensible defaults, decide on the person's behalf, make up a suitable example, or equivalent authorization permits purpose-bounded assumptions without another interview round. Record construction inferences, labelled defaults, approximations and target losses in the workpiece. Labelling an unsupported operational default as an assumption does not authorize using it when that authorization is absent.

Saved scenarios and metrics are ordinary construction: build them when the person establishes a regime or a measure, not merely when an experiment is proposed. When the person states a decision the model should answer, read `references/experiment-configuration.md` as part of the same disposition and assess experiment readiness from what the person has stated and the current net's executability together. Propose the experiment when both are present, once per configuration; when only the net is missing something, construct it; when only a fact is missing, ask for it. Parameters or metrics in the net never trigger a proposal by themselves.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted. Deliver the current workpiece in every branch. Deliver a net only when the mounted tool path has produced and checked one. State what the result can support, what remains open, what was assumed or simplified, and what the target or current tools could not represent.

An explicit stop opens no new topic. Emit the best current workpiece and any already-checked net with limitations visible.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
