# Brunch agent application

## Run the Petrinaut panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The first step builds the Petrinaut libraries the panel imports (`dist/` and design-system
codegen). Then it starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut
website at `http://127.0.0.1:4915`. The website proxies `/api/chat` to Brunch. The panel talks to one Flue chat agent composed from the context-independent core prompt in `@hashintel/brunch-agent/flue`, the SDCPN/Petrinaut instructions, modelling runbook skill, and `readPetrinautDoc` client tool in `@hashintel/brunch-agent-plugin-sdcpn`, and app-owned deployment/transport material. The skill is activated via `activate_skill`, with supporting resources disclosed via `read_skill_resource`; the app's only model-facing diagnostic tool is `ping`. There is no generalized elicitation loop, sweep tool, or `brunch_ask` on this path. Capture is a harness-side pipe: an explicit settled range of Flue history is applied into a JSON store beside the conversation database, not by the interviewer.

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

## Production container

Build from the repository root:

```sh
yarn workspace @apps/brunch-agent build:docker
```

The image runs the generated `dist/server.mjs` under the repository-locked Node version as uid
`60000`. It listens on `PORT`, set to `3002` in the image, exposes the cheap liveness probe `GET /health`,
and requires Postgres plus an OTLP collector whenever `NODE_ENV=production`. Flue connects and
migrates its store before the server listens, so database configuration, connection, and migration
failures prevent readiness. `/health` reports process liveness only; it does not query Postgres or
Anthropic.

Production database configuration uses dedicated fields:

| Variable                      | Required when     | Purpose                                             |
| ----------------------------- | ----------------- | --------------------------------------------------- |
| `BRUNCH_POSTGRES_AUTH_MODE`   | Always            | `iam` or `password`                                 |
| `BRUNCH_POSTGRES_HOST`        | Always            | Exact RDS endpoint used for TLS and IAM signing     |
| `BRUNCH_POSTGRES_PORT`        | Always            | PostgreSQL port                                     |
| `BRUNCH_POSTGRES_DATABASE`    | Always            | Flue database                                       |
| `BRUNCH_POSTGRES_USER`        | Always            | PostgreSQL role                                     |
| `BRUNCH_POSTGRES_TLS_CA_PATH` | Always            | Path to the trusted RDS CA bundle                   |
| `BRUNCH_POSTGRES_AWS_REGION`  | IAM               | Region used by the RDS signer                       |
| `BRUNCH_POSTGRES_PASSWORD`    | Password fallback | Runtime-injected database password                  |
| `HASH_OTLP_ENDPOINT`          | Always            | HASH OTLP/gRPC collector endpoint                   |
| `OTEL_SERVICE_NAME`           | Optional          | OTel service name; defaults to `Brunch Agent`       |
| `OTEL_RESOURCE_ATTRIBUTES`    | Optional          | Standard deployment/resource correlation attributes |

`DATABASE_URL`, `BRUNCH_DEV_DB_PATH`, and `BRUNCH_CHAT_DB_PATH` are rejected in production.
TLS verification is always enabled, and connection acquisition fails after 10 seconds rather than
waiting indefinitely. IAM mode uses the task credential chain and asks the RDS signer for a fresh
token whenever `pg` opens a physical connection. Run the real two-connection probe from the
selected task role and RDS network boundary:

```sh
yarn workspace @apps/brunch-agent probe:rds-iam
```

The application exports content-free Flue traces, logs, and metrics: prompts, responses, tool
payloads, exception messages, and credentials are not recorded. The generated Flue shutdown
lifecycle drains active work, disposes its instrumentation, closes Postgres, and flushes the
application-owned OTel providers. Configure the ECS task with init handling and a stop timeout that
accommodates Flue's 60-second outer shutdown window.

Only `/api/chat` should be reachable by the restricted diagnostic caller. The load balancer or
access boundary must not expose `/`, `/assets/*`, or `/agents/chat/:id`; caller-supplied principals,
CORS, and conversation hashes are not authentication. Desired count remains one until
same-conversation ownership across replicas is separately proven.

The deployed chat path stores Flue conversations, submissions, compaction records, attachments,
claims, leases, and settlement state in Postgres. The separate Brunch capture store is not used by
that path and remains local-development machinery; enabling capture in a deployment requires a new
durability decision.

For a restricted remote turn, provide `BRUNCH_SMOKE_BASE_URL`,
`BRUNCH_SMOKE_PRINCIPAL`, and a stable `BRUNCH_SMOKE_CONVERSATION_ID`. Reuse
that ID for the post-replacement history check and set
`BRUNCH_SMOKE_EXPECTED_TEXT` to text persisted by the turn; history mode fails
unless that text is present.

```sh
yarn workspace @apps/brunch-agent smoke:deployment
BRUNCH_SMOKE_MODE=history yarn workspace @apps/brunch-agent smoke:deployment
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
