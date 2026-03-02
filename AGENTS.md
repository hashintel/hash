# HASH Development Guide

## Repository Structure and Navigation

The HASH repository is organized into several key directories:

- `/apps` - Core applications powering HASH
  - `/hash-api` - Backend API service
  - `/hash-frontend` - Web frontend application
  - `/hash-graph` - Graph database service
  - `/hash-external-services` - External service integrations
  - `/hash-ai-worker-ts` - AI worker services
  - `/hash-integration-worker` - Integration worker services

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

## Common Commands

### Development

- Main development: `yarn dev` (starts API and frontend)
- Backend only: `yarn dev:backend` or `yarn dev:backend:api`
- Frontend only: `yarn dev:frontend`

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

## Contextual Rules

CRITICAL: For the files referenced below, use your Read tool to load it on a need-to-know basis, ONLY when relevant to the SPECIFIC task at hand:

- .config/agents/rules/*.md

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## Cursor Cloud specific instructions

### Service architecture

The HASH dev environment consists of:

| Service | Port | How to start |
|---|---|---|
| External services (Postgres, Redis, Kratos, Hydra, Temporal, Vault, etc.) | Various | `yarn external-services up -d --wait` |
| hash-graph (Rust binary) | 4000 (HTTP), 4002 (RPC) | Build with `cargo build --bin hash-graph --all-features`, then migrate + run |
| hash-graph type-fetcher | 4455 | `./target/debug/hash-graph type-fetcher` |
| hash-api (Node.js) | 5001 | `yarn dev:backend` or direct tsx invocation |
| hash-frontend (Next.js) | 3000 | `yarn dev:frontend` or `cd apps/hash-frontend && npx next dev` |

### Startup order

1. Docker must be running (`sudo dockerd` if not started)
2. External services: `yarn external-services up -d --wait`
3. Build hash-graph: `cargo build --bin hash-graph --all-features`
4. Migrate hash-graph: `./target/debug/hash-graph migrate --user postgres --password postgres`
5. Start hash-graph server: `./target/debug/hash-graph server`
6. Start hash-graph type-fetcher: `./target/debug/hash-graph type-fetcher`
7. Run API migrations: `NODE_ENV=development npx tsx ./apps/hash-api/src/ensure-system-graph-is-initialized.ts`
8. Start API and frontend: `yarn dev`

### Important caveats

- **RUSTUP_TOOLCHAIN**: When running turbo commands that invoke cargo (e.g., codegen, build:types), set `export RUSTUP_TOOLCHAIN=nightly-2026-02-09` to prevent concurrent rustup toolchain downloads from failing in the nested container environment.
- **Turbo concurrency**: For codegen tasks that invoke Rust builds, use `--concurrency=1` and `--env-mode=loose` to avoid parallel rustup download conflicts.
- **`.env.local`**: Must exist (even if empty) before starting external services. Create with `touch .env.local` if missing.
- **`/workspace/var/api`**: The API writes email dumps to this directory. If it doesn't exist with write permissions, create it: `sudo mkdir -p /workspace/var/api/dummy-email-transporter && sudo chmod -R 777 /workspace/var`.
- **Seeded dev accounts**: `alice@example.com`, `bob@example.com`, `admin@example.com` — all with password `password`.
- **`redocly` CLI**: Required for `@local/hash-graph-client` codegen. Install via `mise install "npm:@redocly/cli"` if missing.
