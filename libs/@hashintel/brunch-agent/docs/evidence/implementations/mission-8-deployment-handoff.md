# Mission 8 deployment handoff

Date: 2026-09-01

This report records the application-owned deployment work and local proof. It
does **not** claim that Brunch is deployed. The repository fixes CI publication
to `eu-central-1`, ECR account `469596578827`, and ECS deployment account
`054238437032`, but no Brunch ECR repository, RDS instance, ECS service,
restricted hostname, or HASH collector was confirmed. The AWS CLI was not
installed; an ephemeral CLI invocation found no configured profile or
credentials.

## Application contract

- Image: `brunch-agent`
- Current direct-main image ID: not revalidated; Docker execution was denied
  before the build began
- Entrypoint: `node dist/server.mjs`
- Runtime identity: uid `60000`, gid `60000`
- Public container port: `3002`
- Restricted application route: `POST /api/chat`
- Liveness route: `GET /health`
- Ingress-denied routes: `/`, `/assets/*`, `/agents/chat/:id`
- Durable state: Flue-owned Postgres tables for conversation, submission,
  recovery, and settlement state
- Non-durable and inactive in deployment: the separate JSON capture store
- Authentication preference: RDS IAM using task-role credentials and a fresh
  token per physical connection
- Fallback: a runtime-injected Postgres password using the same host, port,
  database, user, and verified TLS configuration
- Telemetry: OTLP/gRPC to `HASH_OTLP_ENDPOINT`; Flue content capture disabled
- Rollout policy: desired count one and stop-before-start until ownership
  overlap is separately proven safe

The exact environment fields and liveness/readiness semantics are documented
in `apps/brunch-agent/README.md`.

## Observed local proof

- `yarn workspace @apps/brunch-agent lint:tsc`: passed
- `yarn workspace @apps/brunch-agent lint:eslint`: passed with eight
  pre-existing warnings and no errors
- `yarn workspace @apps/brunch-agent test:unit`: 14 files and 63 tests passed
- `yarn workspace @hashintel/brunch-agent test:unit`: 18 files passed,
  197 tests passed, and 1 test skipped
- `yarn workspace @apps/brunch-agent build`: passed
- `yarn workspace @apps/brunch-agent build:docker`: not run; Docker execution
  was denied with `operation not permitted`
- Docker integration smoke: not run for the rewritten direct-main artifact

The former-ancestry image and Docker integration smoke passed before this
branch was rewritten onto current `main`. Those results do not establish the
new artifact and are retained only as historical evidence.

The former-ancestry container smoke observed:

- startup and Flue migration against Postgres using the password fallback;
- refusal to start when production database configuration was absent;
- verified TLS;
- non-root execution;
- `/health` and packaged UI/agent resources;
- no writes under `/repo`;
- a graceful generated-server shutdown within the 60-second outer bound; and
- trace receipt by a disposable OTLP collector.

Brunch is registered in the deploy service catalog for CI builds and
multi-architecture GHCR publication. Its catalog entry has `push: ["ghcr"]`
and an empty ECS target list. The workflow provisions neither an ECR repository
nor an ECS service, so ECR publication and deployment remain disabled until
infrastructure supplies and approves those targets.

## Required infrastructure handoff

The infrastructure owner must provide and record all of the following before
an ECS target is added:

- confirmation that the repository-level publication/deployment accounts,
  `eu-central-1`, ECR push role
  `arn:aws:iam::469596578827:role/github-oidc-hash-cd-push`, and ECS deploy
  role `arn:aws:iam::054238437032:role/github-oidc-hash-cd-deploy` are the
  approved Brunch targets;
- ECR repository;
- ECS cluster, service, and task family;
- task role and execution role;
- RDS endpoint, port, database, user, schema policy, and CA mount;
- IAM policy and `rds_iam` role, or password secret reference and the reason
  IAM was rejected;
- Anthropic secret reference;
- HASH collector endpoint and resource attributes;
- restricted hostname/access boundary;
- load-balancer health target and ingress route rules;
- measured streaming idle timeout, CPU/memory, health grace, drain/stop
  timeout, and deployment percentages; and
- deployment and acceptance owner.

After those resources exist, use one immutable image digest to execute the
Mission 8 remote proof matrix: two-connection IAM probe, real streamed
Anthropic/tool turn, in-place restart hydration, cross-host task replacement,
client abort, bounded provider and database failures, content/secret inspection,
graceful replacement, and rollback. Mission 8 remains open until those observed
facts and owner acceptance are recorded.
