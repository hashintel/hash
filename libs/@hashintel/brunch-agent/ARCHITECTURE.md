# Brunch architecture

This document describes the implementation as it exists. Detailed application operation and deployment configuration live in [`apps/brunch-agent/README.md`](../../../apps/brunch-agent/README.md).

The current branch’s target contract and still-unresolved construction-interface decision are recorded in the [Petrinaut tooling remediation replan](docs/refactoring/tooling-remediation-plan.md).

## Runtime composition

`apps/brunch-agent` is the Flue server and composition point. When Brunch is selected, the product defaults to integrated mode: `ChatAgent` composes Brunch’s context projection, elicitation, Ledger, freshness, provenance, and explanation behavior with the SDCPN skill, Petrinaut-owned capability guidance, and the complete canonical `petrinautAiTools` catalogue.

Three build-time evaluation modes are isolated by conversation identity and are not product UI choices. `F` is the exact Stock prompt and catalogue over Flue without Brunch or Ledger contributions. `A` adds `declare_petrinaut_projection` before direct canonical construction calls. `B` adds `apply_petrinaut_construction`, a bounded ordered browser operation, while retaining every canonical tool for reads, documentation, experiments, interactive layout, capabilities outside the carrier, and direct corrections. The native Stock assistant remains a separate panel choice.

Two older non-product composition boundaries remain route-admissible. Batched construction retains the previous observed mutation protocol for historical tests and compatibility. Validated construction mounts a smaller construct-only surface for the headless runbook evaluator.

`@hashintel/brunch-agent-transport-aisdk` projects a caller-provided Flue conversation into AI SDK streams and transcripts; it does not own server state. `apps/petrinaut-website` owns browser-local document state, document/conversation binding, and execution of browser tools.

The core and plugin Markdown under `packages/*/src/prompts/` and `packages/*/src/skills/` is runtime model input: implementation source, not project documentation. Prompts are imported with `?raw`. Each skill is an Agent Skills directory whose `SKILL.md` the package exports and imports natively; library builds leave that import in place and the consuming Flue application validates and packages the directory. Only code built by Flue can load a `SKILL.md` import, so the hooks that mount skills live in each package's `./agent` entry, and `./flue` stays loadable in plain Node.

Gherkin is packaged but currently unmounted. Dafny and Claims are unmounted experimental packages.

## Conversation and workpiece authority

Flue’s persisted conversation is the canonical conversation record. In I, the issued canonical browser call waits asynchronously for a direct, one-use HTTP result. The route acknowledges only after checking the issued call's host sidecar, then writes the browser's canonical output and verified sidecar into that call's Flue outcome. The model-context projection removes the host envelope and sidecar before every provider request, leaving exactly the canonical Petrinaut output model-visible; there is no `awaiting: client` result or `client-tool-result` follow-up for those calls. Claiming the issued capability first requires the exact bound conversation/document incarnation, but this binding is not user authentication. The result handoff is process-local and only supports the documented single-owner Node deployment. F/A/B and legacy calls retain their terminal result-signal delivery and correlation. The ephemeral live-tool stream exists only to show pending work; it does not validate or execute tools and is not durable history.

In integrated Brunch modes, the current Ledger (still named `workpiece` in implementation symbols) is per-conversation persistent state. `mutate_workpiece` atomically replaces the complete Markdown revision with its tool outcome. Successful revisions can be reconstructed from canonical history by joining the submitted Markdown to the successful result and verifying the tool-call ID and SHA-256.

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

The plugin derives every canonical name, description, and schema directly from `petrinautAiTools`. Petrinaut retains canonical execution and model-visible output semantics. A schema-free Brunch catalogue classifies ownership and capability class; adding a Stock tool fails conformance until Brunch classifies the host mechanics it requires.

Integrated I/A/B modes install host adapters under exact canonical names for the bounded `addPlace → addTransition → addArc` tracer and canonical definition reads. In I, the panel executes issued calls while Flue's response stream remains open; it orders all same-document calls and read barriers in admitted proposal order, while long experiments release the lane after capturing their source. The adapters observe pre/post state, derive effects independently, await exact repository settlement, carry diagnostics, and retain verified sidecars in Flue history. An explicit Stop aborts the wait. Calls never claimed before abort or lease expiry and bound siblings explicitly skipped before execution are unstarted; a claimed browser execution failure is delivered through a one-use negative result, with a potentially attempted document change classified unknown and a non-mutating call classified unchanged. Pending issued siblings receive their own negative result rather than waiting out the lease; a silent lost browser still requires lease expiry rather than instantaneous partition detection. A possible document effect with no accepted result is unknown and is never replayed; its output-error adds an unrecorded change that invalidates the preceding verified read without acquiring Ledger cause. I allows independent browser/server calls in one proposal, but a concurrent Ledger write cannot vouch for a browser effect it has not observed. Other canonical capabilities continue through Petrinaut’s static registry. Canonical `createExperiment` remains Petrinaut-owned; Brunch records its canonical request/result and the source document revision without duplicating progress state or treating the experiment as a document mutation.

Interface A records semantic intent and host-resolved Ledger bases separately from direct calls, then recomputes ordered correlation from history. Interface B’s deep call resolves Ledger excerpts and document authority in the browser host, commits a successful/no-op prefix, leaves a failed or unknown suffix unattempted, settles each changed revision, reads diagnostics once after the prefix, and optionally applies verified layout. Both direct and deep calls recover terminal records from Flue history after remount and fail closed when history is missing, ambiguous, or unverifiable.

The retained legacy batched boundary additionally mounts custom observed tools. Its model-authored observation and basis protocol is compatibility terrain, not the integrated product contract.

## Persistence

Local development and tests default to Flue’s SQLite store. Production requires Postgres and fails rather than falling back to local storage. The application also maintains a separate worked-model store: in-memory locally and Postgres in production. See `apps/brunch-agent/src/database-config.ts` and `apps/brunch-agent/src/db.ts`.

## Flue and Pi patches

The repository currently pins Flue `2.0.3` and applies root patches to:

- `@flue/runtime@2.0.3` for Brunch’s context-projection and native tool-input behavior, tool-scoped persistent-state handling, and retry integration;
- `@earendil-works/pi-agent-core@0.83.0` for authoritative tool-argument validation used by the Flue bridge;
- `@earendil-works/pi-ai@0.83.0` / `^0.83.0` for complete Anthropic tool schemas and valid union-value handling.

The patch files under `.yarn/patches/`, the root `resolutions`, and `ChatAgent`’s `useContextProjection` call are one compatibility boundary. Re-evaluate that boundary when upgrading Flue or Pi rather than deleting an individual patch in isolation.
