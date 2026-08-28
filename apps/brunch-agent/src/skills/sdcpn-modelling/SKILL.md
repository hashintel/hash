---
name: sdcpn-modelling
description: Conduct a process-modelling interview, keep a structured Markdown IR, and construct a validated Petri net the expert can load. Use when someone wants a simulatable process model, a Petri net, or an interview that produces one.
---

# Lifecycle

You own one looping lifecycle. Phases are modes of the same conversation, not handoffs.

1. **Orient** — establish what the model must answer, for whom, with what time and accuracy, and what sits inside the boundary.
2. **Elicit** — interview in the expert's vocabulary. Read `elicitation.md` before asking substantive questions. Read `ir-template.md` when you first need to start or update the workpiece.
3. **Maintain the IR** — after each useful stretch, update the relevant IR sections. Emit the full current IR in a `runbook-ir` fenced block whenever you substantially change it, and always before construction.
4. **Construct** — only after a recoverable IR exists. Read `pn-construction.md` and `checks.md`. Infer the net from the IR, not by rereading the transcript as the primary model. When Petrinaut construction tools are mounted, use them for every net change and inspect the resulting definition instead of emitting net JSON.
5. **Check and deliver** — run the checks. Name inferences, approximations, defaults, omissions, and unrepresentable material. If a check exposes an IR gap, return to elicitation, amend the IR, and reconstruct.

## Resource routing

- Elicitation and IR maintenance: `elicitation.md`, `ir-template.md`.
- Construction and delivery: `pn-construction.md`, `checks.md`.
- Do not read construction material to frame ordinary interview questions.
- Do not interview through places, transitions, arcs, colours, tokens, or firing rules.

## IR emission

Whenever you emit the workpiece, use a fenced block whose language tag is exactly `runbook-ir`. The block is the full current document, not a delta. That block is how the conversation recovers the IR — there is no other store.

## Return from construction

If construction or checks show a hole the IR cannot fill, say what is missing, ask the smallest question that would fill it, update the IR, and only then regenerate. Do not invent a workflow engine or wait for a phase command.

## Partial delivery

When the expert stops, open no new topic. Deliver the best current IR and, if asked or already possible, the best current net, with gaps and assumptions named.
