# Next concerns

Scratchpad, not a mission. [`MISSION.md`](MISSION.md) remains execution authority. Do not
implement from this file. Do not declare a next-mission focus until planning is resolved. When a
focus is cut into a new `MISSION.md`, leave everything that did not make the cut here.

Horizon may be longer than one mission. Items are collected, not ranked. Several notes below were
spoken of as “mission 2”; that names a cluster, not a cut.

## From Mission 1 Deferred

Mission 2 may add the first Brunch-owned behavior only after this proof is complete: mechanically
sweep one explicit settled transcript range into durable, source-linked capture and prove
idempotent reapplication. Extraction quality, plugin/repertoire machinery, IR, completion, and
review/revise remain out of scope until separately earned.

Target-document association (sessions and artifacts attached to one elicitation case, distinct
from the Petrinaut canvas net) is this same deferred material, crossed with session identity
below.

## Session identity and the Petrinaut net lifecycle

Working assumption: the Petrinaut **net id** is the discriminator that ties one Flue conversation
to one canvas document for a principal. Today the demo stores a random UUID per net id in
`brunch-conversation-id-v1` and pins it on the AI SDK transport. KA’s preview uses a deterministic
`petrinaut-preview:${netId}`. Both assume the net id is stable.

A later mission must prove that Petrinaut create / save / load of a net is also the session
lifecycle: same principal, same net id, same Flue conversation after save and reload; a **new**
net id mints a new conversation rather than splicing. If net ids prove unstable (regenerated on
save, collide, or differ between demo localStorage and HASH entities), drop the assumption and
pick another discriminator.

Compaction is Flue-default and unpinned. Slate a later mission to prove the panel and transcript
still reconstruct across a real compaction boundary (`compaction-vs-durable-history` / FE-1386),
and only then whether a product control to compact or to show a summarized range is needed.

New-session-for-the-same-user is “mint another conversation id, keep the principal.” Resume is
reload of the same net. Those are enough once the net-id discriminator is proven.

## Observability

Prove OTel on the brunch-agent process: Node SDK + OTLP to HASH’s existing collector/Tempo, Flue
`instrument(createOpenTelemetryInstrumentation({ content: false }))` actually exporting. Confirm
`gen_ai.conversation.id` is the Flue instance id. Note Flue’s present limit: `dispatch()` (the
`/api/chat` path) does not propagate `traceparent`. Content capture stays off until a privacy
policy exists. KA’s FE-1505 / FE-1423 remain the production gates.

## Voice: stack on KA

Mission branches may stack on `kostandin/h-6763-openai-canonical-speech` so the dock Mission 1
named is the composer `submitText` already aimed at `POST /api/chat`. Resolve there: one
conversation-id scheme (UUID-per-net vs `petrinaut-preview:${netId}`), brunch-configured vs
stolen `/api/chat`, and `submitText` with no `brunch_ask` yet. Brunch still owns no provider
audio or session state.

## Keep the adapter

The Petrinaut panel stays on `useChat` / `onToolCall`. Brunch-agent stays a Flue backend behind
the AI SDK door (`@hashintel/brunch-agent-transport-aisdk`). Do not rewrite the panel onto
`@flue/react` in order to “do Flue properly.”

`@flue/react` remains appropriate for brunch-agent's local debug UI and for surfaces that only
watch a conversation. Cheap debug improvement: render `dynamic-tool` / `data-*` on `:4321`.

AI SDK 7 `HarnessAgent` is the converse of this door: it wants the route to resume a harness
session by chat id instead of replaying UI history into a model. Flue already owns that session;
`transport-aisdk` is the UI-stream adapter. A future `HarnessAgent` (Pi / Claude Code as the
harness) would be another substrate, which is exactly what `binding-flue` exists to isolate — or
a replacement of Flue, not a small add-on. Leave that undecided.

## Two brains, same panel

A person using the Petrinaut demo should be able to choose the stock modeller or the Brunch Flue
agent without relaunching. Today the only switch is launch-time exclusive occupancy: `yarn dev`
serves stock `/api/chat`; `yarn dev:brunch` removes that handler and proxies the same route to
Brunch. KA’s preview instead gates voice on “Brunch is configured” and can keep a separate
endpoint.

Locked so far:

- Brunch does not become the new Petrinaut assistant.
- The panel stays the existing AI SDK assistant; only which brain it talks to would change.
- Stock keeps the modeller (OpenAI, `petrinautAiPrompt`, 46 client tools).
- Brunch keeps Mission 1's chat (`ping`, `readPetrinautDoc`, Flue history).
- Switching must not splice conversations.
- Stock must keep working with brunch-agent not running.
- HASH embed and the production demo stay on the stock modeller unless explicitly opted in.

Open:

- How both backends are reachable from one origin (a second same-origin route, a proxy that does
  not steal `/api/chat`, or two origins in the transport).
- Where the picker lives (demo shell, panel chrome, URL). Host concern, not a Petrinaut-library
  assistant type.
- Whether switching is allowed mid-net or only when starting a conversation.

## Brunch will need Petrinaut read/write

Brunch is a second assistant that will need tools to read and write the live net, somehow. That
is shared panel I/O (the existing client `onToolCall` runtime), not Brunch absorbing the modeller
prompt or the 46-tool set. Which reads and writes, and when, are not decided.

## Headless interview surfaces (agent-drive)

Earlier phases already ran agents on both sides of a conversation and kept desk evidence:

- Conditions 1, 2, 4: [`evaluations/protocols/process-model-elicitation/baseline/run.ts`](evaluations/protocols/process-model-elicitation/baseline/run.ts)
  — two isolated Anthropic chats, checkpoints, transcripts under
  [`docs/evidence/evaluations/process-model-elicitation/baseline/`](docs/evidence/evaluations/process-model-elicitation/baseline/).
- Condition 5: [`harness-run.ts`](evaluations/protocols/process-model-elicitation/baseline/harness-run.ts)
  — Flue `send` / `wait` / `history` over `app.fetch`, interleaved harness facts (`brunch_ask`,
  sweep, signals, folded capture store). Evidence:
  [`transcripts/condition-5.md`](docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-5.md).
  **Broken on the Mission 1 app**: it still imports deleted `sdcpn-elicitor`, `SDCPN_AGENT_ROUTE`,
  and `target-document-path`.
- Desk replay: static scoring over frozen transcripts, no runtime.

These are batch jobs that write files. They are excellent after-the-fact evidence and poor
surfaces for an agent to drive live: no turn-by-turn REPL, no streaming parts, PTY/log polling
if you wrap the script. The drive pattern worth keeping is condition 5’s JS-API loop
(`createFlueClient` → `send` → `wait` → `history`) against a live conversation URL — that is
already how Mission 1 transcript/bonus reads work. Restore that loop when elicitation returns;
do not invest in a TUI for agent operators. Petrinaut client tools still need the AI SDK door
or an explicit stand-in.

## Package layout (when the chat agent moves into libs)

```
libs/@hashintel/brunch-agent/
  packages/transport-aisdk/   # HTTP door (already)
  packages/<chat-agent>/      # ChatAgent + ping + readPetrinautDoc
  packages/binding-flue/      # elicitation dialect; off the Mission 1 door until earned
  packages/core/              # harness; same
apps/brunch-agent/            # shell: app.ts, db.ts, CORS, Vite, local UI, petrinaut proxy
apps/petrinaut-website/       # panel, identity, voice, demo-only exploded views
```

`binding-flue` stays a package even if it is the only binding. The app is not a substitute for
it. Exploded-view prototypes of net state belong on petrinaut-website host routes, not on
`:4321`.

## Out of scope for next missions

- A HASH embed path that talks to Brunch.
