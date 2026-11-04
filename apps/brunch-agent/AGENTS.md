# Brunch agent application

HASH root guidance applies. Agents, their layout and how to add a candidate are described in [`README.md`](README.md); the Petrinaut agent's architecture and invariants in [`docs/petrinaut/ARCHITECTURE.md`](docs/petrinaut/ARCHITECTURE.md). What this app shares with the Petrinaut website lives in [`../../libs/@hashintel/brunch-agent/`](../../libs/@hashintel/brunch-agent/README.md).

This application composes the Flue runtime, HTTP routes, and Brunch agents. It must remain independent of Petrinaut UI (`@hashintel/petrinaut`); it may import published catalogs from `@hashintel/petrinaut-core`. `apps/petrinaut-website` meets the editor through the AI SDK/HTTP transport.

Before changing Flue or Pi versions or patches, read [`docs/dependency-patches.md`](docs/dependency-patches.md) for the retained contracts, removed interventions and removal proofs. Upgrade the pair together and verify the built application; package-definition tests alone do not prove native validation, projection or crash recovery.

A `BRUNCH_*` environment variable the server reads is named once, in [`src/env.ts`](src/env.ts), and forwarded to the `dev` task in [`turbo.json`](turbo.json); a variable only one script or test-mode path reads is named in that module. [`test/architecture/environment-names.test.ts`](test/architecture/environment-names.test.ts) fails on a second declaration, on a mention anywhere in the repository that no module declares, and on a Turbo list that differs from the declarations.
