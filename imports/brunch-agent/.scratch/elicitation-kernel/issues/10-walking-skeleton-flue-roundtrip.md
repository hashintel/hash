# Walking skeleton: Flue question round-trip

Type: prototype
Status: open
Blocked by: 05

## Question

Does the one-channel questioning transport hold up in a real Flue agent + web UI? Build a walking skeleton — real Flue agent, minimal elicitor stub (no plugin), one question round-trip: structured ask affordance emitted via a single kernel-owned data channel (`form` tag + markdown-baseline payload), answer returned as string dispatch, interpretation recorded to the session.

Proves or refutes (proof obligations delegated from the Questioning-UX contract, issue 05):

- The **one-channel multiplex** working hypothesis: one fixed `data-exchange` channel, forms discriminated inside the payload, plugin widgets as progressive enhancement.
- The **data-part update-in-place vs. append** contradiction in Flue's docs (hooks reference says in-place; streaming protocol + `AgentReply.data` say append) — runtime check.
- Whether a reply needs an **echo token** binding it to the question asked, or whether transcript adjacency + agent interpretation suffice.
- What the **turn-suspension protocol** actually needs to persist (`terminate: true` tool + fresh-dispatch answer) — and how a cancelled/redirected question reads back from the session.
- UI-side **rendering ergonomics**: branching on the form tag, markdown fallback for unknown forms, `purpose`/`display` filtering of non-user-facing traffic.
