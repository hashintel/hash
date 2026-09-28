---
name: sdcpn-modelling
description: Elicit or revise an operational process model, keep its recoverable Ledger, and construct a checked SDCPN when Petrinaut capabilities are available. Use for a process-modelling interview, Petri net, or analysis or revision of either artifact.
---

# Capability-aware lifecycle

Interleave elicitation, Ledger commits, supported construction and checks. These are recurring steps, not an interview phase followed by a construction phase. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.

## Before substantive work

Interview in the person's operational vocabulary. Activate the `elicitation` skill and read `references/profile.md` before substantive questions or revision. Read `references/ledger-filing.md` before the first Ledger commit. Construct only when the mounted capabilities actually permit construction in this conversation.

## Procedure

### Orient

Establish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.

### Elicit or revise

For a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the `elicitation` skill's universal guidance and `references/profile.md` for detailed operations and coverage; do not turn their register order into question order.

### Keep the Ledger

The Ledger is the recoverable operational account. Follow core's `elicitation` guidance for commit cadence and Note granularity; `references/ledger-filing.md` says what belongs under each operational category.

### Construct

Read `references/pn-construction.md` and `references/checks.md` before beginning. Use mounted Petrinaut tools for every net change and inspect the resulting definition rather than emitting free-form net JSON. If the required tools are absent, limit the result to the Ledger and its construction Notes.

After each meaning-bearing answer, compare the supported account with the current net and take exactly one disposition before the next unrelated interview question. **Changed:** read the current net, apply the bounded missing or changed fragment, run `references/checks.md`. **Already represented:** meaning the net already carries needs no mutation, judged from a current read that stays reusable while the document does not change; reread when it is absent or the document changes. **Blocked:** the fragment lacks a load-bearing fact or the target cannot represent it; ask the smallest resolving question or record the exact missing fact or lost representation as a Ledger Note. Unrelated unknowns do not postpone supported construction.

`readNetOutline` shows the net's elements and arcs without code; `readNetStructure` adds lambda, kernel, equation, scenario and metric code. Use `getLatestNetDefinition` only when canvas positions or visual settings matter. When the Notes a construction decision rests on are no longer in your context, compile the categories you need first.

Construction may infer a representation from established operational meaning; it may not invent operational facts without authorization. An explicit request to use sensible defaults, decide on the person's behalf, make up a suitable example, or equivalent authorization permits purpose-bounded assumptions without another interview round. Record construction inferences, labelled defaults, approximations and target losses as Notes under `construction`, naming the ids of the Notes they rest on. Labelling an unsupported operational default as an assumption does not authorize using it when that authorization is absent.

Saved scenarios and metrics are ordinary construction: build them when the person establishes a regime or a measure, not merely when an experiment is proposed. When the person states a decision the model should answer, read `references/experiment-configuration.md` as part of the same disposition and assess experiment readiness from what the person has stated and the current net's executability together. Propose the experiment when both are present, once per configuration; when only the net is missing something, construct it; when only a fact is missing, ask for it. Parameters or metrics in the net never trigger a proposal by themselves.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted. Deliver from the current Ledger in every branch. Deliver a net only when the mounted tool path has produced and checked one. State what the result can support, what remains open, what was assumed or simplified, and what the target or current tools could not represent.

An explicit stop opens no new topic. Deliver the best current account and any already-checked net with limitations visible.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
