# Brunch architecture

`apps/brunch-agent` composes the Flue server, Brunch workpiece, SDCPN modelling skill and Petrinaut canonical tools. `apps/petrinaut-website` owns browser-local document state and executes browser tools through Petrinaut's editor. The server imports Petrinaut's published headless catalogue, not the UI package. Native Stock remains a separate panel choice.

## Assistant modes

Build-time evaluation modes are isolated by conversation identity, not product UI choices. F (`canonical-petrinaut-tools`) mounts Petrinaut's exact Stock prompt and complete catalogue over Flue without Brunch contributions. I (`integrated-brunch-canonical`) adds the Brunch prompt, skill, workpiece, reviewed experiment draft and explanation tool while preserving every canonical Petrinaut tool. A conversation admitted without a mode retains the plugin skill and documentation tool but no canonical construction tools.

The core and plugin Markdown under `packages/*/src/prompts/` and `packages/*/src/skills/` is runtime model input. Prompts are imported with `?raw`. The skill is an Agent Skills directory packaged by Flue, so its agent hooks live under `./agent`; `./flue` stays loadable in plain Node. Gherkin is packaged but unmounted; Dafny and Claims are unmounted experimental packages.

## Browser and conversation boundary

Flue's persisted conversation is canonical history. In I, a server-issued canonical browser call waits for a direct one-use HTTP result; the panel orders same-document calls. The browser returns Petrinaut's own output unchanged and host-only `documentRevision: { before?: string; after?: string }`: `before` names the revision observed before the call and `after` exists only when a document change has settled. The model-context projection strips the host envelope before each provider request. F retains the terminal client-result transport and Petrinaut's static tools. Neither the one-use capability nor the document binding authenticates the person; ownership middleware binds the authorized conversation and document incarnation. An attempted write without a settled result is never presumed rolled back or retried after reload.

The server credits an applied canonical call with its settled `after` revision; it does not re-hash or replay browser-produced evidence. `net-changes.ts` projects those calls in history order. `query_workpiece` looks up a named element in the latest canonical definition read and lists applied calls associated by element ID, each with the workpiece revision current at the call, its turn range and user message IDs. These temporal associations do not prove a semantic basis. A reviewed experiment draft requires an earlier canonical definition read and the latest settled workpiece revision; the browser prepares against the current document revision. Canonical `createExperiment` remains Petrinaut-owned and does not mutate the document.

## Workpiece authority

`mutate_workpiece` atomically replaces the complete Markdown revision in per-conversation persistent state. A successful revision can be recovered from canonical history by joining its submitted Markdown to the successful result and checking tool-call ID and SHA-256. Evidence cites literal text and authorized user-message IDs and resolves to UTF-16 locators. Dropping a heading or more than a quarter of the body requires explicit source-backed retraction. Expected validation refusal writes no revision; infrastructure failures throw. `read_workpiece` exposes the current revision and focused reads.

The model-context projection reduces superseded workpiece and net-read bodies before provider invocation. It does not change canonical conversation history, public history, call identity or ordering.

## Runtime and persistence

Local development and tests use Flue's SQLite store; production requires Postgres. The separate worked-model store remains in-memory locally and Postgres in production. See `apps/brunch-agent/src/database-config.ts` and `apps/brunch-agent/src/db.ts`. Every Brunch package uses `dist` for plain Node and an `@dev/source` export condition for Vite's dev server; builds and tests use `dist`. Petrinaut and petrinaut-core build independently (Panda CSS and Vite-only imports).

The repository patches `@flue/runtime@2.0.3`, `@earendil-works/pi-agent-core@0.83.0` and `@earendil-works/pi-ai@0.83.0` for context projection, native tool input and complete provider schemas. Re-evaluate this patch boundary together when upgrading Flue or Pi.
