# Brunch agent application

## Run the Petrinaut panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The first step builds the Petrinaut libraries the panel imports (`dist/` and design-system
codegen). Then it starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut
website at `http://127.0.0.1:4915`. The website proxies `/agents/chat/*` to Brunch without
changing the request origin or Flue protocol. The typed panel and Voice mode talk to one Flue
chat agent composed from the context-independent core prompt in
`@hashintel/brunch-agent/flue`, the SDCPN/Petrinaut instructions, modelling runbook skill, and
`readPetrinautDoc` client tool in `@hashintel/brunch-agent-plugin-sdcpn`, and app-owned
deployment material. The skill is activated via `activate_skill`, with supporting resources
disclosed via `read_skill_resource`; the app's only model-facing diagnostic tool is `ping`.
There is no generalized elicitation loop, sweep tool, or `brunch_ask` on this path. Capture is a
harness-side pipe: an explicit settled range of Flue history is applied into a JSON store beside
the conversation database, not by the interviewer.

A headless Mission 3 drive (simulated expert, same `ChatAgent` door):

```sh
yarn workspace @apps/brunch-agent runbook:headless
```

`ANTHROPIC_API_KEY` is required. `BRUNCH_CHAT_MODEL` selects the interviewer
(default `claude-sonnet-4-5` for this script only). Artifacts write under
`libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-runbook-headless/`
unless `BRUNCH_RUNBOOK_OUTPUT_DIR` is set.

Conversations persist in `apps/brunch-agent/.data-wipe-me/conversations.db`. `BRUNCH_DEV_DB_PATH`
overrides that local path. Capture envelopes for one Flue conversation sit beside that sqlite
file, named by the hashed instance id (`<instanceId>.json`). The hermetic browser-transport test
uses `BRUNCH_CHAT_DB_PATH` and writes the capture file in that same directory. Flue history is
the conversation log; the capture store is not a second transcript. The panel rehydrates from
the SDK's canonical conversation observation and does not resubmit or replay settled turns.

The mounted Flue URL `/agents/chat/:instanceId` requires the principal and logical conversation
identity in `x-brunch-principal` and `x-brunch-conversation`. The path id is the hash of those
values, not a bearer token or trusted authentication.

Print a human-readable transcript of one conversation from that same Flue history (server already
running):

```sh
yarn workspace @apps/brunch-agent transcript -- --principal <key> --id <conversationId>
```

## Panel and Voice conversation route

Voice is a second input modality over the panel's conversation. It is not a Voice route and does
not own provider audio or durable conversation state.

|                       |                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | `/agents/chat/:instanceId`, called through the public Flue browser client and the same-origin local proxy                         |
| Identity              | `x-brunch-principal` plus `x-brunch-conversation`; the server verifies that their hash matches the mounted instance id            |
| Initial turn          | One `FlueClient.send()` carrying `{ kind: "user", body }`                                                                         |
| Client-tool follow-up | One `FlueClient.send()` carrying the `client-tool-result` signal for completed client-tool parts, correlated by `toolCallId`      |
| Response              | `FlueClient.wait()` chunks projected into one finite AI SDK UI-message stream; observation/history provides canonical rehydration |

Typed and finalized spoken turns use this same route. The panel's explicit **Stop** requests a
conversation-wide Flue abort before cancelling its local stream. Local Voice interruption stops
playback only and leaves canonical history unchanged.
