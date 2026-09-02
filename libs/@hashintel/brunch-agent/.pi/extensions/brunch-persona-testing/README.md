# Brunch persona testing

This directory owns the local Pi extension that drives the production Brunch elicitor as an automated user persona. It records implementation decisions and operating instructions, not execution authority; [`MISSION.md`](../../../MISSION.md) remains the live mission.

## Ownership and layout

- [`index.ts`](index.ts) owns Pi registration, Flue identity and turn correlation, client-tool host selection, client-tool resume signals, and the evaluation-side tool trace.
- [`SYSTEM.md`](SYSTEM.md) owns only the persona's private policy and epistemic behavior.
- [`apps/brunch-agent/src/ui/chat.tsx`](../../../../../../apps/brunch-agent/src/ui/chat.tsx) owns the independently attachable read-only browser projection.
- [`apps/brunch-agent/test/brunch-turn.test.ts`](../../../../../../apps/brunch-agent/test/brunch-turn.test.ts) pins the bridge and tool-host contract.
- [The original spike evidence](../../../docs/evidence/evaluations/live-observable-persona-spike/README.md) records the observed text-only run and proof disposition at the paths used by that run.
- [`MISSION.next.md`](../../../MISSION.next.md#observability-and-simulation-viewing) owns future observability and simulation-viewing work.

Reusable interviewee-visible source truth belongs under [`evaluations/cases/`](../../../evaluations/cases/), hidden answer keys under [`evaluations/oracles/`](../../../evaluations/oracles/), and prompts, fixtures, runners, and procedures under [`evaluations/protocols/`](../../../evaluations/protocols/). The Vestera scheduling case is currently the only full multi-turn persona-ready case. Bounded approval probes are not general persona cases, and the gas, truck-fleet, semiconductor-fab, and cold-chain material remains too thin to port without more source documentation.

## Context and authority boundary

The situation pack, objective, uncertainty, and turn budget are supplied only in the Pi persona's launch prompt. They are not added to the Flue conversation, the Brunch `ChatAgent` instructions, or a Brunch tool payload.

`brunch_turn` accepts exactly one model-authored field:

```ts
brunch_turn({ message: string })
```

It sends that string as one visible Flue user message. The remaining outbound values are guarded conversation identity, incarnation data, and—only after Brunch itself requests a client-deferred tool—the result signal for that call. The raw pack, objective, budget, persona instructions, host configuration, and tool trace have no automatic path into Brunch.

This is prompt-enforced semantic privacy, not formal non-interference. Facts the persona deliberately or accidentally puts in `message` become part of canonical Brunch history. The accepted policy is that `SYSTEM.md` must preserve private instructions and disclose scenario knowledge only through in-character answers; there is no semantic egress filter. The pack is also visible to the persona provider, local Pi process/session, and operator. “Private” here means isolated from the elicitor context, not secret from that execution environment.

Pi sends only the tool result's `content` back to the persona model. The structured `details` and custom rendering are operator-side metadata, so the tool activity trace does not enter either the persona's next model turn or Brunch's conversation.

```text
private situation pack + objective
→ Pi persona chooses one in-character utterance
→ brunch_turn sends only that utterance
→ production Brunch Flue ChatAgent replies or requests tools
├─ server tools execute inside Flue
└─ client-deferred tools execute in the explicitly selected harness host
   → one canonical client-tool-result signal resumes Brunch
→ Flue stores canonical conversation history
├─ Pi renders the actor/process view plus evaluation-side tool activity
├─ browser renders a read-only product view
└─ transcript CLI renders the durable audit view
```

The Pi persona is an evaluation-side user actor, not a second Brunch elicitor. Its TUI is an operator harness, not product UI. The browser observer is a local debug projection, not another writer, transcript authority, or inferential observer.

## Transport and identity decisions

- Use the existing mounted production `ChatAgent`; never spawn or emulate another elicitor.
- Use the fixed local principal `local` and `PI_SUBAGENT_NAME` as the conversation id. Derive the Flue instance id and ownership headers through the app's existing identity authority.
- Require a unique, non-empty child name. Never silently generate or switch identity.
- Send the first turn with `uid: null`, then pin every later user or resume send to the returned incarnation `uid`.
- Correlate each response with submission-scoped `read(admission)`. Inspect `history()` only after settlement to find dynamic-tool parts belonging to that submission; never select the latest assistant reply from history.
- Permit one active call at a time and one visible Flue user message per admitted `brunch_turn` call.
- Never resend a user utterance after admission. If settlement, tool hosting, or resume becomes indeterminate, preserve the failure, block later sends from that process, and inspect canonical history.
- Keep the browser observer independently attachable and read-only. Normal local chat remains writable and keeps its generated conversation id.

## Client-tool hosts

`--brunch-tool-host` has three explicit modes:

- `none` is the default. Flue still executes server tools and the Pi result records them. A client-deferred call fails loudly instead of hanging or fabricating a result.
- `mock` consumes an ordered JSON fixture supplied by `--brunch-tool-mocks <path>`. Every tool name and input must match exactly. Missing, extra, or out-of-order calls fail the admitted turn and block later sends.
- `real-headless` executes `readPetrinautDoc` against the checked-out Petrinaut user guide and executes supported construction calls through the existing headless Petrinaut callbacks. `--brunch-headless-title <title>` controls the in-memory document title.

Selecting a host does not mount tools, set Flue initial data, or change production composition. It services only client-deferred calls the real production agent emits. The normal persona route currently mounts `readPetrinautDoc`; construction tools remain conditional on the production agent's validated-construction mode. `real-headless` is real core callback execution against an in-memory document, not browser UI execution, browser rendering, persistence, or proof of product parity.

One suspension may contain multiple calls. The bridge executes them sequentially in canonical order, sends one `client-tool-result` signal carrying their existing call ids, then performs another submission-scoped read. It repeats for at most 20 client-tool rounds and does not return early merely because a suspending response also contained text.

A mock fixture has this shape and should live with the evaluation protocol that owns it:

```json
{
  "calls": [
    {
      "toolName": "readPetrinautDoc",
      "input": { "doc": "simulation" },
      "output": "Fixture-controlled page text"
    }
  ]
}
```

The final Pi tool details contain every observed server call and every hosted client call with sequence, Flue submission id, tool call id, tool name, executor (`server`, `mock`, or `real-headless`), outcome, input, and output/error. `renderResult` shows a concise `### Tool activity` list beneath `## Brunch`; raw values remain in details and canonical tool activity remains available through the transcript.

## Operating the harness

1. Start the local app with `yarn workspace @apps/brunch-agent dev`.
2. From this Brunch context root, launch Pi (directly or through Herdr) with a unique `PI_SUBAGENT_NAME`. Choose the persona model and thinking level with Pi's native `--model <provider/model>` and `--thinking <level>` options.
3. Supply the situation pack inline with the objective and turn budget. The extension treats this launch content as opaque Markdown or plain text and does not parse or validate a pack schema. An `@file` token in a launch task is not expanded into persona context.
4. Wait until the first `brunch_turn` admission is visible in Pi.
5. Attach the browser to `http://127.0.0.1:4321/?mode=observe&principal=local&id=<PI_SUBAGENT_NAME>`.
6. After the run, inspect canonical history with `yarn workspace @apps/brunch-agent transcript -- --principal local --id <PI_SUBAGENT_NAME>`.

The restricted direct launch is:

```sh
PI_SUBAGENT_NAME=<unique-conversation-id> pi \
  --model <provider/model> \
  --thinking <level> \
  --no-extensions \
  --extension .pi/extensions/brunch-persona-testing/index.ts \
  --no-builtin-tools \
  --tools brunch_turn \
  --no-skills \
  --no-prompt-templates \
  --no-context-files \
  --append-system-prompt .pi/extensions/brunch-persona-testing/SYSTEM.md \
  --brunch-tool-host real-headless \
  --brunch-headless-title "Persona evaluation" \
  --approve
```

For deterministic mocks, replace the last host options with:

```sh
--brunch-tool-host mock \
--brunch-tool-mocks evaluations/protocols/<protocol>/client-tools.json
```

`--no-extensions` plus the one explicit `--extension` prevents dependence on unrelated active Pi extensions. Herdr can forward the same native Pi arguments after `--`; any Herdr companion/state extension is optional orchestration rather than part of the Brunch transport. The persona must never use a parent to obtain domain facts or decide how to answer.

The ordering in steps 4–5 is required by observed behavior. An observer opened before the Flue instance exists remains idle and does not discover later creation. Attaching after first admission catches up existing history and receives later streaming updates. Reloading after creation reconstructs settled messages.

[`evaluations/cases/vestera-scheduling/situation-pack.md`](../../../evaluations/cases/vestera-scheduling/situation-pack.md) is the current exemplar pack. Its Markdown sections are guidance for the persona model, not fields consumed by the extension.

## Rejected alternatives and limits

- A nested `persona → elicitor subagent` topology, because it duplicates elicitor authority and bypasses the real boundary.
- Registering Brunch's tools with Pi, which would expose capabilities to the persona model and move execution to the wrong authority. The host is internal to `brunch_turn` and services only Flue-emitted calls.
- Injecting tool traces or host instructions into Brunch messages. Flue history is canonical; Pi details are an evaluation-side projection.
- `pi-web`, a Herdr webview, PTY scraping, parent-mediated turn relaying, a second server, another model loop, or another transcript store.
- Reply recovery from the latest history entry, automatic user-message retries, pending-admission persistence, or cross-process adoption before a real consumer requires them.

The original evidence establishes a local, live-observable, multi-turn text path through real production code with singular writers, exact submission correlation, browser catch-up/streaming/reload, and transcript parity. The added host modes are covered by local contract tests and extension loading. They do not establish a paid live tool turn, deployed throughline, browser parity, full elicitation quality, persona fidelity across cases, repeatability, crash recovery, pre-creation observer discovery, or remote access.
