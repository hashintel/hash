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
