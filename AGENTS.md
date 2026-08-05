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

## Documentation Maintenance

### Petrinaut user-facing docs

The Petrinaut user guide lives at `libs/@hashintel/petrinaut/docs/*.md` and is the source of truth for end-user behaviour. The in-app AI assistant reads these pages at runtime via the `readPetrinautDoc` tool, so stale docs lead directly to wrong advice in the product.

When you change UI or behaviour in the petrinaut packages (`libs/@hashintel/petrinaut`, `libs/@hashintel/petrinaut-core`), you MUST:

1. Review the user-facing docs that mention the affected feature and update them in the same change.
2. If you add a brand-new user-facing surface (panel, view, mode, tool, settings dialog, ...), add a corresponding page and link it from `libs/@hashintel/petrinaut/docs/README.md`.
3. When you add a new doc page, also register it in `petrinautDocNames` and `petrinautDocSummaries` in `libs/@hashintel/petrinaut-core/src/ai.ts`, and add a `?raw` import in `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/petrinaut-docs-content.ts`. The tests in `libs/@hashintel/petrinaut-core/src/ai.test.ts` and `petrinaut-docs-content.test.ts` enforce that every enum value has a summary and a content entry.
4. Keep the docs end-user-focused: describe what the user sees, what they click, what happens. Do not document Storybook, internal modules, or test setup in the user guide.
5. If UI are changes that may make screenshots in the docs outdated, you MUST prompt your user to replace the screenshots.

If a change ships without doc updates, call that out in your summary so the user can decide whether to follow up.

### Petrinaut architecture docs

Distinct from the user guide above: the **architecture** docs describe the shape of the code for the people (and agents) working on it. They are generated from annotations in the source by `@local/petrinaut-arch-docs`, and CI fails when they drift.

The architecture is declared **next to the code it describes** — never in a central mapping file:

- A folder's `README.md` frontmatter (`layer`, `role`, and optionally `name`, `seams`, `boundaries`, `invariants`, `owner`) declares a layer, and the prose below becomes that layer's page.
- Alternatively, `@layerRoot` / `@layerName` / `@role` in a folder entry file's doc comment.
- `@boundary <kind> — <note>`, `@invariant <text>` and `@seam <specifier>` in any file's doc comments attach facts to the specific code that upholds them.
- Files with no annotation inherit from the nearest declaring ancestor, so only ~40 declarations cover ~400 files. Do not annotate every file.

The generated docs are **build output and are not committed** — there is nothing to regenerate before pushing. Only the annotations are versioned.

When you change structure in `libs/@hashintel/petrinaut-core` or `libs/@hashintel/petrinaut`, you MUST:

1. Add a declaration if you introduce a folder that is a genuinely new architectural unit — a new boundary or a distinct responsibility, not merely a new directory.
2. Update the affected `@boundary`/`@invariant` annotations if you change what they claim. These are claims CI and reviewers rely on; an invariant that is no longer true is worse than none.

Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`, which fails on unannotated files, undeclared ancestors, dead `@seam`s and rule violations. To read the docs, `mise run doc:architecture` writes the bundle to `libs/@local/petrinaut-arch-docs/bundle/` (git-ignored).

Full reference: `libs/@local/petrinaut-arch-docs/README.md`. Browse the docs with `yarn workspace @apps/petrinaut-docs dev`, which regenerates the bundle first. For a quick read of the whole architecture, generate the bundle and open `libs/@local/petrinaut-arch-docs/bundle/architecture.md` — the entire model in one file.

Hand-written MDX in `libs/@local/petrinaut-arch-docs/content/` is optional. Add a page there for reasoning an import graph cannot express; the system works with that directory absent.

## Contextual Rules

CRITICAL: For the files referenced below, use your Read tool to load it on a need-to-know basis, ONLY when relevant to the SPECIFIC task at hand:

- .config/agents/rules/\*.md

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed
