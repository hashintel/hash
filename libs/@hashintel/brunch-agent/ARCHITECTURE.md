# Brunch architecture

This document describes the implementation as it exists. Detailed application operation and deployment configuration live in [`apps/brunch-agent/README.md`](../../../apps/brunch-agent/README.md).

## Runtime composition

`apps/brunch-agent` is the Flue server and composition point. Its `ChatAgent` combines:

- `@hashintel/brunch-agent/flue`: the model, core system prompt, elicitation skill, and durable workpiece tools;
- `@hashintel/brunch-agent-plugin-sdcpn/flue`: the SDCPN prompt append, modelling skill, Petrinaut documentation access, and conditional construction tools;
- app-owned routing, diagnostics, context projection, evidence lookup, and explanation tools.

`@hashintel/brunch-agent-transport-aisdk` projects a caller-provided Flue conversation into AI SDK streams and transcripts; it does not own server state. `apps/petrinaut-website` owns browser-local document state, document/conversation binding, and execution of browser tools.

The core and plugin Markdown under `packages/*/src/prompts/` and `packages/*/src/skills/` is imported with `?raw` and bundled as runtime model input. It is implementation source, not project documentation.

Gherkin is packaged but currently unmounted. Dafny and Claims are unmounted experimental packages.

## Conversation and workpiece authority

Flue’s persisted conversation is the canonical conversation record. Browser-tool results return through the canonical Flue delivery path and correlate by tool-call ID. The ephemeral live-tool stream exists only to show pending work; it does not validate or execute tools and is not durable history.

The current workpiece is per-conversation persistent state. `mutate_workpiece` atomically replaces the complete Markdown revision with its tool outcome. Successful revisions can be reconstructed from canonical history by joining the submitted Markdown to the successful result and verifying the tool-call ID and SHA-256.

Workpiece settlement enforces these invariants:

- the first revision names a `null` base; later revisions name the current revision;
- replaying one tool-call ID requires identical content;
- evidence cites literal text in the submitted Markdown and authorized user-message IDs, then resolves to UTF-16 locators;
- invalid or ambiguous evidence refuses the entire settlement;
- dropping an existing heading or more than 25% of the prior body requires an explicit, source-backed retraction;
- an expected validation refusal writes no revision and returns a typed non-applied result; infrastructure and unexpected failures still throw.

`read_workpiece` exposes the current revision and focused source/locator reads. It does not accept replacement content.

## Model-context projection

`apps/brunch-agent/src/agents/chat-agent/context-projection.ts` reduces superseded workpiece and net-read bodies before model invocation. This projection is model-facing and recomputable. It must not modify canonical conversation history, public history, call identity, ordering, or the latest authoritative body.

## Tool boundary

The checked catalogue at `apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts` records mounted names and their definition and execution owners.

- Flue owns task and skill activation/resource tools.
- Core defines `mutate_workpiece` and `read_workpiece`, which execute on the server.
- Petrinaut read, diagnostics, layout, and net-mutation tools execute in the browser against the open document.
- `ping` and `query_workpiece` are app-owned server tools.

A net mutation must cite a settled workpiece basis and a verified browser observation whose hash matches the submitted base. Browser mutations return only after the editor host settles any resulting document revision.

## Persistence

Local development and tests default to Flue’s SQLite store. Production requires Postgres and fails rather than falling back to local storage. The application also maintains a separate worked-model store: in-memory locally and Postgres in production. See `apps/brunch-agent/src/database-config.ts` and `apps/brunch-agent/src/db.ts`.

## Flue and Pi patches

The repository currently pins Flue `2.0.3` and applies root patches to:

- `@flue/runtime@2.0.3` for Brunch’s context-projection and native tool-input behavior, tool-scoped persistent-state handling, and retry integration;
- `@earendil-works/pi-agent-core@0.83.0` for authoritative tool-argument validation used by the Flue bridge;
- `@earendil-works/pi-ai@0.83.0` / `^0.83.0` for complete Anthropic tool schemas and valid union-value handling.

The patch files under `.yarn/patches/`, the root `resolutions`, and `ChatAgent`’s `useContextProjection` call are one compatibility boundary. Re-evaluate that boundary when upgrading Flue or Pi rather than deleting an individual patch in isolation.
