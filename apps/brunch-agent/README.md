# Brunch agent application

## Run the Petrinaut panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The first step builds the Petrinaut libraries the panel imports (`dist/` and design-system
codegen). Then it starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut
website at `http://127.0.0.1:4915`. The website proxies `/api/chat` to Brunch. The panel talks to one plain
Flue chat agent: streamed text and reasoning, one server `ping` tool, one stub
skill (`confirm-path`, activated via `activate_skill`), and the existing Petrinaut
`readPetrinautDoc` client tool. There is no elicitation loop, sweep tool, or
`brunch_ask` on this path. Capture is a harness-side pipe: an explicit settled
range of Flue history is applied into a JSON store beside the conversation
database, not by the interviewer.

Conversations persist in `apps/brunch-agent/.data-wipe-me/conversations.db`. `BRUNCH_DEV_DB_PATH`
overrides that local path. Capture envelopes for one Flue conversation sit beside that sqlite
file, named by the hashed instance id (`<instanceId>.json`). The hermetic `/api/chat` test uses
`BRUNCH_CHAT_DB_PATH` and writes the capture file in that same directory. Flue history is the
conversation log; the capture store is not a second transcript. The browser may cache messages
but reload hydrates from `GET /api/chat?id=`.

The mounted Flue URL `/agents/chat/:id` requires the same principal and conversation identity (`x-brunch-principal` and `x-brunch-conversation`) as `/api/chat`; the path id is the hash of those, not a bearer token.

Print a human-readable transcript of one conversation from that same Flue history (server already
running):

```sh
yarn workspace @apps/brunch-agent transcript -- --principal <key> --id <conversationId>
```

## Voice dock

A second input modality joins the same chat door. It is not a voice route and does not own
provider audio or session state.

|                       |                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | `POST /api/chat` (and `GET /api/chat?id=` to hydrate)                                                                                           |
| Identity              | `x-brunch-principal` plus body `id` (the conversation id). The server hashes those into the Flue instance id.                                   |
| Initial turn          | JSON `{ id, trigger: "submit-message", messages }` whose last user text part is the utterance.                                                  |
| Client-tool follow-up | Same POST, with `messageId` of the assistant message and completed client-tool parts (`providerExecuted` not true). Correlated by `toolCallId`. |
| Response              | AI SDK UI-message stream (SSE).                                                                                                                 |

`OPTIONS /api/chat` is the CORS preflight for that same contract.
