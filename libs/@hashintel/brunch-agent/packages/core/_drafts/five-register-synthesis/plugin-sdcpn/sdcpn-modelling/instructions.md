# SDCPN Modelling

Use one conceptual lifecycle: orient, elicit, maintain or revise the workpiece, construct when supported, check, and route any consequential gap back to elicitation. The current runtime may expose only one branch of that lifecycle in a conversation. Do not claim that an unavailable transition occurred.

## Progressive guidance

Before substantive elicitation or revision, read both references:

1. `references/universal-elicitation.md` supplies universal progressive teaching.
2. `references/profile.md` adds the operational-process domain typology and SDCPN target-formalism profile.

Both use the same additive registers: **Directives**, **Recognition**, **Operations**, **Coverage**, and **Verification**. Universal guidance applies first. Plugin guidance may add context or narrow applicability; it does not silently weaken a universal directive. Operations may direct attention to Recognition, Coverage, or Verification in either layer.

Read `templates/workpiece.md` when creating or substantially revising the workpiece. Read `references/pn-construction.md` and `references/checks.md` only when preparing to construct, constructing, or checking a net.

## Runtime branches

### Interactive elicitation or revision

Use the universal reference, plugin profile, and workpiece template. Maintain and deliver the recoverable workpiece. Construct only if the mounted capabilities actually permit construction in this conversation.

### Construct-only execution

Use the supplied workpiece as modelling input, read construction guidance and checks, and use the mounted construction tools. Do not interview. If a consequential workpiece gap prevents faithful construction, report the gap and the smallest question a later interactive elicitation must answer; do not ask it or invent an answer in the construct-only conversation.

## Lifecycle

### Orient

Establish the intended question or decision, audience, boundary, horizon, accuracy need, available time, and tolerance for proposed assumptions conversationally. Do not administer those concerns as an opening form. Identify one concrete case or disputed part of an existing model that can expose the first useful structure.

Orientation is sufficient when there is enough purpose and context to select one focused next question. It need not settle every concern before elicitation begins.

### Elicit

Follow a concrete case in the person's vocabulary. Use universal Operations to choose the next move and the plugin profile's Recognition and Coverage to understand what may matter. Coverage is an attention and workpiece contract, never question order.

After each useful answer, re-evaluate the active gap. Continue the case, deepen one ambiguity, sweep one property, explore one exception, deposit and defer, or prepare to close. Do not turn the register order or workpiece headings into a questionnaire.

### Maintain or revise the workpiece

Treat the workpiece as the recoverable account construction will consume. Update it after a useful stretch rather than waiting until the end. Preserve exact expert evidence where it matters and distinguish it from normalized prose, agent inference, assumptions, unresolved alternatives, and omissions.

When an existing workpiece or model is being analyzed or revised, first locate the disputed or changed material and its objective consequence. Preserve unrelated material unless the new evidence affects it. Distinguish a genuine correction from conflict or contextual coexistence; do not let two active statements represent one correction.

Whenever the workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit the full latest workpiece again before a construction handoff and before workpiece-only delivery, even when the last change seemed small. A delta is not recoverable.

### Construct

Construct only from a recoverable workpiece. In an interactive conversation, emit the full latest workpiece before any construction handoff. In a construct-only conversation, treat the supplied workpiece as the complete modelling input. Read the construction and checks resources before beginning. If mounted Petrinaut tools are available, use them for every net change and inspect the resulting definition rather than emitting net JSON. If the necessary tools are absent, limit the result to the workpiece and construction-ready notes.

Construction may infer a representation from recorded operational knowledge; it may not invent operational facts. Name inferences, approximations, defaults, and losses. When a consequential missing fact prevents faithful construction, ask the smallest resolving question only if interviewing is available in that conversation. In construct-only execution, report that question and stop the unsupported construction path so a later interactive conversation can update the workpiece.

### Check and deliver

Apply the universal and plugin Verification registers before any delivery. Apply the phase-specific checks only when construction was prepared or attempted. Deliver the current workpiece in all cases. Deliver a net only when the available tool path has produced and checked one. Name what the result can support, what remains open, what was assumed or simplified, and what the target could not represent.

An explicit stop opens no new topic. In an interactive conversation, emit the full latest workpiece and, if already available, the best checked net, with gaps and assumptions visible. In construct-only execution, report a blocking gap rather than opening an interview.
