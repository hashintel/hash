# Brunch agent application

HASH root guidance applies. Agents, their layout and how to add a candidate are described in [`README.md`](README.md); the Petrinaut agent's architecture and invariants in [`docs/petrinaut/ARCHITECTURE.md`](docs/petrinaut/ARCHITECTURE.md). What this app shares with the Petrinaut website lives in [`../../libs/@hashintel/brunch-agent/`](../../libs/@hashintel/brunch-agent/README.md).

This application composes the Flue runtime, HTTP routes, and Brunch agents. It must remain independent of Petrinaut UI (`@hashintel/petrinaut`); it may import published catalogs from `@hashintel/petrinaut-core`. `apps/petrinaut-website` meets the editor through the AI SDK/HTTP transport.

The repository patches `@flue/runtime@2.0.3`, `@earendil-works/pi-agent-core@0.83.0`, and `@earendil-works/pi-ai@0.83.0`. Brunch depends on their combined context-projection, argument-validation, and complete-tool-schema behavior. Re-evaluate the full patch boundary on a Flue or Pi upgrade.
