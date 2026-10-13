# Petrinaut agent architecture

`apps/brunch-agent` serves Brunch's agents over Flue. The Petrinaut agent (`src/agents/petrinaut/`) elicits an operational process and builds it as a Petrinaut net. `apps/petrinaut-website` owns browser-local document state and executes browser tools through Petrinaut's editor. What the two apps share lives in `@hashintel/brunch-agent` (`libs/@hashintel/brunch-agent`). The server imports Petrinaut's published headless catalogue, not the UI package. Native Stock remains a separate panel choice.

## Agents and their composition

`src/agents/index.ts` registers each agent with its route; `src/app.ts` mounts every registered agent under `/agents/<route>` with its own ownership guard, browser-call router and live-tool channel. The Petrinaut agent's route is `petrinaut`, and `/agents/chat` serves it too until the deployed website's endpoint moves. Its `agentName`, on which conversation storage keys, is `brunch-chat-agent`.

An agent's directory holds everything its model reads and every Ledger tool: the system prompt (`prompts/`), its skills (`skills/eliciting`, `skills/modelling`, `skills/petrinaut`), the Ledger and `query_basis` tools (`tools/`), `guidance.ts`, which mounts them, and `agent.ts`, which composes them with the shared mechanics. A candidate is a copy of that directory with its own `agentName`, registered under its own route and kept off production with `devOnly`.

A conversation whose initial data carries a Petrinaut document binding (`{ binding }`) mounts the guidance, the Ledger tools, every canonical Petrinaut tool, the filtered net readers, the reviewed experiment draft and `query_basis`. A conversation admitted without initial data mounts the guidance and Ledger tools but no Petrinaut tools. The Petrinaut agent mounts no instruction besides its system prompt: Petrinaut, runtime, experiment and `query_basis` guidance live in its skills and tool descriptions.

Prompts are imported with `?raw`. Each skill is an Agent Skills directory imported natively, and the Flue build packages the directory. The persona launcher (`evals/petrinaut/persona/`) fingerprints the agent's guidance and Ledger sources for each run.

## The shared library

`@hashintel/brunch-agent` holds only what both apps need: Brunch's named constants, conversation identity, the browser-tool envelope and message metadata, the Petrinaut tool contracts (tool effects, net readers, the draft schemas, contextual user messages, initial data) and the Ledger. It has one entry and is browser-safe: it never imports the Flue runtime, which `test/architecture/import-direction.test.ts` enforces. Flue tool definitions, guidance and server mechanics live in the app.

## Loading workspace source in dev

The library points TypeScript at `src` but runs from `dist`. So that a dev server does not run stale code, its export carries an `"@dev/source"` condition, placed after `types` and before `import`, that names the TypeScript source. The Brunch and website Vite configs prepend that condition to Vite's default client and server conditions only when they serve; builds, Vitest and plain Node never enable it and keep resolving `dist`. The name is a custom condition rather than `source` or `development`: Vite enables `development` by default in dev, and some published packages ship a `source` condition, so either would also switch third-party packages to unbuilt code. Petrinaut and petrinaut-core do not use it: they need their own build (Panda CSS and Vite-only imports), so their dev servers run from `dist`.

## Ledger

The Ledger is the ordered sequence of accepted `ledger_commit` calls in the conversation's canonical history; it has no other storage. A commit submits one queue of `[route, payload]` entries: `entity/create`, `entity/update/<entity ID>`, `claim/create`, `obligation/create` and `reflection/create`. The host assigns record IDs in queue order (`e1`, `c1`, `o1`, `r1`, …) and stamps each commit with the user message it followed; entries reference existing records by ID and records in the same queue as `$index`. A claim supersedes earlier claims by reference and hides nothing. Obligations record checks the model owes, which a reflection citing the run or inspection discharges.

A running commit reads history, folds the accepted commits before its own call and decides from them alone, so an interrupted durable call re-runs to the same IDs. A commit counts only when its recorded output agrees with the IDs its input yields. Flue folds a response's steps into one message and may run a proposal's calls concurrently: a commit that runs while an earlier commit in the same response is unsettled is refused. Its receipt returns the IDs, how many user messages have passed, how many questions are open, the obligations still owed and notes on consequences to weigh.

`ledger_compile` renders the folded Ledger in the agent skin, which carries record IDs and kind tokens inline. The website's Ledger tab renders the same projection in the user skin, and persona evidence (`ledger.md`, `ledger.json`) uses the agent skin.

## Browser and conversation boundary

Flue's persisted conversation is canonical history. In a document-bound conversation, every browser tool, the canonical catalogue, the filtered readers and the experiment draft, is a server-issued call that waits for a direct one-use HTTP result; no browser result arrives as a later Flue signal. The panel orders same-document canonical calls; the draft card claims and settles its own call once preparation finishes. Admission refuses a proposal that places a tool beside a tool whose result it reads (`query_basis` beside a net read; `ledger_compile` beside `ledger_commit`; the draft beside `getLatestNetDefinition`). The browser returns Petrinaut's own output unchanged and host-only metadata: `documentRevision: { before?: string; after?: string }`, where `before` names the revision observed before the call and `after` exists only when the call changed the document, and after a change a `readBack` of the net's structure. A document revision is a structural hash of the document's content, computed by the host, so equal content has an equal revision. Neither the one-use capability nor the document binding authenticates the person; ownership middleware binds the authorized conversation, and the browser-call rendezvous binds the document. An attempted write without a settled result is never presumed rolled back or retried after reload.

`readNetOutline` and `readNetStructure` run `getLatestNetDefinition` in the browser and return it without canvas positions, visual settings or host metadata; the outline also omits code and expressions: lambda, kernel, equation and metric code, parameter overrides, component parameter values, and scenario initial states beyond the shape of an ad-hoc one.

## Net freshness

Before each provider request the context projection records which net reads and settled changes the model's context holds. A document change is issued only against the revision of the latest of those; with none left, for example after compaction, it is refused before reaching the browser. The browser accepts the change only if its document has moved since that revision through Brunch's own settled changes, following their before-to-after chain, so a hand edit refuses it as stale. The projection strips the host envelope from browser results and shows the latest change's `readBack` as `netAfterChanges` unless a later net read supersedes it. It does not change canonical conversation history, public history, call identity or ordering.

The server credits an applied canonical call with its settled `after` revision; it does not re-hash or replay browser-produced evidence. `src/shared/conversation/net-changes.ts` projects those calls in history order. `query_basis` looks up a named element in the latest net read and lists applied calls associated by element ID, each with the Ledger revision current at the call and the content of the records committed in its turn, before or after the call, since a change's reflections are committed after it. These temporal associations do not prove a semantic basis. A reviewed experiment draft requires an earlier complete net read; the browser prepares against the current document revision. Canonical `createExperiment` remains Petrinaut-owned and does not mutate the document.

## Runtime and persistence

Local development and tests use Flue's SQLite store; production requires Postgres. See `src/server/database-config.ts` and `src/db.ts`.

The repository patches `@flue/runtime@2.0.3`, `@earendil-works/pi-agent-core@0.83.0` and `@earendil-works/pi-ai@0.83.0` for context projection, native tool input and complete provider schemas. Re-evaluate this patch boundary together when upgrading Flue or Pi.
