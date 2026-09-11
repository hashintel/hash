# Brunch agent application

## Run the Petrinaut panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The first step builds the Petrinaut libraries the panel imports (`dist/` and design-system codegen). Then it starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut website at `http://127.0.0.1:4915`. The website proxies `/agents/chat/*` to Brunch without changing the request origin or Flue protocol. The typed panel and Voice mode talk to one Flue chat agent composed from the context-independent core prompt in `@hashintel/brunch-agent/flue`, the SDCPN/Petrinaut instructions, modelling runbook skill, and `readPetrinautDoc` client tool in `@hashintel/brunch-agent-plugin-sdcpn`, and app-owned deployment material. The skill is activated via `activate_skill`, with supporting resources disclosed via `read_skill_resource`; the app's only model-facing diagnostic tool is `ping`. There is no generalized elicitation loop, sweep tool, or `brunch_ask` on this path. Capture is a harness-side pipe: an explicit settled range of Flue history is applied into a JSON store beside the conversation database, not by the interviewer.

A headless Mission 3 drive (simulated expert, same `ChatAgent` door):

```sh
yarn workspace @apps/brunch-agent runbook:headless
```

`ANTHROPIC_API_KEY` is required. `BRUNCH_CHAT_MODEL` selects the interviewer (default `claude-sonnet-4-5` for this script only). Artifacts write under `apps/brunch-agent/.data-wipe-me/evaluations/vestera-runbook-headless/` unless `BRUNCH_RUNBOOK_OUTPUT_DIR` is set. The command prints the resulting path. Do not promote that directory into the repository.

By default outside production, conversations persist in SQLite at `apps/brunch-agent/.data-wipe-me/conversations.db`. `BRUNCH_DEV_DB_PATH` overrides that local path. Capture envelopes for one Flue conversation sit beside that sqlite file, named by the hashed instance id (`<instanceId>.json`). The hermetic browser-transport test uses `BRUNCH_CHAT_DB_PATH` and writes the capture file in that same directory. Flue history is the conversation log; the capture store is not a second transcript. The panel rehydrates from the SDK's canonical conversation observation and does not resubmit or replay settled turns.

The mounted Flue URL `/agents/chat/:instanceId` requires the principal and logical conversation identity in `x-brunch-principal` and `x-brunch-conversation`. The path id is the hash of those values, not a bearer token or trusted authentication.

Print a human-readable transcript of one conversation from that same Flue history (server already running):

```sh
yarn workspace @apps/brunch-agent transcript -- --principal <key> --id <conversationId>
```

## Local Postgres for fixture-producing development

Set `BRUNCH_DB_KIND=postgres` explicitly to use the existing Postgres adapter and migrations locally. An unset selector defaults to SQLite outside production; `BRUNCH_DB_KIND=sqlite` also selects that lightweight path. Production always requires Postgres (selector unset or `postgres`), and rejects `sqlite`. Selector values are exact and case-sensitive; blank or unknown values fail.

For an already provisioned isolated local Postgres with TLS, export the following in the shell that starts development (substitute your actual endpoint, port, database, role and trusted CA path):

```sh
export NODE_ENV=development
export BRUNCH_DB_KIND=postgres
export BRUNCH_POSTGRES_AUTH_MODE=password
export BRUNCH_POSTGRES_HOST=localhost
export BRUNCH_POSTGRES_PORT=5432
export BRUNCH_POSTGRES_DATABASE=brunch_fixture
export BRUNCH_POSTGRES_USER=brunch_fixture
export BRUNCH_POSTGRES_TLS_CA_PATH=/absolute/path/to/local-postgres-ca.pem
# Inject BRUNCH_POSTGRES_PASSWORD securely into this shell; do not commit it.
unset BRUNCH_POSTGRES_AWS_REGION DATABASE_URL BRUNCH_DEV_DB_PATH BRUNCH_CHAT_DB_PATH
yarn dev:brunch
```

Local Postgres uses the same required fields and authentication validation as production (see below). TLS verification remains mandatory: the certificate must match `BRUNCH_POSTGRES_HOST` and chain to the supplied CA. IAM remains available with `BRUNCH_POSTGRES_AUTH_MODE=iam` and `BRUNCH_POSTGRES_AWS_REGION`, with the password unset. Missing or invalid required fields fail; there is no fallback to SQLite. Postgres rejects `DATABASE_URL` and both SQLite path overrides. SQLite rejects any supplied `BRUNCH_POSTGRES_*` field listed below, including empty values, rather than silently ignoring a missing or contradictory selector. To return to SQLite, unset those Postgres fields and unset `BRUNCH_DB_KIND` (or set it to `sqlite`).

This selects the Flue conversation store only; it does not export/seed fixtures or make the separate filesystem capture/accounting stores portable. The usual provider configuration is independent; selecting Postgres grants no provider-call or target-write permission.

## Production container

Build from the repository root:

```sh
yarn workspace @apps/brunch-agent build:docker
```

The image runs the generated `dist/server.mjs` under the repository-locked Node version as uid
`60000`. It listens on `PORT`, set to `3002` in the image, exposes the cheap liveness probe `GET /health`,
and requires the `BRUNCH_POSTGRES_*` variables plus `HASH_OTLP_ENDPOINT` whenever
`NODE_ENV=production`. Flue connects and migrates its store before the server listens, so database
configuration, connection, and migration failures prevent readiness. An unreachable collector does
not: export failures surface as OpenTelemetry diagnostics on stderr. `/health` reports process
liveness only; it does not query Postgres or Anthropic.

Production database configuration uses dedicated fields:

| Variable                      | Required when | Purpose                                                                                                   |
| ----------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `BRUNCH_POSTGRES_AUTH_MODE`   | Always        | `iam` or `password`                                                                                       |
| `BRUNCH_POSTGRES_HOST`        | Always        | Exact RDS endpoint used for TLS and IAM signing                                                           |
| `BRUNCH_POSTGRES_PORT`        | Always        | PostgreSQL port                                                                                           |
| `BRUNCH_POSTGRES_DATABASE`    | Always        | Flue database                                                                                             |
| `BRUNCH_POSTGRES_USER`        | Always        | PostgreSQL role                                                                                           |
| `BRUNCH_POSTGRES_TLS_CA_PATH` | Always        | Trusted RDS CA bundle; the image sets it to the bundled AWS global bundle, override only for another CA   |
| `BRUNCH_POSTGRES_AWS_REGION`  | IAM only      | Region used by the RDS signer; rejected in password mode                                                  |
| `BRUNCH_POSTGRES_PASSWORD`    | Password only | Runtime-injected database password; rejected in IAM mode                                                  |
| `HASH_OTLP_ENDPOINT`          | Always        | HASH OTLP/gRPC collector endpoint                                                                         |
| `OTEL_SERVICE_NAME`           | Optional      | OTel service name; defaults to `Brunch Agent`                                                             |
| `BRUNCH_CORS_ALLOWED_ORIGINS` | Optional      | Browser JavaScript allowlist for `/agents/*`: exact origins or `https://*.domain`; blank grants no access |

`BRUNCH_CORS_ALLOWED_ORIGINS` is a comma-separated list of origins whose browser JavaScript may
read cross-origin responses from `/agents/*`. An entry is either an exact origin or a wildcard for
exactly one leading host label, which covers per-branch preview deployments. For example:

```sh
BRUNCH_CORS_ALLOWED_ORIGINS=https://app.example.com,https://*.preview.example.com
```

`https://*.preview.example.com` admits `https://feature-x.preview.example.com` but not
`https://preview.example.com`, `https://a.b.preview.example.com`, or another scheme or port. The
wildcard must be the whole first label in front of a domain with at least two labels. Non-root
paths, queries, fragments, credentials, and non-HTTP(S) schemes are rejected. Missing or blank
configuration grants no cross-origin browser access while preserving same-origin requests. CORS
controls browser JavaScript access; it is not a server-side access gate and does not restrict
non-browser callers. The deployment still requires its separate identity, authorization, ingress,
and rate-limit gates.

`DATABASE_URL`, `BRUNCH_DEV_DB_PATH`, and `BRUNCH_CHAT_DB_PATH` are rejected in production.
TLS verification is always enabled, and connection acquisition fails after 10 seconds rather than
waiting indefinitely. IAM mode uses the task credential chain and asks the RDS signer for a fresh
token whenever `pg` opens a physical connection. Run the real two-connection probe from the
selected task role and RDS network boundary:

```sh
yarn workspace @apps/brunch-agent probe:rds-iam
```

The application exports Flue traces, logs, and metrics through HASH's shared OpenTelemetry setup
(`@local/hash-backend-utils/opentelemetry`) with Flue content capture disabled: prompts, responses,
tool payloads, and credentials are not recorded, and the app's own failure spans carry an error code
rather than a message. On SIGTERM Flue drains active work for up to 30 seconds, then closes the
Postgres runner, whose close hook shuts the OpenTelemetry providers down; a 60-second outer timer
force-exits. Give the ECS task a stop timeout above 60 seconds.

Brunch does not mount the retired `/api/chat` path; requests to it return 404.
`/agents/chat/:instanceId` is the product door required by Petrinaut. Restricted product traffic
is that Flue mount: allow `/agents/*` on the Brunch service so the current `chat` name and the
accepted later `/agents/process-sdcpn/:id` name both fit. Keep `GET /health` as a process-local /
load-balancer-private probe, not a public hostname path. Deny `/` and `/assets/*`. Stock
Petrinaut `/api/chat` stays on the website; the accepted later website path is `/api/brunch/:id`.
Releasing `/agents/*` to production browser ingress requires separate authentication,
authorization, ingress, and rate/spend gates. CORS, caller-supplied principals, and conversation
hashes are not authentication. Desired count remains one until same-conversation ownership
across replicas is separately proven.

The deployed chat path stores Flue conversations, submissions, compaction records, attachments,
claims, leases, and settlement state in Postgres. The separate Brunch capture store is not used by
that path and remains local-development machinery; enabling capture in a deployment requires a new
durability decision.

For a restricted remote turn, provide `BRUNCH_SMOKE_BASE_URL`,
`BRUNCH_SMOKE_PRINCIPAL`, and a stable `BRUNCH_SMOKE_CONVERSATION_ID`;
`BRUNCH_SMOKE_PROMPT` and `BRUNCH_SMOKE_REQUEST_ID` are optional overrides. The
turn must stream assistant text and finish within two minutes. Reuse the
conversation ID for the post-replacement history check and set
`BRUNCH_SMOKE_EXPECTED_TEXT` to text persisted by the turn; history mode fails
unless that text is present.

```sh
yarn workspace @apps/brunch-agent smoke:deployment
BRUNCH_SMOKE_MODE=history yarn workspace @apps/brunch-agent smoke:deployment
```

`smoke:deployment` still posts to `/api/chat`. That matches today's `main` image and will fail
against this branch's image until a Mission 8 successor retargets it to `/agents/chat/:instanceId`.

## Panel and Voice conversation route

Voice is a second input modality over the panel's conversation. It is not a Voice route and does not own provider audio or durable conversation state.

|                       |                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | `/agents/chat/:instanceId`, called through the public Flue browser client and the same-origin local proxy                         |
| Identity              | `x-brunch-principal` plus `x-brunch-conversation`; the server verifies that their hash matches the mounted instance id            |
| Initial turn          | One `FlueClient.send()` carrying `{ kind: "user", body }`                                                                         |
| Client-tool follow-up | One `FlueClient.send()` carrying the `client-tool-result` signal for completed client-tool parts, correlated by `toolCallId`      |
| Response              | `FlueClient.wait()` chunks projected into one finite AI SDK UI-message stream; observation/history provides canonical rehydration |

Typed and finalized spoken turns use this same route. The panel's explicit **Stop** requests a conversation-wide Flue abort before cancelling its local stream. Local Voice interruption stops playback only and leaves canonical history unchanged.
