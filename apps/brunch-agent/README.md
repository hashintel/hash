# Brunch agent application

## Run the Petrinaut panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The command starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut website at
`http://127.0.0.1:4915`. The website proxies `/api/chat` to Brunch. The panel talks to one plain
Flue chat agent: streamed text and reasoning, one server `ping` tool, and the existing Petrinaut
`readPetrinautDoc` client tool. There is no elicitation, capture, or `brunch_ask` on this path.

Conversations persist in `apps/brunch-agent/.data-wipe-me/conversations.db`. `BRUNCH_DEV_DB_PATH`
overrides that local path. Flue history is the conversation log; the browser may cache messages
but reload hydrates from `GET /api/chat?id=`.

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
