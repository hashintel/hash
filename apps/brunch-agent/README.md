# Brunch agent application

## Run the Petrinaut panel locally

Brunch runs `DEFAULT_CHAT_MODEL` from `src/shared/chat-model.ts` unless a deployment overrides it with `BRUNCH_CHAT_MODEL` and `BRUNCH_CHAT_THINKING`. An overriding `BRUNCH_CHAT_MODEL` runs without a thinking level unless `BRUNCH_CHAT_THINKING` sets one. From the repository root, make `OPENAI_API_KEY` available and run:

```sh
yarn dev:brunch
```

The first step builds the Petrinaut libraries the panel imports (`dist/` and design-system codegen). Then it starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut website at `http://127.0.0.1:4915`. The website proxies `/agents/*` to Brunch without changing the request origin or Flue protocol. Local development loads `apps/brunch-agent/.env.development`, selecting `openai/gpt-5.6-sol` with low reasoning by default, like the persona launcher. An explicit process environment or app-local `.env.local` can override these values; deployment model settings are separate and not established by this dev default. A configured credential does not authorize a paid run. When Brunch is selected, the typed panel and Voice mode bind the conversation to the open document: Brunch mounts its system prompt, its `eliciting`, `modelling` and `petrinaut` skills, the Ledger tools (`ledger_commit`, `ledger_compile`), the `readNetOutline` and `readNetStructure` net readers, the reviewed experiment draft, `query_basis`, and the complete canonical `petrinautAiTools` catalogue. It mounts no instruction besides the system prompt; Petrinaut, runtime and experiment guidance live in its skills and tool descriptions. Petrinaut retains canonical schemas, execution, and model-visible outputs.

Native Stock remains a separate assistant choice; `VITE_PETRINAUT_DEFAULT_ASSISTANT` selects native Stock or Brunch.

For browser-visible persona testing, use the [persona launcher and operator guide](evals/petrinaut/persona/README.md):

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing --agent claude
```

The launcher opens a dedicated Chrome window, pauses for recording readiness, then lets any coding agent play the simulated person: the agent talks to Brunch through a small command-line helper, and the launcher types each message into the real panel. Petrinaut's stock tool calls update the visible net. Select any listed case or a directory containing `situation-pack.md` and `opening-message.md`. There is no automatic budget cutoff; native usage is retained. The guide owns prerequisites, stop/resume and evidence instructions; consult it before paid execution.

By default outside production, conversations persist in SQLite at `apps/brunch-agent/.data-wipe-me/conversations.db`. `BRUNCH_DEV_DB_PATH` overrides that local path. Flue history is the conversation log. The panel rehydrates from the SDK's canonical conversation observation and does not resubmit or replay settled turns.

The mounted Flue URL `/agents/petrinaut/:instanceId` requires the owner key and logical conversation identity in `x-brunch-principal` and `x-brunch-conversation`. The path id is the hash of those values, not a bearer token or trusted authentication.

Provider admission bounds a dispatch with no model event at 60 seconds and bounds both newly opened and active reasoning silence at 120 seconds. These phase-specific limits tolerate supported reasoning models that legitimately pause for tens of seconds: an observed valid continuation exceeded the former 15-second first-reasoning-delta limit, then its sole retry exceeded the former 10-second between-delta limit. On expiry Brunch cancels the invocation, requires cancellation acknowledgement within two seconds, and permits at most one retry only before any tool call completed; completed tool work is never replayed. Tests may shorten these bounds with `BRUNCH_MODEL_STREAM_FIRST_EVENT_TIMEOUT_MS`, `BRUNCH_MODEL_STREAM_REASONING_START_TIMEOUT_MS`, `BRUNCH_MODEL_STREAM_IDLE_TIMEOUT_MS`, and `BRUNCH_MODEL_STREAM_CANCELLATION_TIMEOUT_MS`; non-test deployments always use the production policy.

Print a human-readable transcript of one conversation from that same Flue history (server already running):

```sh
yarn workspace @apps/brunch-agent transcript -- --owner-key <key> --id <conversationId>
```

## Agents

Each agent lives in its own directory under `src/agents/` and is registered in `src/agents/index.ts`, which `src/app.ts` mounts under `/agents/<route>`. The Petrinaut agent, `src/agents/petrinaut/`, holds everything its model reads and every Ledger tool: `prompts/`, `skills/`, `tools/`, `guidance.ts` and `agent.ts`. Mechanics every agent calls (the Petrinaut browser tools, net freshness, the browser-call rendezvous, the context projection) live in `src/shared/`, and server plumbing in `src/server/`; Flue finds `src/app.ts` and `src/db.ts` at the source root.

To try a candidate, copy `src/agents/petrinaut/` to `src/agents/petrinaut-alt-<idea>/`, give its agent a new `agentName` (conversation storage keys on it), and register it with `route: "petrinaut-alt-<idea>"` and `devOnly: true`, which keeps it off a production server. Its persona evaluations live in `evals/petrinaut/`. The architecture of the Petrinaut agent, its Ledger and its browser boundary is in [`docs/petrinaut/ARCHITECTURE.md`](docs/petrinaut/ARCHITECTURE.md).

## Tests

Neither `test:unit` nor `test:integration` needs anything running. `test:integration` checks the built app, starting it as a server and loading it in process with scripted OpenAI responses on the default model.

The app exports its harness for the built server under `@apps/brunch-agent/testing/*` (`test/load-built-application.ts` and `test/integration/run-admission-controls.ts`). Its one consumer is `tests/petrinaut-brunch-integration`, which runs the Petrinaut website's Brunch code against the built app.

The `test:manual:*` scripts are not part of either suite and do not run in CI. `test:manual:browser` builds the website and drives it in the local macOS Chrome against the built app.

`test:manual:browser:persona` exercises the persona helper through that same browser boundary, using only synthetic model responses. It checks opening and subsequent admissions, current-turn approvals, and an unanswered approval left visible by a transport failure. Run it once for each supported endpoint:

```sh
yarn workspace @apps/brunch-agent test:manual:browser:persona
VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/brunch-agent test:manual:browser:persona
```

The transport-failure case starts with an unanswered ordinary composer turn. It reproduces the stale-panel failure at the persona helper's entrypoint; it does not claim that a sequence made exclusively of persona turns reaches that starting state.

`test:manual:browser:experiment-results` runs a reviewed experiment through the real editor, sends its results to Brunch, and asks a follow-up in the same conversation. The fixture has seven waiting orders and three completed orders, with no transitions. Scripted mode checks the computed results, their delivery to the model, follow-up context, and that answering neither runs another experiment nor changes the net. It costs no model calls.

```sh
yarn workspace @apps/brunch-agent test:manual:browser:experiment-results
# Only with explicit model and spend approval; up to three conversation turns:
BRUNCH_CHAT_MODEL=openai/gpt-5.5-2026-04-23 BRUNCH_CHAT_THINKING=medium yarn workspace @apps/brunch-agent test:manual:browser:experiment-results --live
```

Live mode uses the configured model, or Brunch's default, and retains the actual results, replies, history and screenshots in the printed temporary directory. Review the replies against the results: seven waiting, three completed, 30% completed, and no evidence of processing speed from a static snapshot. The live completion marker means evidence was recorded, not that explanation quality passed. Neither mode establishes retrieval of a saved experiment in a different conversation.

## Local Postgres

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

This selects the Flue conversation store only; it does not export/seed fixtures or make the separate filesystem accounting store portable. The usual provider configuration is independent; selecting Postgres grants no provider-call or target-write permission.

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
token whenever `pg` opens a physical connection.

The application exports Flue traces, logs, and metrics through HASH's shared OpenTelemetry setup
(`@local/hash-backend-utils/opentelemetry`) with Flue content capture disabled: prompts, responses,
tool payloads, and credentials are not recorded, and the app's own failure spans carry an error code
rather than a message. On SIGTERM Flue drains active work for up to 30 seconds, then closes the
Postgres runner, whose close hook shuts the OpenTelemetry providers down; a 60-second outer timer
force-exits. Give the ECS task a stop timeout above 60 seconds.

Brunch does not mount the retired `/api/chat` path; requests to it return 404.
`/agents/petrinaut/:instanceId` is the product door required by Petrinaut; `/agents/chat/:instanceId`
serves the same agent until the deployed website's `VITE_BRUNCH_CHAT_ENDPOINT` names the new route.
Restricted product traffic is the Flue mounts: allow `/agents/*` on the Brunch service so every
registered agent route fits. Keep `GET /health` as a process-local /
load-balancer-private probe, not a public hostname path. Deny `/` and `/assets/*`. Stock
Petrinaut `/api/chat` stays on the website; the accepted later website path is `/api/brunch/:id`.
Releasing `/agents/*` to production browser ingress requires separate authentication,
authorization, ingress, and rate/spend gates. CORS, caller-supplied owner keys, and conversation
hashes are not authentication. Desired count remains one until same-conversation ownership
across replicas is separately proven. The direct browser-result handoff is ephemeral in that single owner: its one-use issued-call capability and existing conversation ownership headers do not authenticate a user or route callbacks across replicas. A lost result after a possible document effect is unknown; Stop aborts an active wait, while silent browser disappearance is detected only after the renewable 25-second lease expires. Production release still requires the external ingress authentication, authorization, routing and spend gates described above.

The deployed chat path stores Flue conversations, submissions, compaction records, attachments,
claims, leases, and settlement state in Postgres.

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
against this branch's image until a Mission 8 successor retargets it to `/agents/petrinaut/:instanceId`.

## Panel and Voice conversation route

Voice is a second input modality over the panel's conversation. It is not a Voice route and does not own provider audio or durable conversation state.

|               |                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| URL           | `/agents/petrinaut/:instanceId`, called through the public Flue browser client and the same-origin local proxy                    |
| Identity      | `x-brunch-principal` plus `x-brunch-conversation`; the server verifies that their hash matches the mounted instance id            |
| Initial turn  | One `FlueClient.send()` carrying `{ kind: "user", body }`                                                                         |
| Browser tools | A document-bound conversation awaits browser results over HTTP within the server tool call; no follow-up submission is sent       |
| Response      | `FlueClient.wait()` chunks projected into one finite AI SDK UI-message stream; observation/history provides canonical rehydration |

Typed and finalized spoken turns use this same route. The panel's explicit **Stop** requests a conversation-wide Flue abort before cancelling its local stream. Local Voice interruption stops playback only and leaves canonical history unchanged.
