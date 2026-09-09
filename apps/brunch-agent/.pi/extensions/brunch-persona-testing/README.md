# Brunch persona testing

This folder holds the persona policy and operating instructions for the local Pi extension at [`../brunch-persona-testing.ts`](../brunch-persona-testing.ts), which drives the production Brunch elicitor as an automated user persona. It records implementation decisions and operating instructions, not execution authority; the Brunch context root's [`MISSION.md`](../../../../../libs/@hashintel/brunch-agent/MISSION.md) remains the live mission when one exists.

## Ownership and layout

The harness is a client of this application's composition: it derives Flue identity through the application's identity authority, resumes Brunch through the application's client-tool signal, and reuses the application's headless Petrinaut client. The application therefore owns it, declares its dependencies, and governs it with its own lint, type-check, and unit tests. It consumes reusable case inputs from the Brunch context root's `evaluations/`.

- [`../brunch-persona-testing.ts`](../brunch-persona-testing.ts) is the Pi entry: registration, flags, and client-tool host selection.
- [`src/evaluations/persona/brunch-turn.ts`](../../../src/evaluations/persona/brunch-turn.ts) owns the `brunch_turn` tool: Flue identity and turn correlation, client-tool resume signals, the evaluation-side tool trace, and rendering.
- [`src/evaluations/persona/client-tool-hosts.ts`](../../../src/evaluations/persona/client-tool-hosts.ts) owns the mock and real-headless client-tool hosts.
- [`SYSTEM.md`](SYSTEM.md) owns only the persona's private policy and epistemic behavior.
- [`src/ui/chat.tsx`](../../../src/ui/chat.tsx) owns the independently attachable read-only browser projection.
- [`test/brunch-turn.test.ts`](../../../test/brunch-turn.test.ts) pins the bridge and tool-host contract.
- [The original spike evidence](../../../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/live-observable-persona-spike/README.md) records the observed text-only run and proof disposition at the paths used by that run.
- [`MISSION.next.md`](../../../../../libs/@hashintel/brunch-agent/MISSION.next.md#observability-and-simulation-viewing) owns future observability and simulation-viewing work.

Reusable interviewee-visible source truth belongs under
[`evaluations/cases/`](../../../../../libs/@hashintel/brunch-agent/evaluations/cases/), hidden answer keys under
[`evaluations/oracles/`](../../../../../libs/@hashintel/brunch-agent/evaluations/oracles/), and prompts, fixtures, runners, and
procedures under [`evaluations/protocols/`](../../../../../libs/@hashintel/brunch-agent/evaluations/protocols/). Vestera is the
executed exemplar. Industrial-gas VMI, truck-fleet maintenance, semiconductor-fab operations,
data-centre thermal operations, and pharma cold chain now have full greenfield situation packs,
opening messages, and prospective ledgers. They remain unvalidated in 6–10-turn runs and are not
yet bound to a frozen protocol. Bounded approval probes remain skill-composition probes rather
than general persona cases.

## Context and authority boundary

The situation pack, objective, uncertainty, and turn budget are supplied only in the Pi persona's launch prompt. They are not added to the Flue conversation, the Brunch `ChatAgent` instructions, or a Brunch tool payload.

`brunch_turn` accepts exactly one model-authored field:

```ts
brunch_turn({ message: string });
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
- By default use the fixed local principal `local` and `PI_SUBAGENT_NAME` as the conversation id. With `--brunch-browser-session`, use the operator-captured browser identity instead. Derive/verify the Flue instance id and ownership headers through the app's existing identity authority.
- Require a unique, non-empty child name. Never silently generate or switch identity.
- For a new default session, send the first turn with `uid: null`, then pin every later user or resume send to the returned incarnation `uid`. Browser attachment starts with the captured admission UID, never create-only or unconditional admission. Optional SDK-owned `initialData` is forwarded unchanged only on creation; it is never sent with an existing UID or a client-result signal.
- Correlate each response with submission-scoped `read(admission)`. Inspect `history()` only after settlement to find dynamic-tool parts belonging to that submission; never select the latest assistant reply from history.
- Permit one active call at a time and one visible Flue user message per admitted `brunch_turn` call.
- Never resend a user utterance after admission. If settlement, tool hosting, or resume becomes indeterminate, preserve the failure, block later sends from that process, and inspect canonical history.
- Keep the browser observer independently attachable and read-only. Normal local chat remains writable and keeps its generated conversation id.

## Client-tool hosts

`--brunch-tool-host` has three explicit modes:

- `none` is the default. Flue still executes server tools and the Pi result records them. A client-deferred call fails loudly instead of hanging or fabricating a result.
- `mock` consumes an ordered JSON fixture supplied by `--brunch-tool-mocks <path>`, resolved against the working directory. Every tool name and input must match exactly. Missing, extra, or out-of-order calls fail the admitted turn and block later sends.
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

When `--brunch-evidence-dir <attempt-directory>` is supplied, every settled `history()` read atomically refreshes `snapshot.json`, `transcript.md`, `trace.json`, `trace.md`, any recovered `workpiece.md` plus `workpiece-source.json`, and `manifest.json` in that directory before `brunch_turn` returns or handles a pending client tool. The snapshot is canonical; transcript, trace, and workpiece recovery are deterministic projections. This retention also occurs before host-none reports an unsupported client-tool suspension.

Create the protocol-owned `run.json` in the attempt directory before launch; it is included in `manifest.json` without being interpreted by the harness. After adding `validity.json` or `adjudication.md`, refresh all sibling hashes with `yarn workspace @apps/brunch-agent proof:manifest -- <attempt-directory>`. Temporary files and `manifest.json` itself are excluded from the manifest.

Pi's tool API requires TypeBox parameter schemas, so `typebox` is declared here for that Pi-facing boundary only. Brunch's own boundaries remain Valibot.

## Operating the harness

1. Start the local app with `yarn workspace @apps/brunch-agent dev`.
2. From `apps/brunch-agent`, launch Pi (directly or through Herdr) with a unique `PI_SUBAGENT_NAME`. Choose the persona model and thinking level with Pi's native `--model <provider/model>` and `--thinking <level>` options.
3. Supply the situation pack inline with the objective and turn budget. The extension treats this launch content as opaque Markdown or plain text and does not parse or validate a pack schema. An `@file` token in a launch task is not expanded into persona context.
   For comparable runs, use only the text below the `---` separator in the case's
   `opening-message.md` as the visible first turn; keep its header, the situation pack, and the
   oracle private. In a 6–10-turn run, bound the objective to the named incident and its immediate
   options rather than asking the persona to disclose the entire pack.
4. Wait until the first `brunch_turn` admission is visible in Pi.
5. Attach the browser to `http://127.0.0.1:4321/?mode=observe&principal=local&id=<PI_SUBAGENT_NAME>`.
6. After the run, inspect canonical history with `yarn workspace @apps/brunch-agent transcript -- --principal local --id <PI_SUBAGENT_NAME>`.

The restricted direct launch, run from `apps/brunch-agent`, is:

```sh
PI_SUBAGENT_NAME=<unique-conversation-id> pi \
  --model <provider/model> \
  --thinking <level> \
  --no-extensions \
  --extension .pi/extensions/brunch-persona-testing.ts \
  --no-builtin-tools \
  --tools brunch_turn \
  --no-skills \
  --no-prompt-templates \
  --no-context-files \
  --append-system-prompt .pi/extensions/brunch-persona-testing/SYSTEM.md \
  --brunch-tool-host real-headless \
  --brunch-headless-title "Persona evaluation" \
  --brunch-evidence-dir ../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/<campaign>/runs/<attempt-id> \
  --approve
```

For deterministic mocks, replace the last host options with:

```sh
--brunch-tool-host mock \
--brunch-tool-mocks ../../libs/@hashintel/brunch-agent/evaluations/protocols/<protocol>/client-tools.json
```

`--no-extensions` plus the one explicit `--extension` prevents dependence on unrelated active Pi extensions. Herdr can forward the same native Pi arguments after `--`; any Herdr companion/state extension is optional orchestration rather than part of the Brunch transport. The persona must never use a parent to obtain domain facts or decide how to answer.

The ordering in steps 4–5 is required by observed behavior. An observer opened before the Flue instance exists remains idle and does not discover later creation. Attaching after first admission catches up existing history and receives later streaming updates. Reloading after creation reconstructs settled messages.

[`evaluations/cases/vestera-scheduling/situation-pack.md`](../../../../../libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/situation-pack.md) is the current exemplar pack. Its Markdown sections are guidance for the persona model, not fields consumed by the extension.

## Attach to the actual Petrinaut browser session

This is developer/operator setup, not teammate-ready fixture delivery. It requires an initialized construction session in the existing local Petrinaut UI. It does not authorize a provider request: resolve the mission's credential/accounting stop and obtain explicit participant allocation before any real opening or persona call. The mechanical witness uses only a synthetic provider and test-authored utterances.

1. Open the locally configured Petrinaut URL with `?brunchTracer=root-creation`, leaving its synthetic labels intact. Open Chrome DevTools **Network**, then the normal AI panel. Send one benign ordinary opening (for example, “Hello, I would like to describe our process.”) and wait for the reply. This initializes the actual browser-generated document incarnation and conversation through the normal transport; do not make up IDs from a naming convention.
2. In Network select that first `POST /agents/chat/<instance-id>`. Privately copy its exact Request URL, the `x-brunch-principal` and `x-brunch-conversation` request-header values (check the current header names in `src/conversation/identity.ts` if they change), the unchanged `initialData` value from Request Payload, and only the `uid` from its successful 202 admission response. **Never export a HAR, cookies, authorization headers or whole responses.** Do not paste this configuration into a persona prompt or tool input.
3. Save an operator-only JSON file outside the repository with restrictive permissions (`chmod 600`). Its only keys are `url`, `principalKey`, `conversationId`, `initialData`, and `uid`, populated from those actual fields. `uid` is the Flue runtime incarnation, not the document incarnation or human-readable conversation ID. Keep this file out of logs and evidence meant for publication.
4. Add `--brunch-browser-session /absolute/private/session.json --brunch-tool-host none` to the restricted persona launch above, removing `real-headless`/mock options. The extension checks URL/ownership consistency and the production-created construction-binding signal through public history before registering the tool. Missing/foreign bindings refuse attachment. The first send conditionally verifies the runtime UID; it cannot recreate a deleted session. The captured initialData is a verification input, **not** a rebinding request.
5. Keep the same browser document open. The persona supplies substantive utterances through `brunch_turn`; Brunch creates revisions and evidence. The workpiece pane shows the agent's latest actual `brunch_workpiece` query result, not an independently reconstructed current state. Settling a revision without querying it leaves the pane explicitly stale; automatic query cadence remains an elicitor-quality question. The Brunch host follows canonical conversation messages without reload while the local panel is idle, and waits for canonical settlement of its own locally admitted turns before replacing local output.
6. After the persona stops, reload the same browser profile/document and continue via the normal composer. Do not clear local storage or change the selected document. This is original-store continuation, not portable import, crash recovery or simultaneous-writer support.

Browser attachment is currently workpiece-only. External pending client tools remain display-only in the following panel, including after reload, and `brunch_turn` with host `none` fails closed if such a tool is requested. It does not execute against a mock/headless substitute or submit browser result signals. Local UI-streamed browser tools retain their ordinary execution path. If an external turn requires browser work, stop and inspect its canonical history; do not retry or claim construction-host parity. The completion gate also refuses history missing a locally admitted settlement/response association (for example after unsupported retention loss), rather than guessing catch-up from message counts or text length.

`test/persona-browser.integration.ts` exercises this exact extension registration/configuration and input seam against the built mounted ChatAgent and real Chrome, with synthetic provider substitution, two source-linked workpiece revisions, identity/binding/UID negatives and normal UI continuation. It does not run a persona model or earn persona fidelity, semantic, utility or PM acceptance.

## Accountable two-participant launch

The app and persona share the **same original** `BRUNCH_STEP_A_ACCOUNTING` JSON configuration (`{"ledgerPath":"/absolute/original/usage-ledger.json","runId":"fresh-run-id"}`). The parent alone prepares the allocation. Do not copy the ledger or reuse an old activation. This also accounts for the browser's initialization opening and subsequent ordinary UI continuation while the configured server remains running.

The existing native provider wrapper is reused by the persona through public `pi.registerProvider(provider)`. App rows retain their Flue identity; persona rows contain `{kind:"pi",sessionId,requestId}`, using the actual Pi session ID and a fresh ID for each underlying native request. Pi's ordinary replies, tool continuations and native compaction use its model-runtime stream path; changing a summary's routing session ID does not change the owning Pi session. The wrapper observes both `stream` and `streamSimple`, caps output against the allocation, disables SDK retries, and accounts beneath admission. No model-callable accounting tool or second ledger is introduced.

Each ledger read–modify–write transaction exclusively creates `<ledgerPath>.lock`. Contention or a stale guard stops that process; it never waits, retries or steals the guard. The guard is released only by its owning transaction. A crash can leave it behind for parent investigation. Existing `journalPending` uncertainty remains a stop even if the guard is subsequently removed by an authorized operator. The initial row reserves as unknown before releasing the transaction, avoiding an unreserved interval between preparation and invocation. This is local coordinated access, not a remote-filesystem or power-loss guarantee.

An allocation may contain `reservation.acceptedUnknownSequences`, an explicit, unique list of existing unknown rows accepted by the parent. The original rows remain unknown and unchanged. Their hold is `max(reservedUsd, observed usage cost, observed partial-usage cost)`. All outstanding holds subtract from the global ceiling; accepted prior-run holds also subtract from this run's allocation, while same-run holds are counted once among this run's requests. The historical `totals.remainingUsd` continues to mean ceiling minus confirmed catalogue spend, **before** outstanding holds. A newly unknown request, journal uncertainty, nonexistent acceptance entry or exhausted allocation still stops dispatch. Only the parent may authorize sequence 6; tests exercise disposable synthetic rows instead.

Provision a **fresh**, private Pi configuration directory, not a copied config/auth/catalog directory. Inherit only the intended process credential from the parent; never put a key in argv, a prompt, evidence, or `--api-key`. Do not use `/login`, switch providers, reload configuration, or resume another Pi session during the run. Pi's stored/OAuth credentials precede environment credentials, so the fresh directory is required **before CLI startup**, not merely before inference. The extension checks that no saved credentials or model overrides are present, automatic/provider retries are disabled, and the public native auth resolver selected the intended process `ANTHROPIC_API_KEY`. It checks the resolved request key, exact model/API and native base URL again before invocation and dispatch. Pi may itself create an empty `auth.json` and an offline `models-store.json`; neither should be provisioned from an existing directory. Configuration checks do not authenticate a key remotely.

After parent review/allocation, start `yarn dev:brunch` with `BRUNCH_CHAT_MODEL=claude-sonnet-4-6` and the shared accounting configuration in the intended key-bearing environment. Capture the actual initialized browser session privately as above. From `apps/brunch-agent`, the persona launch is:

```sh
# ANTHROPIC_API_KEY is already inherited from the parent's intended source.
# BRUNCH_STEP_A_ACCOUNTING is already set to the original ledger and fresh run ID.
# Remove unintended auth-token/base-URL/proxy/DEBUG overrides before launching.
umask 077
personaConfig="$(mktemp -d "${TMPDIR:-/tmp}/brunch-persona.XXXXXX")"
printf '%s\n' '{"retry":{"enabled":false,"provider":{"maxRetries":0}}}' > "$personaConfig/settings.json"
export PI_CODING_AGENT_DIR="$personaConfig" PI_OFFLINE=1 PI_TELEMETRY=0
PI_SUBAGENT_NAME=<fresh-persona-name> pi \
  --model anthropic/claude-sonnet-4-6 --thinking medium \
  --no-extensions --extension .pi/extensions/brunch-persona-testing.ts \
  --no-builtin-tools --tools brunch_turn \
  --no-skills --no-prompt-templates --no-context-files \
  --append-system-prompt .pi/extensions/brunch-persona-testing/SYSTEM.md \
  --brunch-browser-session /absolute/private/session.json \
  --brunch-tool-host none \
  --brunch-evidence-dir /absolute/run-evidence-directory \
  --session-dir "$personaConfig/sessions" \
  --no-approve
```

Supply the approved context pack and objective privately in Pi's input; do not grant a file-reading tool. `--no-approve` excludes project settings; the explicitly selected extension and system policy still load. `PI_OFFLINE=1` prevents startup network operations, **not inference**. Retain the private native Pi session alongside the operator-owned evidence; the Pi session is not another spend authority. Host `none` remains workpiece-only and stops on external client-tool requests.

Verification: `test/provider-accounting.test.ts` exercises prior-unknown hold arithmetic, unchanged rows, new-unknown refusal, existing journal crash behavior, and actual two-process transaction contention/stale-guard refusal. `test/persona-request-accounting.test.ts` exercises the registered native provider against synthetic SSE responses, both stream entrypoints, distinct Pi request identities and credential/model refusal. These tests do not claim an actual persona conversation or an exercised CLI compaction. A restricted installed-Pi CLI load/configuration probe, under OS network denial with an intentionally absent disposable ledger, reached `Step A accounting refused` before native invocation; no extension/configuration error or ledger creation occurred.

**First-use stop condition:** installed ChatAgent split-turn compaction starts two summaries concurrently. The second reservation sees the first in-flight unknown, refuses and poisons that ledger instance; the first request then remains unknown with its hold retained. Independent synthetic execution of native Flue compaction reproduced this. The first serial elicitation may proceed with this explicit fail-stop limit; usable split compaction is not claimed. Stop and inspect if it occurs—do not retry, clear the hold or automatically accept the new unknown. Do not overlap ordinary UI submissions with the persona either. Pi's own split summaries are sequential, but actual CLI compaction remains unexercised.

**Usage limit:** this join records Pi's normalized usage and native response identity when present, with catalogue estimates—not invoices or universal raw terminal attestation. The old `real-provider-a5/native-response.ts` attester accepts a complete buffered SSE body and is called by that instrument's buffered transport before releasing bytes to Pi. It is not directly a streaming accounting hook; applying it here would require response buffering/transport work, which this join does not add. Its stricter raw-gated claims remain confined to that old instrument.

## Rejected alternatives and limits

- A nested `persona → elicitor subagent` topology, because it duplicates elicitor authority and bypasses the real boundary.
- Registering Brunch's tools with Pi, which would expose capabilities to the persona model and move execution to the wrong authority. The host is internal to `brunch_turn` and services only Flue-emitted calls.
- Injecting tool traces or host instructions into Brunch messages. Flue history is canonical; Pi details are an evaluation-side projection.
- Keeping the extension in the Brunch context root, which is not a package: it imported application internals across the lib/app boundary, its dependencies were declared elsewhere or nowhere, and no workspace lint or type-check task reached it.
- `pi-web`, a Herdr webview, PTY scraping, parent-mediated turn relaying, a second server, another model loop, or another transcript store.
- Reply recovery from the latest history entry, automatic user-message retries, pending-admission persistence, or cross-process adoption before a real consumer requires them.

The original evidence establishes a local, live-observable, multi-turn text path through real production code with singular writers, exact submission correlation, browser catch-up/streaming/reload, and transcript parity. The added host modes are covered by local contract tests and extension loading. They do not establish a paid live tool turn, deployed throughline, browser parity, full elicitation quality, persona fidelity across cases, repeatability, crash recovery, pre-creation observer discovery, or remote access.
