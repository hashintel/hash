# HASH Development Guide

## Repository Structure and Navigation

The HASH repository is organized into several key directories:

- `/apps` - Core applications powering HASH
  - `/hash-api` - Backend API service
  - `/hash-frontend` - Web frontend application
  - `/hash-graph` - Graph database service
  - `/hash-ai-worker-ts` - AI worker services
  - `/hash-integration-worker` - Integration worker services

- `/infra/compose` - Docker Compose stack for external services (Postgres, Kratos, Hydra, Temporal, observability)

- `/blocks` - Block Protocol components (each subfolder contains a self-contained block)

- `/libs` - Shared libraries and packages
  - `/@blockprotocol` - Block Protocol related libraries
  - `/@hashintel` - HASH-specific libraries
  - `/@local` - Internal libraries for the monorepo
  - Other core libraries (e.g., `error-stack`)

- `/infra` - Deployment and infrastructure code
  - `/docker` - Docker configurations
  - `/terraform` - Terraform infrastructure as code

- `/tests` - Test suites spanning multiple components

**Navigation Tips:**

- When exploring a new feature, first identify which app or lib it belongs to
- Related code is typically co-located within the same directory
- Check existing implementations before creating new ones
- For understanding cross-component interactions, look for integration tests in `/tests`

Package-specific standing instructions live in that package’s `AGENTS.md`. On-demand workflows live in `.agents/skills`.

## Common Commands

### Development

- Main development: `yarn dev` (starts API and frontend)
- Backend only: `yarn dev:backend` or `yarn dev:backend:api`
- Frontend only: `yarn dev:frontend`

### Dev server ports

Every dev server binds a port of its own, so any set of them can run at once:

| Port  | Server                                                           |
| ----- | ---------------------------------------------------------------- |
| 3000  | `@apps/hash-frontend`                                            |
| 4004  | Petrinaut Optimizer service (`--with-optimizer-service`)         |
| 4321  | `@apps/brunch-agent` chat -- `strictPort`, paired with the panel |
| 4322  | `@apps/petrinaut-docs`                                           |
| 4915  | `@apps/brunch-agent` panel -- `strictPort`                       |
| 5001  | `@apps/hash-api`                                                 |
| 5173  | `@apps/petrinaut-website`                                        |
| 6006  | `@hashintel/petrinaut` Storybook                                 |
| 6007  | `@hashintel/refractive` Storybook                                |
| 61000 | `@hashintel/ds-components` Ladle                                 |

`PORT` overrides the default for every one of them except the Optimizer service, which the dev script publishes at 4004 and compose moves with `PETRINAUT_OPT_PORT`, and the two Brunch servers, which take `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` instead: one variable each, because the pair binds two ports and the panel proxies to whatever the chat variable names. Set them on `yarn dev:brunch`, which passes its environment to both servers. Turbo runs a dev task in strict environment mode and forwards only the variables its `turbo.json` lists in `env` or `passThroughEnv`, so a dev server that reads a port variable declares it there. `.claude/launch.json` names the servers a Claude Code session can preview; keep its `port` in step with the table when a default moves.

The compose stack and the graph take these, so a new dev server stays off them as well. Where a variable moves the port, the table names it:

| Port       | Service                     | Moved by                       |
| ---------- | --------------------------- | ------------------------------ |
| 1025       | Mailslurper SMTP            |                                |
| 3001       | Grafana                     |                                |
| 3100       | Temporal UI                 | `HASH_TEMPORAL_UI_PORT`        |
| 4000       | Graph API HTTP              | `HASH_GRAPH_HTTP_PORT`         |
| 4001       | Graph admin API             | `HASH_GRAPH_ADMIN_PORT`        |
| 4002       | Graph HaRPC                 | `HASH_GRAPH_RPC_PORT`          |
| 4003       | Graph Atlas                 | `HASH_GRAPH_ATLAS_PORT`        |
| 4040       | Pyroscope                   |                                |
| 4317       | OpenTelemetry collector     |                                |
| 4433, 4434 | Kratos public and admin API |                                |
| 4436, 4437 | Mailslurper web and API     |                                |
| 4444, 4445 | Hydra public and admin API  |                                |
| 4455       | Type fetcher                | `HASH_GRAPH_TYPE_FETCHER_PORT` |
| 5432       | Postgres                    | `POSTGRES_PORT`                |
| 6379       | Redis                       |                                |
| 7233       | Temporal server             | `HASH_TEMPORAL_SERVER_PORT`    |
| 8200       | Vault                       | `HASH_VAULT_PORT`              |
| 9000, 9001 | MinIO API and console       |                                |

The Brunch agent's `start` and `start:test` scripts and its production image listen on 3002, where the integration tests expect it; the dev pair uses 4321 and 4915.

### Starting Services

- Start all services: `yarn start`
- Start graph only: `yarn start:graph`
- Start backend only: `yarn start:backend`
- Start frontend only: `yarn start:frontend`
- Start workers: `yarn start:worker`

### Testing

- Unit tests: `yarn test:unit`
- Integration tests: `yarn test:integration`

### Linting and Fixing

- Lint everything: `yarn lint`
- TypeScript type check: `yarn lint:tsc`
- ESLint: `yarn lint:eslint`
- Formatting check: `yarn lint:format`

- Fix ESLint issues: `yarn fix:eslint`
- Fix formatting: `yarn fix:format`

### For Specific Packages

When working on a specific package, use:

```bash
# For TypeScript/JavaScript packages
turbo run <command> --filter '<package-name>'

# For Rust packages
cargo nextest run --package <package-name>
cargo test --package <package-name> --doc  # For doc tests
cargo clippy --all-features --package <package-name>
```

For Rust packages, you can add features as needed with `--all-features`, specific features like `--features=foo,bar`, or use `cargo-hack` with `--feature-powerset` for comprehensive feature testing.

### Monorepo wiring for Rust crates

Each Rust crate has a `package.json` whose **identity and workspace-dependency wiring** — its `@rust/<name>` name, version, and the `dependencies` mirroring its `Cargo.toml` — is generated from `Cargo.toml`. After **adding, removing, or renaming a Rust crate**, or changing its `Cargo.toml` dependencies, re-sync that wiring:

```bash
mise run sync:turborepo    # sync package.json identity + deps from Cargo.toml metadata
```

`sync:turborepo` only manages that generated wiring — the `scripts` section is hand-maintained and is used by CI and Turborepo (e.g. `test:unit`, `lint:clippy`, `doc:dependency-diagram`), so add or edit scripts by hand. The task wraps the `repo-chores` CLI; the equivalent direct invocation is `cargo run --package hash-repo-chores --bin repo-chores-cli -- sync-turborepo`. A related task, `mise run fix:package-json`, sorts `package.json` keys consistently.

## Git commits

Commit messages should be descriptive and concise, use sentence case, and describe the change in an imperative, present-tense style. Do not use semantic prefixes such as `fix:`, `feat:`, or `chore:`.

```text
Add feature flags to Real type tests that require `serde`
Update performance documentation guidelines
Fix PostgreSQL integration type reference issues
```

## TypeScript

- Prefer `const myFunc = () => {}` over function declarations.
- Parallelize independent async work with `Promise.all`.
- No `any`. If the input type is genuinely unknown, use `unknown` and narrow it.
- Prefer `??` over `||`.
- No unchecked index access (`array[0]` might be `undefined`).
- Don’t make formatting corrections to lines you aren’t already modifying.
- Avoid single-letter variable names except in `for` loops (`i` is fine).
- Variable names are `camelCase`. No `SCREAMING_SNAKE_CASE`.
- Check function and type signatures; don’t guess APIs.
- Yarn workspaces: install a dependency in the relevant workspace, not at the root.

File placement for TypeScript modules is covered by the `fractal-file-structuring` skill.
