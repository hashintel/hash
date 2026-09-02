# Brunch persona harness

This directory owns the project-local Pi harness for driving the real Brunch elicitor as an automated user persona. It is implementation documentation, not execution authority; [`MISSION.md`](../MISSION.md) remains the live mission.

## Ownership

- [`subagents/brunch-persona.md`](subagents/brunch-persona.md) defines the user-side actor and its epistemic behavior.
- [`extensions/brunch-turn.ts`](extensions/brunch-turn.ts) provides the actor's only connection to Brunch.
- [`apps/brunch-agent/src/ui/chat.tsx`](../../../../apps/brunch-agent/src/ui/chat.tsx) owns the independently attachable read-only browser projection.
- [`apps/brunch-agent/test/brunch-turn.test.ts`](../../../../apps/brunch-agent/test/brunch-turn.test.ts) pins the bridge contract.
- [The spike evidence](../docs/evidence/evaluations/live-observable-persona-spike/README.md) records the observed run and proof disposition.
- [`MISSION.next.md`](../MISSION.next.md#observability-and-simulation-viewing) owns future observability and simulation-viewing work.

The `.pi/` directory is the root because the persona and its extension are one mechanism. `extensions/` alone does not own the persona policy, app observer, or evidence boundary.

## Context and authority boundary

The situation pack, objective, uncertainty, and turn budget are supplied in the Pi persona's launch prompt. They are not added to the Flue conversation, the Brunch `ChatAgent` instructions, or a Brunch tool payload.

`brunch_turn` accepts exactly one model-authored field:

```ts
brunch_turn({ message: string })
```

It sends that string as one visible Flue user message. The remaining outbound values are guarded conversation identity and incarnation data. The raw pack and persona instructions therefore have no automatic path into the elicitor context.

This is prompt-enforced semantic privacy, not formal non-interference. Facts the persona deliberately or accidentally puts in `message` become part of canonical Brunch history. The accepted policy is that the persona prompt must preserve private instructions and disclose scenario knowledge only through in-character answers. There is no semantic egress filter. The pack is also visible to the persona provider, local Pi process/session, and operator; “private” here means isolated from the elicitor context rather than secret from that execution environment.

The production authority remains singular:

```text
private situation pack + objective
→ Pi persona chooses one in-character utterance
→ brunch_turn sends only that utterance
→ production Brunch Flue ChatAgent replies
→ Flue stores canonical conversation history
├─ Pi renders the actor/process view
├─ browser renders a read-only product view
└─ transcript CLI renders the durable audit view
```

The Pi persona is an evaluation-side user actor, not a second Brunch elicitor. Its TUI is an operator harness, not product UI. The browser observer is a local debug projection, not another writer, transcript authority, or inferential observer.

## Transport and identity decisions

- Use the existing mounted production `ChatAgent`; never spawn or emulate another elicitor.
- Use the fixed local principal `local` and `PI_SUBAGENT_NAME` as the conversation id. Derive the Flue instance id and ownership headers through the app's existing identity authority.
- Require a unique, non-empty child name. Never silently generate or switch identity.
- Send the first turn with `uid: null`, then pin every later send to the returned incarnation `uid`.
- Correlate each response with submission-scoped `read(admission)`. `history()` is for observation and audit, never “latest assistant reply” selection.
- Permit one active call at a time and one visible Flue user message per admitted call.
- Never resend after admission. If settlement fails or becomes indeterminate, preserve the submission failure, block later sends from that process, and inspect canonical history.
- Keep the browser observer independently attachable and read-only. Normal local chat remains writable and keeps its generated conversation id.

## Operating the harness

1. Start the local app with `yarn workspace @apps/brunch-agent dev`.
2. Launch the project `brunch-persona` from this Brunch context root with a unique `PI_SUBAGENT_NAME`. Supply the situation pack inline with the objective and turn budget; an `@file` token in a launch task is not expanded into persona context.
3. Wait until the first `brunch_turn` admission is visible in Pi.
4. Attach the browser to `http://127.0.0.1:4321/?mode=observe&principal=local&id=<PI_SUBAGENT_NAME>`.
5. After the run, inspect canonical history with `yarn workspace @apps/brunch-agent transcript -- --principal local --id <PI_SUBAGENT_NAME>`.

The ordering in steps 3–4 is required by observed behavior. An observer opened before the Flue instance exists remains idle and does not discover later creation. Attaching after first admission catches up existing history and receives later streaming updates. Reloading after creation reconstructs settled messages.

The frontmatter in `subagents/brunch-persona.md` restricts the intended project-agent loadout to `brunch_turn`; Herdr may additionally provide `ask_parent` for an orchestration blocker. The persona must not use a parent to obtain domain facts or decide how to answer. A direct Pi launch should disable built-in tools, skills, unrelated extensions, and context-file loading so the supplied pack remains its only situation knowledge.

## Rejected alternatives

- A nested `persona → elicitor subagent` topology, because it duplicates elicitor authority and bypasses the real boundary.
- `pi-web`, a Herdr webview, PTY scraping, or parent-mediated turn relaying.
- A second server, model loop, transcript store, relay, or generalized persona protocol.
- The AI SDK `/api/chat` projection for actor transport when the Flue SDK already provides exact submission correlation.
- Reply recovery from the latest history entry.
- Automatic retries, pending-admission persistence, or cross-process adoption before a real consumer requires them.

## Proven and unproven scope

The evidence establishes a local, live-observable, multi-turn text path through real production code with singular writers, exact submission correlation, browser catch-up/streaming/reload, and transcript parity. It is not deployed throughline proof or stratum closure.

Full elicitation, final workpiece or model production, client-executed Petrinaut tools, persona fidelity across cases, repeatability, crash recovery, pre-creation observer discovery, remote access, and productized observation remain unproven. Re-enter only for a named consumer with a corresponding oracle.
