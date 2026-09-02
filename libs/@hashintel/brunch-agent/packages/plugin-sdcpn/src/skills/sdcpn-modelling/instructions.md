# Capability-aware lifecycle

Use one conceptual lifecycle: orient, elicit or revise, maintain the workpiece, construct when supported, check, and deliver. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.

## Select the runtime branch

### Interactive elicitation, review, or revision

Interview in the person's operational vocabulary. Before substantive
elicitation or workpiece revision, read
`references/universal-elicitation.md` and `references/profile.md`.

For review, first inspect the supplied workpiece or model. If it already answers
the question, answer without reading the elicitation references or interviewing.
If the review exposes a gap that requires human knowledge, read both elicitation
references and then ask exactly one focused question that resolves the smallest
consequential gap.

Read `templates/workpiece.md` only when first creating or materially revising
the workpiece. Do not load the template merely to inspect an existing artifact,
answer a resolvable review question, or frame the first elicitation question.
Construct only when the mounted capabilities actually permit construction in
this conversation.

### Construct-only execution

Use the supplied workpiece as the complete modelling input. Do not interview.
Read `references/pn-construction.md` and `references/checks.md`, then use the
mounted construction tools. If a consequential workpiece gap prevents faithful
construction, report the gap and the smallest question a later interactive
elicitation must answer; do not ask it or invent an answer in this conversation.

## Procedure

### Orient

Establish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.

### Elicit or revise

For a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the two elicitation references for detailed operations and coverage; do not turn their register order into question order.

### Maintain the workpiece

Treat the workpiece as the recoverable account construction will consume. Update it after a useful stretch rather than waiting until the end. Preserve unrelated material unless new evidence affects it.

Whenever the workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit it again before construction and before workpiece-only delivery. A delta or prose promise is not a recoverable workpiece.

### Construct

Construct only from the current workpiece. Read
`references/pn-construction.md` and `references/checks.md` before beginning.
Use mounted Petrinaut tools for every net change and inspect the resulting
definition rather than emitting free-form net JSON. If the required tools are
absent, limit the result to the workpiece and construction-ready notes.

Construction may infer a representation from recorded operational meaning; it may not invent operational facts. Record construction inferences, approximations, defaults, and target losses in the workpiece.

### Check and deliver

Apply `references/checks.md` whenever construction is prepared or attempted.
Deliver the current workpiece in every branch. Deliver a net only when the
mounted tool path has produced and checked one. State what the result can
support, what remains open, what was assumed or simplified, and what the target
or current tools could not represent.

An explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.

## Resource discipline

Read resources directly from this skill's advertised resource list. When calling `read_skill_resource`, pass the exact `/.flue/packaged-skills/...` URI advertised after `→`; the relative resource name is only a label and will fail. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.
