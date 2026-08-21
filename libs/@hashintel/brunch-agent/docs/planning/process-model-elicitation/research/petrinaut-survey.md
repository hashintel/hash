# Petrinaut Architecture Survey (FE-1358)

Evidence-based audit of HASH's Petrinaut app/library and the three candidate
couplings with the brunch elicitor. Read-only survey of
`/Users/lunelson/Code/hashintel/hash` at branch state of 2026-08-11. All paths
below are repo-relative, prefixed `../hash/`.

## Executive summary

1. **Petrinaut is not an app you'd live inside — it is already two published npm
   libraries.** `@hashintel/petrinaut` (React 19 UI, v0.0.16) and
   `@hashintel/petrinaut-core` (headless, v0.0.2, five deps, zero React).
2. **`petrinaut-core` is the cheap coupling nobody has costed**: framework-free
   ESM, exports SDCPN types, zod schemas, the AI prompt/tools, ELK auto-layout,
   the simulation engine, and a pure file parser/serializer.
3. **The artifact boundary already exists and is production code**: a versioned
   file format (`version: 1`) with a `meta.generator` field, a pure
   `parseSDCPNFile` that needs only `places` + `transitions`, and an **Import**
   action that auto-lays-out position-less nets — but Import is **hidden in
   HASH's embed** and present only on demo.petrinaut.org.
4. **A brunch↔Petrinaut integration already ships**: "Actual mode", an SSE
   protocol (`definition` / `initial_state` / `transition_firing` / `terminal`)
   on the `/brunch` route, with a 941-line reference fixture server in-repo.
5. **Petrinaut's AI assistant already does interview-first elicitation.** Its
   system prompt literally says "Interview first, build second" and specifies
   2–4 grouped questions per turn plus a "make it up" escape hatch.
6. **That assistant is entirely browser-resident** and cannot be otherwise: tools
   execute client-side against the live editor, and the iframe hosting it has
   `connect-src 'self'` because it must run user code under `unsafe-eval`. There is
   no headless net-_generation_ path (though the CLI is a headless _simulation_
   path, used in production by the optimizer over a stdio subprocess).
7. **There is no job queue, no background worker, no subagent structure** around
   the assistant. One `useChat` loop, one edge function.
8. **Persistence is thin and provenance is absent.** The net is one HASH entity
   property holding the raw SDCPN blob; the AI conversation lives in
   **localStorage**. Nothing records why the model made a modelling choice.
9. **The net format holds no initial marking and no timing fields** — structure
   only. A generated net that should start with tokens must emit a `scenario`, or
   it opens fine and simulates to nothing: the likeliest way to ship a useless file.
10. **npm is ~2 months stale relative to `main`** — last publish 2026-06-03 with
    22 unreleased `@hashintel/petrinaut` changesets pending, including the HIR
    compiler rewrite and Actual mode itself.
11. **Evidence favours the artifact boundary**, but the real finding is the
    overlap in §2/§6: the elicitation capability the demo needs partly exists
    already, and the audit's hardest question is differentiation, not plumbing.

---

## 1. Architecture and dependencies

### 1.1 Workspace layout

Petrinaut is not one app. It is five workspaces:

| Path                                     | What it is                                                       |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `../hash/libs/@hashintel/petrinaut`      | React 19 editor UI. Published, v0.0.16.                          |
| `../hash/libs/@hashintel/petrinaut-core` | Headless engine + types + AI contract. Published, v0.0.2.        |
| `../hash/libs/@hashintel/petrinaut-cli`  | Internal JSON-lines CLI (`private: true`, `0.0.0-private`).      |
| `../hash/apps/petrinaut-website`         | Standalone Vite SPA demo (demo.petrinaut.org), Vercel.           |
| `../hash/apps/petrinaut-opt`             | Python optimizer service (Optuna), `pyproject.toml` + `uv.lock`. |

Plus `../hash/libs/@local/petrinaut-optimizer-client` and
`../hash/apps/hash-api/src/petrinaut-optimizer/` (the optimizer proxy), and
`../hash/libs/@hashintel/petrinaut-old` (superseded).

Monorepo tooling (`../hash/package.json`): Yarn 4.16 workspaces
(`packageManager: yarn@4.16.0`), Node ≥ 22, Turborepo, oxlint + oxfmt, `mise`
for toolchain, changesets for release. Workspace globs are `apps/**`, `libs/**`,
`tests/**`.

### 1.2 What a library would have to conform to, to live inside Petrinaut

From `../hash/libs/@hashintel/petrinaut/package.json` and
`../hash/libs/@hashintel/petrinaut/AGENTS.md`:

- **React 19.2.6**, `react`/`react-dom` `^19.0.0` as peer deps.
- **React Compiler enabled** with `panicThreshold: "critical_errors"` — the
  build fails on critical errors unless opted out with `"use no memo"`. AGENTS.md
  forbids `useMemo`/`useCallback`/`React.memo` absent a specific reason.
- **ESM only** (`"type": "module"`), Vite 8 + Rolldown library build.
- **Panda CSS** for all styling (`css()`, `cva()` from `@hashintel/ds-helpers/css`),
  with a shipped panda preset and `panda.buildinfo.json`.
- **`use()` for context, not `useContext()`**; function components only.
- **Type-checked with `tsgo`** (`@typescript/native-preview`), tested with vitest,
  linted with oxlint `--type-aware`.
- **No `@local/*` imports** — AGENTS.md states this explicitly because the
  package is published.

Notable runtime deps that constrain a co-resident library:
`@xyflow/react` 12.10.1 (canvas), `monaco-editor` 0.55.1 +
`@monaco-editor/react` (code surfaces), `@ark-ui/react` 5.37.2, `uplot`,
`@tanstack/react-form`, `@babel/standalone` (visualizer compilation), and
crucially **`ai` 6.0.182 + `@ai-sdk/react` 3.0.184** — the assistant is built on
the Vercel AI SDK v6.

Peer deps include `@hashintel/ds-components` and `@hashintel/ds-helpers` as
`workspace:^`, both published (0.2.2 / 0.2.1) — so an external consumer must
install HASH's design system alongside Petrinaut. That is a real but bounded tax.

### 1.3 `petrinaut-core` is the important one

`../hash/libs/@hashintel/petrinaut-core/package.json`:

```json
"deps": { "elkjs": "0.11.0", "immer": "10.1.3", "uuid": "14.0.0",
          "vscode-languageserver-types": "3.17.5", "zod": "4.4.3" },
"peer": { "typescript": ">=5.5" }
```

Framework-free ESM with subpath exports: `.`, `./ai`, `./compiled-model`,
`./examples`, `./hir`, `./hir-runtime`, `./optimization`, `./workers/lsp`,
`./workers/monte-carlo`, `./workers/simulation`. No React, no DOM in the parts
that matter (the file-format and AI modules are documented "Pure — no DOM, no
I/O"). This is the single most consequential fact in the survey: **anything
brunch needs from Petrinaut short of the canvas is available as a five-dependency
Node-importable package.**

### 1.4 Deployment / how it runs

- Demo site: Vercel, `../hash/apps/petrinaut-website/vercel.json` — Vite SPA with
  rewrites for `/brunch` and `/optimization`, plus one serverless function
  `api/chat.ts` at `maxDuration: 300`.
- In HASH: the editor runs in a **sandboxed null-origin iframe** at
  `../hash/apps/hash-frontend/src/pages/processes/[uuid]/embed.page/`, hosted by
  `[uuid].page/process-editor.tsx`, with the AI request relayed over a
  postMessage bridge to a Next.js Pages-Router **Edge** route.

  **Why the sandbox exists, and why it constrains everything** (§3.5, and decisive
  for §6a): the editor compiles and runs _user-authored code_ — place visualizers
  via Babel, metric and scenario expressions via `new Function()` — so it needs
  `unsafe-eval`. It is therefore given `sandbox="allow-scripts allow-forms"`
  **without** `allow-same-origin`, yielding an opaque origin that cannot read
  HASH cookies, `localStorage`, or IndexedDB, cannot call HASH's API as the user,
  and cannot touch the parent DOM (`process-editor.tsx:355-371`, `1125-1141`).
  A dedicated stricter CSP is built by `buildEmbedCspHeader()` in
  `../hash/apps/hash-frontend/src/lib/csp.ts:123-171` (applied via
  `src/middleware.page.ts`): `default-src 'none'`, `form-action 'none'`, and
  critically **`connect-src 'self'`** — so code inside the iframe has essentially
  no network reach. That is precisely why persistence _and_ the AI stream must
  round-trip through postMessage, and why the host hard-codes the AI and optimizer
  URLs and forwards only the body, so the untrusted iframe can never make the host
  fetch an arbitrary target. `allow-forms` is present only because the AI chat
  form's submit event is otherwise blocked.

- Release: `../hash/.github/workflows/release.yml` runs changesets on push to
  `main`; `canary-release.yml` is `workflow_dispatch` only.

### 1.5 Cadence and staleness (risk-relevant)

- 42 commits touching the two Petrinaut libs + website in the last 8 weeks.
- Contributors in that window: Chris Feijoo (19), claude[bot] (10), Alex Leon (6),
  Yannis Zachos (2), plus Tim Diekmann, Kushida, Ciaran Morinan.
- **Last npm publish: 2026-06-03** (`npm view @hashintel/petrinaut time.modified`).
- **22 unreleased changesets** target `@hashintel/petrinaut` (1 minor, 21 patch)
  and 20 target `petrinaut-core`, out of 45 pending repo-wide. Unreleased work
  includes `.changeset/petrinaut-hir-compiler.md` (replaces Babel with a new HIR
  compiler; explicitly breaking for code outside the supported TS subset),
  `.changeset/petrinaut-actual-mode.md`, and
  `.changeset/petrinaut-sdcpn-capabilities.md`.

So: the published package is two months behind an actively-moving `main`, and the
Brunch Actual-mode integration is _not in any published version_. Consuming
Petrinaut from npm today means either accepting a June build or pulling from the
monorepo.

---

## 2. The assistant

### 2.1 Where it lives

The AI contract is owned by **core**, not the UI:
`../hash/libs/@hashintel/petrinaut-core/src/ai.ts` (292 lines) exports
`petrinautAiPrompt`, `petrinautAiTools`, per-tool zod input schemas, and
`createPetrinautAiWritableCallbacks`. Both server entry points import it:

- `../hash/apps/hash-frontend/src/pages/api/petrinaut-ai-chat.api.ts` (HASH)
- `../hash/apps/petrinaut-website/api/chat.ts` (demo site)

The UI surface is `../hash/libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`
(697 lines) plus a `ai-assistant-panel/` directory (transports, tool summaries,
docs content, interactive tools registry).

### 2.2 Prompting — the load-bearing excerpt

The system prompt is a single template literal at
`../hash/libs/@hashintel/petrinaut-core/src/ai.ts:235-292`. It opens:

> You are an expert assistant for building Stochastic Dynamic Coloured Petri Nets
> (SDCPNs) in Petrinaut.

**It already specifies interview-first elicitation** (`ai.ts:245-253`):

> Interview first, build second. Before creating a new net (or adding a
> substantial new subsystem to an existing one), do NOT jump straight to tool
> calls. Run a brief, focused interview to establish:
>
> 1. Process structure & timing — the key states/places, the events/transitions
>    between them, capacity or routing constraints, and the typical rates/durations
>    […] Flag where stochastic vs. predicate vs. continuous dynamics seem to fit.
> 2. Observables & metrics — what the user wants to measure once the model runs […]
> 3. Scenarios — the what-if conditions they want to compare […]
>
> Keep it tight: ask 2–4 grouped questions per turn, not a long form. Restate what
> you already understand so the user only has to fill gaps. If the request is
> already concrete and well-scoped […] skip the interview and act.
>
> Escape hatch. Every time you ask questions, explicitly tell the user they can
> say "make it up", "use sensible defaults", or similar, and you will pick
> plausible values (with a one-line justification for each major choice) and
> proceed.

The rest of the prompt is a ~20-line modelling policy (prefer small mutations,
check `extensions` before using optional SDCPN features, use scenario parameters
for tunable assumptions), a **"Validate every code-writing change"** rule
requiring a diagnostics call after any code mutation, a warning that place names
are part of the code surface so renames must update every dependent lambda/kernel/
metric in the same batch, an eight-bullet **code-surface cheatsheet** giving exact
runtime shapes for lambdas / kernels / dynamics / visualizers / metrics /
scenario initial state, an auto-layout policy, and finally:

> Here is a compact example Petrinaut document demonstrating coloured tokens,
> stochastic and predicate transitions, transition kernels with distributions,
> continuous dynamics, parameters, visualizer code, and scenarios:

…followed by `JSON.stringify(probabilisticSatellitesSDCPN, null, 2)` inlined into
the prompt (`ai.ts:290-292`). So the prompt carries a full worked example net as a
few-shot, from `petrinaut-core/src/examples`.

This is a mature, domain-specific prompt. It is one string with no templating,
no per-session variation, and no strategy/policy layer — the "quiver of
strategies" idea in the brunch spec has no counterpart here.

### 2.3 Model / provider wiring

Both endpoints are near-identical thin proxies. From
`../hash/apps/hash-frontend/src/pages/api/petrinaut-ai-chat.api.ts`:

- `const DEFAULT_MODEL = "gpt-5.5-2026-04-23"`, overridable by
  `process.env.PETRINAUT_AI_MODEL` (line 47, 212).
- `createOpenAI({ apiKey })` → `createProviderRegistry({ openai })` →
  `registry.languageModel(\`openai:${modelId}\`)`. **OpenAI only**; the registry
  indirection exists but no second provider is registered anywhere.
- `streamText({ model, system: petrinautAiPrompt, messages, tools })` with
  `providerOptions.openai = { reasoningEffort: "medium", reasoningSummary: "auto",
textVerbosity: "medium" }`.
- Returns `result.toUIMessageStreamResponse({ sendReasoning: true, … })`.
- Pinned to `runtime: "edge"`. The comment at lines 18-42 explains this is
  load-bearing: App Router is incompatible with the repo's custom `pageExtensions`,
  and Vercel's Node serverless functions buffer the whole response, killing
  streaming. Edge returns a Web `Response` over a `ReadableStream`.
- Auth: Ory session cookie resolved by fetching `${apiOrigin}/auth/sessions/whoami`
  (the Ory SDK is not edge-safe, line 138-141).
- Rate limiting: in-memory token buckets, 10 requests / 30 s per Ory identity,
  with a candid `@todo move to a durable store before relying on this` (line 82).

### 2.4 Tool-use shape — the key architectural fact

The tool _schemas_ are declared server-side but **every tool executes in the
browser**. `petrinautAiTools` entries carry only `{ description, inputSchema }`
(`ai.ts:39-42`) — no `execute`. The server further strips them to a
validation-only `ToolSet` with `outputSchema: z.unknown()`
(`petrinaut-ai-chat.api.ts:61-70`).

Execution happens in `ai-assistant-panel.tsx` inside `useChat`'s `onToolCall`
(from line ~340), dispatching to:

- `applyPetrinautAiMutation` — looks up
  `createPetrinautAiWritableCallbacks(instance)[toolName]` and calls it against
  the live editor instance, returning a human-readable summary as tool output.
- `applyPetrinautAiCommand` — an exhaustive switch, currently only
  `applyAutoLayout`.
- Read tools handled inline: `getLatestNetDefinition` returns
  `{ title, definition: instance.definition.get(), extensions: instance.extensions }`;
  `getNetCompilationErrors` returns formatted TS diagnostics; `readPetrinautDoc`
  returns one of eleven bundled user-guide pages.

The tool surface is the editor's mutation API verbatim — the prompt says so:
"The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full
entity objects where required, and canvas positions." Mutation schemas live in
`../hash/libs/@hashintel/petrinaut-core/src/action-schemas.ts` (561 lines);
AI-exposed commands in `command-schemas.ts` (53 lines). Every schema must carry a
`.describe()` — `getSchemaDescription` throws otherwise (`ai.ts:50-55`).

Read tools: `getLatestNetDefinition`, `getNetCompilationErrors`,
`readPetrinautDoc`. Write: all mutations + `setNetTitle` + `applyAutoLayout`.

### 2.5 Conversation state and the agentic loop

`useChat<PetrinautAiMessage>` in `ai-assistant-panel.tsx` with:

- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` — this is
  the entire agent loop. Multi-step tool use is the AI SDK's client-driven
  round-trip, not a server-side loop.
- `experimental_throttle: 80` (ms) to stop reasoning deltas locking the main thread.
- Two **transport decorators**, composed in `buildWrappedTransport`:
  - `createDiagnosticsAwareAiTransport` — after a code-writing mutation, waits for
    the LSP diagnostics version to bump (1 s timeout, 25 ms poll) and injects a
    diagnostics context message into the next request. This is how "the assistant
    sees TypeScript errors without the user relaying them."
  - `createReasoningTimingAwareAiTransport` — stamps reasoning chunks with
    `Date.now()` so elapsed-time survives panel close/reopen.
- Host-pluggable transport via the `aiAssistant` prop
  (`../hash/libs/@hashintel/petrinaut/src/ui/petrinaut.tsx:39-44`):

```ts
export type PetrinautAiAssistant = {
  messages?: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onMessages?: (messages: PetrinautAiMessage[]) => void;
  transport: PetrinautAiTransport; // = ChatTransport<PetrinautAiMessage>
};
```

`aiAssistant` is **optional** on `PetrinautProps`; omitting it disables the panel.
This is the cleanest extension point in the whole codebase for brunch purposes:
a host supplies an arbitrary `ChatTransport` and owns message storage.

Read-only rules are enforced client-side via `useReadOnlyReason` and
`simulateModeAllowedMutationNames`; the panel renders only in Edit mode
(`../hash/libs/@hashintel/petrinaut/docs/ai-assistant.md`).

---

## 3. IR and persistence of assistant output

### 3.1 There is no intermediate representation

The assistant does not emit a net document. It emits **a stream of mutation tool
calls against the live editor**, each validated by a zod schema and applied
immediately to the in-memory SDCPN. The SDCPN itself is the only representation.
There is no plan object, no proposed-net staging area, no diff-then-apply step.
Consequence: the assistant's output is not an artifact you can inspect, version,
or hand to another system — it is a side effect on a document.

### 3.2 Net persistence in HASH

`../hash/apps/hash-frontend/src/pages/processes/[uuid].page/process-editor/use-process-save-and-load.tsx`:
`persistDefinition(petriNet: SDCPN, title: string)` writes a HASH graph entity of
type `systemEntityTypes.petriNet`, patching two properties:

- `systemPropertyTypes.definitionObject` — the **entire SDCPN as one opaque JSON
  blob**, `dataTypeId: blockProtocolDataTypes.object`.
- `systemPropertyTypes.title` — text.

So HASH's graph does not model places/transitions as entities; it stores the net
as a single property value. Revision history comes free from HASH's entity
versioning (`refetchRevisions`, and a `version-picker.tsx` in the embed).

The editor consumes storage through a narrow interface it does not own —
`PetrinautDocHandle` in
`../hash/libs/@hashintel/petrinaut-core/src/handle/types.ts`:

```ts
export interface PetrinautDocHandle {
  readonly id: DocumentId;
  readonly capabilities?: PetrinautHandleCapabilities;
  readonly state: ReadableStore<DocHandleState>;
  whenReady(): Promise<void>;
  doc(): SDCPN | undefined;
  change(fn: (draft: SDCPN) => void): void;
  subscribe(listener: (event: DocChangeEvent) => void): () => void;
  readonly history?: PetrinautHistory;
}
```

`createJsonDocHandle({ initial: SDCPN, capabilities?, historyLimit? })`
(`handle/json-doc-handle/create-json-doc-handle.ts:51-88`) is the default
in-memory Immer-backed implementation, with patch-based undo/redo (default 50
checkpoints). The docstring states the contract's purpose plainly: "Petrinaut is
built around the `PetrinautDocHandle` contract so hosts can provide different
document backends, such as local JSON state, collaborative documents, or
read-only mirrors."

### 3.3 AI conversation persistence: localStorage

`../hash/apps/hash-frontend/src/pages/processes/[uuid].page/process-editor/ai-messages-storage.ts`:

> `localStorage`-backed persistence for Petrinaut AI-assistant conversations,
> keyed by net. Lives on the host (`process-editor`) because the Petrinaut editor
> runs inside a sandboxed null-origin iframe whose opaque origin has no usable
> `localStorage`; the iframe relays conversation updates over the postMessage
> bridge and the host reads/writes here.

Root key `"petrinaut-ai-messages"`, shape `Record<netKey, PetrinautAiMessage[]>`,
with corrupt JSON and quota failures swallowed to empty. The iframe sends
`{ kind: "aiMessagesChanged", messages }` over the bridge
(`embed.page/embed-content.tsx:286-287`) and the host writes it
(`process-editor.tsx:792-796`).

**The interview transcript is not in the database.** It is browser-local,
per-device, and lost on cache clear.

### 3.4 The demo site is a complete, minimal reference host

`../hash/apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx`
is the smallest working integration in the repo and the best thing to read before
costing §6b. It hosts the full editor from a plain Vite React SPA with:

```ts
import {
  createJsonDocHandle,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiChatTransport,
  type PetrinautAiMessage,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";
```

…a `createJsonDocHandle` per net, nets in localStorage (`use-local-storage-sdcpns`),
AI messages in localStorage (`use-local-storage-ai-messages`), and the AI wiring
reduced to one expression: `new DefaultChatTransport({ api: "/api/chat" })` passed
as `aiAssistant={{ transport, messages, onMessages, onClearMessages }}`. So both
`Petrinaut` and a ready-made `DefaultChatTransport` are re-exported from
`@hashintel/petrinaut/ui` — a host does not have to implement `ChatTransport`
itself unless it wants to.

Note this means **neither host persists nets server-side except HASH**: the demo
site keeps nets and conversations in localStorage.

### 3.5 The postMessage bridge — the full host contract

Because the editor runs in a sandboxed null-origin iframe, everything it needs
from HASH crosses a typed message bridge. The message union is in
`../hash/apps/hash-frontend/src/pages/processes/shared/messages.ts` and is the
most complete statement anywhere of what a host must provide:

- **Host → iframe**: `init`, `load`, `setReadonly`, `setCapabilities`,
  `revisionsList`, `saveResult`, `aiChatResponseStart`, `aiChatChunk`,
  `aiChatEnd`, `aiChatError`, `optimizationCreateResult`,
  `optimizationResponseStart`, `optimizationChunk`, `optimizationEnd`,
  `optimizationError`.
- **iframe → host**: `ready`, `dirtyChanged`, `titleChanged`, `requestSave`,
  `requestNavigateBack`, `requestRevision`, `reportError`, `aiChatRequest`,
  `aiChatAbort`, `optimizationCreate`, `optimizationAttach`,
  `optimizationAbort`, `optimizationCancel`, `aiMessagesChanged`,
  `aiMessagesCleared`.
- Load state is `{ kind: "draft"; seedKey } | { kind: "saved"; entityId; userEditable }`.

Two things worth noting. First, **the AI stream is chunk-relayed through the
bridge** (`aiChatRequest` → `aiChatChunk`\* → `aiChatEnd`), because the null-origin
iframe cannot reach the API route itself; the host page fetches it with the user's
session cookie (documented at `petrinaut-ai-chat.api.ts:34-38`). Second, roughly
half the surface is optimization plumbing — the AI half is small, and it is all
transport and message storage, with no notion of a session, a capture store, or a
resumable interview.

### 3.6 Provenance and assumption capture: none

I searched for provenance/rationale/assumption capture and found none. Concretely:

- No field on `SDCPN` or any of its members records where a value came from,
  who asserted it, or how confident anyone was. The type is
  `{ places, transitions, types, differentialEquations, parameters, scenarios?,
metrics?, subnets?, componentInstances? }` (§5).
- The prompt asks the model to give "a one-line justification for each major
  choice" when it invents values, and to use final text to "explain important
  modelling choices, assumptions, how the pieces work together" — but that
  justification lands in **chat prose**, which is stored in localStorage and never
  linked to the net element it justifies.
- The file format's only metadata is `meta: { generator, generatorVersion? }`.

For an elicitation product whose value proposition includes defensible
assumptions, this is a genuine greenfield gap rather than something to inherit.
It is also the clearest place brunch adds something Petrinaut does not have.

---

## 4. Task / job / subagent architecture

**There is none, around the assistant.** Specifically:

- No queue, no background job, no durable workflow for AI work. The only
  agentic loop is `sendAutomaticallyWhen` in the client `useChat`.
- No multi-agent or subagent structure. `petrinautAiPrompt` is one system prompt;
  a repo-wide grep for its consumers returns exactly the two proxy endpoints, the
  panel, and `ai.test.ts` — nothing else imports it.
- No server-side session state at all. Both endpoints are stateless: validate
  messages, `streamText`, stream back.
- Streaming: SSE-style UI message stream from the AI SDK
  (`toUIMessageStreamResponse`), with `sendReasoning: true`.

Background compute _does_ exist, but for simulation, not AI:

- Web Workers for simulation, Monte Carlo, and the LSP
  (`petrinaut-core/src/workers/{simulation,monte-carlo,lsp}`), with a documented
  frame/backpressure protocol and ack policies per play mode
  (`../hash/libs/@hashintel/petrinaut/ARCHITECTURE.md:13-49`).
- A real detached-job system for **optimization**: `../hash/apps/petrinaut-opt`
  (Python/Optuna, `pyproject.toml`, `uv.lock`, `openapi/`, `docker/`) proxied
  through `../hash/apps/hash-api/src/petrinaut-optimizer/` with
  `create-petrinaut-optimization-run-handler.ts`, an SSE events handler, and a
  cancel handler. `.changeset` and git log show "detached, reconnectable
  optimization runs […] proxied through NodeAPI" (FE-1224/1225, #9067).

The optimization path is the one existing precedent in Petrinaut for
"long-running server-side work with streamed progress" — worth reading if brunch
ever needs to run inside HASH's backend, but it is a Python compute service, not
an agent host. Its protocol (`../hash/apps/petrinaut-opt/README.md:11-40`) is
`POST /optimize/runs` → `201 {run_id}`; `GET /optimize/runs/{run_id}/events` →
replayable `text/event-stream` resumable by cursor / `Last-Event-ID`;
`DELETE /optimize/runs/{run_id}` cancels. Run state is an **in-memory dict with a
reaper — no database** (`src/optimization_runs.py:232-440`). The HASH side
(`hash-api/src/petrinaut-optimizer/setup-petrinaut-optimizer-handler.ts`) is a
stateless proxy; `/capabilities` is config-only rather than a healthcheck, and the
frontend **fails open**, hiding the UI only on an explicit `{ optimization: false }`.
The editor works fully without it: `PetrinautOptimizationContext` defaults to
`null` = unavailable, UI hidden
(`petrinaut/src/react/optimization-context.ts:5-11`).

**Correction to "no headless path", worth knowing for §6a.** The optimizer service
delegates _all_ Petrinaut semantics to `@hashintel/petrinaut-cli` over a **stdio
subprocess** — `subprocess.Popen(("petrinaut", ...))` in
`../hash/apps/petrinaut-opt/src/petrinaut_client.py:11,60-119`. So a headless,
Node-based way to _load and simulate_ a net does exist and is in production use.
What does not exist headlessly is net _generation_ by the assistant — that remains
browser-only. The CLI is `private: true` and unpublished, so consuming it means
vendoring or building from the monorepo.

Note for §6a: the monorepo _does_ have serious agent infrastructure —
`../hash/apps/hash-ai-worker-ts` (Temporal-based) and `../hash/apps/mcp` — but
Petrinaut is wired to neither.

---

## 5. Net file format (the artifact boundary)

### 5.1 The runtime type

`../hash/libs/@hashintel/petrinaut-core/src/types/sdcpn.ts:210-220`:

```ts
export type SDCPN = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  scenarios?: Scenario[];
  metrics?: Metric[];
  subnets?: Subnet[];
  componentInstances?: ComponentInstance[];
};
```

Five required arrays (may be empty), four optional. Zod schemas for each member
live in `../hash/libs/@hashintel/petrinaut-core/src/action-schemas.ts` (exported
via `ai.ts` as `placeSchema`, `transitionSchema`, `arcEndpointSchema`,
`colorSchema`, `parameterSchema`, `differentialEquationSchema`, `metricSchema`,
`scenarioSchema`, `subnetSchema`, `componentInstanceSchema`), plus
`src/schemas/{entity,metric,scenario}-schema.ts`.

### 5.2 The file format

`../hash/libs/@hashintel/petrinaut-core/src/file-format/`:

| File                    | Role                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `types.ts`              | `SDCPN_FILE_FORMAT_VERSION = 1`, `sdcpnFileSchema`, `legacySdcpnFileSchema` |
| `parse-sdcpn-file.ts`   | `parseSDCPNFile(data: unknown): ImportResult`                               |
| `serialize-sdcpn.ts`    | `serializeSDCPN({ petriNetDefinition, title, removeVisualInfo? })`          |
| `remove-visual-info.ts` | strips `x`/`y`, `displayColor`, `iconSlug`                                  |
| `sdcpn-to-tikz.ts`      | LaTeX export (structure only)                                               |

The versioned root schema (`types.ts:160-173`):

```ts
const fileMetaSchema = z.object({
  generator: z.string(),
  generatorVersion: z.string().optional(),
});

export const sdcpnFileSchema = sdcpnSchema.extend({
  version: z.number().int().min(1).max(SDCPN_FILE_FORMAT_VERSION),
  meta: fileMetaSchema,
  title: z.string(),
});
```

**A `meta.generator` field already exists in the format.** Petrinaut writes
`generator: "Petrinaut"` (`serialize-sdcpn.ts`); nothing stops brunch writing
`generator: "brunch"`. This is the format anticipating external producers.

`parseSDCPNFile` is pure ("Pure — no DOM, no I/O. Callers […] are responsible for
sourcing the data") and handles three cases: versioned v1, legacy (no
`version`/`meta`), and pre-2025-11-28 formats. It rejects future versions
explicitly rather than silently stripping an unknown `version`
(`parse-sdcpn-file.ts:130-150`) and returns typed Zod issue paths on failure —
so an external generator gets actionable errors.

Both `parseSDCPNFile` and `serializeSDCPN` are exported from the package index
(`petrinaut-core/src/index.ts:429,432`).

**There is no file-format migration system beyond v1 + the legacy fallback.**
`../hash/libs/@hashintel/petrinaut-core/src/schema-migration.ts` looks like one by
name but is unrelated: it migrates _positional scenario rows_ when a user edits a
colour type's `elements` array in the editor (`TypeElementEdit` = add / remove /
move / changeType), coercing stored cells to the new element types. Its docstring
notes "Name-only renames are NOT represented here: scenario rows are positional,
so renames require no row migration." Nothing to do with files.

**Two schema tiers, and the difference matters a lot for a generator.**

- **Strict tier** — `../hash/libs/@hashintel/petrinaut-core/src/schemas/entity-schemas.ts`,
  `metric-schema.ts`, `scenario-schema.ts`. Every entity is `z.strictObject` with
  no defaults, ids via `idSchema`, place/transition names via `entityNameSchema`
  (PascalCase). **This is the tier the AI mutation tools and the runtime use** —
  unknown keys are a hard failure.
- **Permissive tier** — `file-format/types.ts:28-146`, used **only on import**. It
  re-wraps each strict schema's `.shape` in a plain `z.object` and loosens fields:

```ts
const placeSchema = z.object({
  ...currentPlaceSchema.shape,
  id: z.string(), // overrides idSchema
  name: z.string(), // overrides entityNameSchema — no PascalCase check
  x: z.number().optional(),
  y: z.number().optional(),
});
```

Its own comment explains why: "File import intentionally stays more permissive
than current runtime/action schemas: older files may omit visual fields and input
arc type, and imported display names may predate current UI validation rules."

Three consequences for brunch:

1. **Unknown keys on an individual place/transition/colour in a _file_ are
   stripped, not rejected** — the opposite of the AI-tool path. So a file can
   carry per-element extra keys; Petrinaut just drops them on import.
2. **Import bypasses name validation.** A file may contain a place named
   `"Order queue"`. It will load — and then break every code surface, because
   place names are used as identifiers (`input.PlaceName`,
   `state.places.PlaceName.count`). A generator must enforce PascalCase itself;
   the file schema will not.
3. **Import loses an invariant check.** `currentInputArcSchema` requires exactly
   one of `placeId` / `endpoint` via `.check(assertSingleArcEndpoint)`
   (`entity-schemas.ts:78-98`), but re-wrapping `.shape` in `z.object` drops the
   `.check`. An arc with neither or both passes validation and only throws later,
   at `getArcEndpoint` (`../hash/libs/@hashintel/petrinaut-core/src/arc-endpoints.ts:33`).
   This is a live footgun for an external generator — credit to the parallel
   survey for spotting it.

Note also that arcs have **two accepted endpoint forms**: the legacy shorthand
`{ placeId, weight }` and the newer `{ endpoint: { kind: "place", placeId }, weight }`.
Repo examples use both (§5.6).

The strict-tier schemas carry long `.meta({ description })` strings on nearly
every field — they are simultaneously the validation contract and the model's
field documentation, and they are the right thing to read before generating nets.

Required vs optional in the strict tier, for the record: **Place** requires `id`,
`name`, `colorId` (nullable), `dynamicsEnabled`, `differentialEquationId`
(nullable), `x`, `y`; optional `isPort`, `visualizerCode`, `showAsInitialState`.
**Transition** requires all of `id`, `name`, `inputArcs`, `outputArcs`,
`lambdaType`, `lambdaCode`, `transitionKernelCode`, `x`, `y` with nothing
optional. **Color** requires `id`, `name`, `iconSlug`, `displayColor`, `elements`;
each element requires `elementId`, `name` (must match
`/^[A-Za-z_$][A-Za-z0-9_$]*$/`), `type`. **Parameter** requires `id`, `name`,
`variableName` (lower*snake_case), `type`, `defaultValue` (a \_string*, refined by
`getParameterValueError`). **Scenario** requires `id`, `name`,
`scenarioParameters`, `initialState`, with `parameterOverrides` defaulting to
`{}`; scenario parameter `type` admits a fourth value, **`ratio`**, that net
parameters do not. **Metric** requires `id`, `name`, `code`. **Subnet** requires
its own `places`, `transitions`, `types`, `differentialEquations`, `parameters`
and notably has **no** `scenarios`/`metrics`/nested `subnets`.

**Forgiveness on import.** `fillMissingVisualInfo` defaults every missing `x`/`y`
to 0 and every `Color` to `iconSlug: "circle"`, `displayColor: "#808080"`, and
recurses into subnets; `hasMissingPositions` reports whether ELK layout is needed
(`parse-sdcpn-file.ts:19-111`). So **a generator may omit all layout and all
palette information** and still produce a net that opens and looks reasonable.

### 5.3 Minimum viable externally-generated net

**At the file level the floor is lower than the runtime type suggests.** In
`sdcpnSchema` only `places` and `transitions` lack a default; `types`,
`differentialEquations`, `parameters`, `scenarios`, `metrics`, `subnets`, and
`componentInstances` all carry `.default([])` (`types.ts:148-158`). So the
smallest file Petrinaut will accept is:

```json
{
  "version": 1,
  "meta": { "generator": "brunch", "generatorVersion": "0.1.0" },
  "title": "Elicited process model",
  "places": [
    /* … */
  ],
  "transitions": [
    /* … */
  ]
}
```

Everything else — the other seven arrays, all `x`/`y`, all colour palette info —
is filled by defaults and ELK.

At the _runtime_ level (constructing an `SDCPN` in code rather than parsing a
file, e.g. if brunch depends on `petrinaut-core`), the five required arrays must be
present explicitly. The `toSDCPN` normalizer at
`../hash/apps/petrinaut-website/src/main/app/brunch-demo/brunch-definition.ts:23-47`
is a working demonstration of that floor. It fills:

- per place: `{ id, name, colorId: null, dynamicsEnabled: false,
differentialEquationId: null, x, y }`
- per transition: `{ id, name, inputArcs, outputArcs, lambdaType: "predicate",
lambdaCode: "", transitionKernelCode: "", x, y }`
- `types: []`, `differentialEquations: []`, `parameters: []`

That is the whole minimum: a graph with ids, names, and arcs, and three empty
arrays. Arc shape is `{ placeId, weight, type?: "standard" | "read" |
"inhibitor" }` on input and `{ placeId, weight }` on output.

### 5.4 What the net file does NOT contain (important for generation)

**There is no initial marking in the net.** Greps for `marking` / `tokens` /
`initialMarking` in both `types/sdcpn.ts` and `file-format/types.ts` return zero
hits. `SDCPN` describes _structure only_. Initial state is either:

- **session state** — `SimulationProvider`'s `initialMarking`
  (`Record<placeId, TokenRecord[] | number>`), which ARCHITECTURE.md explicitly
  calls "configuration for the _next_ run" that "survives `reset()`" and is never
  serialized into the net; or
- **a scenario** — `scenario.initialState`, a discriminated union
  (`schemas/scenario-schema.ts:42-80`):
  - `{ type: "per_place", content }` — **keyed by place ID**; uncoloured values are
    _string expressions_ with `parameters` and `scenario` in scope (e.g.
    `"scenario.population * (1 - scenario.infected_ratio)"`, `Math.round`ed and
    clamped ≥ 0); coloured values are row arrays in colour-element order.
  - `{ type: "code", content }` — a function body returning an object **keyed by
    place NAME**, an asymmetry the schema itself flags.

So **a brunch-generated net that should start with tokens somewhere must emit a
`scenario`.** A bare `places` + `transitions` file loads as an empty-marking net
that will not do anything when simulated. This is the single most likely way for a
naive generator to produce a file that "opens in Petrinaut" but is useless — worth
building into brunch's output contract and its own validation.

**There is also no timing field.** No `delay`, `duration`, or `firingTime` exists
anywhere. Durations are modelled purely as `lambdaType: "stochastic"` plus a
`lambdaCode` returning a rate in firings per simulation second (with the
non-exponential patterns documented in `docs/useful-patterns.md`). Likewise
`seed`, `dt`, and `maxTime` are session-only
(`petrinaut-core/src/simulation/api.ts:62-88`), never in the file.

### 5.5 SDCPN features in the format today — all present

`../hash/libs/@hashintel/petrinaut-core/src/extensions.ts:11-49`:

```ts
export const PETRINAUT_EXTENSION_NAMES = [
  "colors",
  "stochasticity",
  "dynamics",
  "parameters",
  "subnets",
] as const;
export const DEFAULT_PETRINAUT_EXTENSIONS = {
  colors: true,
  stochasticity: true,
  dynamics: true,
  parameters: true,
  subnets: true,
};
```

All five ship enabled by default. Mapping to the SDCPN acronym:

- **Dynamic colouring** — `types: Color[]` (typed token attributes: real, integer,
  boolean, uuid, string), `place.colorId`, transition kernels producing typed
  output tokens.
- **Stochastic transitions** — `transition.lambdaType: "stochastic" | "predicate"`
  with `lambdaCode`; rate in firings per simulation second, `0` disables,
  `Infinity` always fires. `Distribution.Gaussian/Uniform/Lognormal` available in
  kernels.
- **Guards** — the `predicate` lambda type is the guard mechanism; plus
  **inhibitor arcs** and **read arcs** as first-class arc types.
- **Continuous dynamics** — `differentialEquations: DifferentialEquation[]` with
  `Dynamics((tokens, parameters) => …)` returning derivatives for real-valued
  elements; requires both `colors` and `dynamics`.
- **Hierarchical subnets** — `subnets: Subnet[]` + `componentInstances`, with
  boundary places exposed as ports. UI is behind **Settings → Net Components**
  (`docs/drawing-a-net.md:76-80`).
- Also in-format: global `parameters`, named `scenarios` (parameter overrides +
  per-place or code-mode initial marking), and `metrics` (compiled scalar
  functions over simulation state).

A host can _disable_ extensions per document via
`PetrinautHandleCapabilities.disabledExtensions`, and
`resolvePetrinautHandleCapabilities` enforces the dependency that disabling
`colors` also disables `dynamics`. `sanitizeSDCPNForExtensions` strips disabled
content on handle creation. The assistant is told to consult `extensions` before
authoring extension-specific content.

### 5.6 Import/export UX

`../hash/libs/@hashintel/petrinaut/docs/drawing-a-net.md:161-173`:

> **Export**: **JSON** — the full SDCPN […] **and** canvas positions / display
> colours. The format other Petrinaut instances can re-import faithfully.
> **JSON without visual info** — the same payload minus node positions and type
> display colours. Useful when only the logical structure matters […] On import,
> the receiving editor applies auto-layout to fill in positions.
> **TikZ** — […] Token types, dynamics, read/inhibitor arcs, scenarios, and
> metrics are **not** encoded.
>
> **Import**: loads a net from a `.json` file. If node positions are missing, an
> automatic layout is applied on load.

**Important caveat, now confirmed: HASH's embed has no Import button.** The menu
items are host-controlled via `PetrinautProps.hideNetManagementControls`
(`petrinaut.tsx:55-65`), and
`../hash/libs/@hashintel/petrinaut/src/ui/views/Editor/editor-view.tsx:113` reads:

```ts
const showNetManagementMenuItems = hideNetManagementControls === undefined;
```

HASH's embed passes `hideNetManagementControls="except-title"`
(`../hash/apps/hash-frontend/src/pages/processes/[uuid]/embed.page/embed-content.tsx:438`),
so `showNetManagementMenuItems` is `false` and the gated items — **New, Open,
Import, Load example** (`editor-view.tsx:259-330`) — are all absent. **Export,
Layout, and Docs are ungated and remain available.** So the asymmetry is: HASH can
export a net but cannot import one; demo.petrinaut.org (which passes nothing) has
the full set. See §6c for what this does to the artifact-boundary option.

**Example nets to copy**, in `../hash/libs/@hashintel/petrinaut-cli/examples/` —
note most are in the _legacy_ (unversioned) shape, so pick the right model:

- **`supply-chain-profit-model.json`** — the only **versioned** example:
  `version: 1`, `meta: { generator: "Petrinaut" }`, plus empty `subnets` and
  `componentInstances`, and arcs in the newer
  `endpoint: { kind: "place", placeId }` form. **This is the file to model
  brunch's output on.**
- `sir-model.json` (7 KB, the smallest), `deployment-pipeline.json`,
  `satellites-launcher.json`, `production-with-machine-failure.json`,
  `supply-chain-with-disruption.json` — all **legacy**: no `version`/`meta`, arcs
  in the `placeId` shorthand.
- `supply-chain-profit-optimization.json` is a different format entirely
  (`kind: "petrinaut-optimization"`, schema at
  `petrinaut-core/src/optimization.ts:139-170`) — not a net.
- Also `../hash/libs/@hashintel/petrinaut/gen/ex-supplychain.gen.json` and
  `gen/ex-satellites.gen.json` — unversioned, and they carry an extra top-level
  `id` with no `scenarios`/`metrics`.

**No example net in the repo has non-empty `subnets`, `componentInstances`, or
`isPort`.** Hierarchy coverage is TypeScript-only
(`petrinaut-core/src/lsp/lib/helper/create-sdcpn.ts` plus tests). If the demo needs
hierarchical subnets, there is no worked JSON example to copy and that path is
comparatively unexercised — treat it as a spike, not a given.

---

## 6. Comparative audit

### 6a. brunch-in-Petrinaut (elicitor as a library Petrinaut imports)

**What would have to be true.** The elicitor would need to be an ESM package
importable by React 19 + React Compiler + Panda CSS code, with no `@local/*`
imports, type-checked under `tsgo`, linted by type-aware oxlint, versioned by
changesets, and released on `main` pushes.

Facts that cut against it:

- **The elicitor's shape is wrong for the slot that exists.** Petrinaut's AI
  extension point is `PetrinautAiAssistant`, i.e. a `ChatTransport` plus message
  storage. A transport is a request/response pipe. An elicitor that owns a
  conversation loop, an `ask` API, a capture envelope, an issue queue, and sweep
  bookkeeping (per brunch-lite's `CONTEXT.md`) does not fit behind a transport
  without either collapsing to a server the transport points at (which is §6c
  with extra steps) or reimplementing the loop client-side.
- **Petrinaut has no backend to host an LLM loop with persistence.** Both AI
  endpoints are stateless proxies; HASH's is pinned to the **Edge** runtime for
  streaming reasons documented at length, and Edge is a poor host for a
  stateful agent (no durable storage, and the existing rate limiter is already
  flagged as broken-by-design across isolates). The demo site has one Vercel
  function capped at 300 s. The one place in HASH that runs durable agent work is
  `hash-ai-worker-ts` (Temporal), which Petrinaut does not touch.
- **Conversation persistence today is localStorage.** Any elicitor needing a
  durable capture store must bring its own storage and a way to reach it from a
  sandboxed null-origin iframe — the iframe cannot even use `localStorage`, which
  is why the host relays messages over postMessage.
- **Release cadence is against a 5-week window.** npm is 2 months stale with 22
  pending changesets; landing brunch code in the published library means either
  waiting on HASH's release train or vendoring from the monorepo. Merging into
  `../hash` also means entering a repo with 42 Petrinaut commits in 8 weeks from
  4+ contributors, plus CI (`lint.yml` 16.5K, `test.yml` 15.6K, `deploy.yml` 28.2K).
- **Capability overlap is the real cost.** Petrinaut's assistant already
  interviews (§2.2) and already has the full mutation tool surface. Landing a
  second elicitor inside it means either replacing `petrinautAiPrompt` (a change
  to a shared published contract used by two apps) or running two assistants.

Facts that cut for it: the extension point is genuinely clean and optional;
`petrinautAiTools`/`petrinautAiPrompt` are already factored into core, so the
contract is designed to be swapped; and the demo would inherit the canvas,
diagnostics loop, and simulator for free.

**Risk against 5 weeks: high.** The blocking issue is not integration mechanics,
it is that the server-side home for an agent loop does not exist in Petrinaut and
would have to be built inside HASH's deployment.

### 6b. Petrinaut-in-brunch (net rendering/editing consumed by an elicitation app)

**Is the editor exported as a reusable package? Yes.**
`@hashintel/petrinaut@0.0.16` is on npm, `private: false`, with subpath exports
`.`, `./react`, `./ui`, `./styles.css`, `./panda-preset`.

What it needs from a host — `PetrinautProps`
(`../hash/libs/@hashintel/petrinaut/src/ui/petrinaut.tsx:50-69+`):

- `handle: PetrinautDocHandle` — **required**. The host owns storage; §3.2's
  interface is eight members and `createJsonDocHandle` covers the trivial case.
- Optional: `title`, `setTitle`, `readonly`, `hideNetManagementControls`,
  `existingNets`, `createNewNet`, `loadPetriNet`, `aiAssistant`, plus a
  `PetrinautSlots` mechanism (`src/ui/types/petrinaut-slots.ts`) for host-injected
  UI, and `NetManagement` context.

What it costs:

- **React 19.2.6 + React Compiler + Panda CSS.** brunch's substrate is the
  Pi/Flue agent family, and brunch-lite's own notes flag that Flue's rich path
  (`useFlueAgent`) is React-specific while `@flue/sdk` is framework-neutral. If
  brunch has no React UI shell yet, adopting Petrinaut means adopting one.
- **Peer deps on HASH's design system** (`@hashintel/ds-components`,
  `@hashintel/ds-helpers`) and a Panda preset + `panda.buildinfo.json` to wire
  into the consuming app's Panda config. Non-trivial build integration.
- **Heavy runtime**: xyflow, Monaco, uPlot, `@babel/standalone`, three Web
  Workers. Fine for a web app; a large surface to stand up in 5 weeks.
- **npm staleness bites hardest here**: the published 0.0.16 predates Actual mode
  and the HIR compiler, so consuming from npm gets a June editor.

**A much cheaper variant exists and should be scoped separately:** depend on
`@hashintel/petrinaut-core` only (five deps, no React) for SDCPN types, zod
validation, `parseSDCPNFile`/`serializeSDCPN`, ELK auto-layout, and — if wanted —
`petrinautAiTools`/`petrinautAiPrompt` as a starting point. brunch gets
type-safe, schema-validated net construction with no UI coupling at all. Nothing
in the repo does this yet, so it is untested as an integration, but the package
boundary supports it by construction.

**Risk against 5 weeks: medium for the full editor** (mostly React/Panda shell
work and stale-npm handling), **low for core-only**.

### 6c. Artifact-boundary decoupling (elicitor produces a net file Petrinaut opens)

**This is the only option where the mechanism already exists in shipped code, in
two independent forms.**

_Form 1 — the JSON file._ A generator must emit an object satisfying
`sdcpnFileSchema`: `version: 1`, `meta: { generator: string,
generatorVersion?: string }`, `title: string`, plus the five required SDCPN arrays
(§5.1). Layout and palette may be omitted entirely — `fillMissingVisualInfo`
defaults them and ELK lays the net out on load. Extension-heavy content is
optional; §5.3 gives the working minimum. Round-tripping is symmetric:
`serializeSDCPN` produces exactly what `parseSDCPNFile` accepts, and "JSON without
visual info" is explicitly the share-structure-only mode.

**Where the file can be opened matters, and it differs by host (§5.6).** The
hamburger → **Import** action exists on demo.petrinaut.org but is _hidden in
HASH_, which passes `hideNetManagementControls="except-title"`. So this option has
three sub-variants with different costs:

- **Demo site**: works today, zero code. `/` with the full menu, Import a
  brunch-generated `.json`.
- **HASH, via the graph**: skip the UI entirely — create a `petriNet` entity with
  the SDCPN in the `definitionObject` property (§3.2) and open
  `/processes/<uuid>`. No Petrinaut change needed, but brunch must talk to HASH's
  graph API and hold a session.
- **HASH, via the UI**: needs either a one-line prop change in
  `embed-content.tsx:438` or a new host-supplied import affordance. Small, but it
  is a change inside `../hash` with that repo's review and release cadence.

_Form 2 — the live SSE stream (already built, for brunch specifically)._ See §7.1.
A `/brunch?sse=<url>` route consumes `definition`, `initial_state`,
`transition_firing`, `terminal` events, normalizes the definition into a read-only
SDCPN with all extensions disabled, and renders it in Actual mode.

Costs and limits:

- The artifact carries **almost no sanctioned provenance** —
  `meta.generator` / `meta.generatorVersion` is the whole of it, and Petrinaut
  itself captures none anywhere (§3.6). But the import path is _permissive_
  (§5.2), which is more forgiving than I first assumed: because every
  file-format member schema is a plain `z.object`, brunch can attach extra keys
  **both at the top level and on individual places/transitions**, and Petrinaut
  will strip them silently rather than reject the file. So a brunch-authored file
  can double as its own provenance record.

  The limits are real, though: stripped means **not round-trippable** — the moment
  a user edits and re-exports from Petrinaut, every brunch annotation is gone; the
  editor UI will never surface it; and nothing stops a future Petrinaut version
  from tightening the file schema to strict, which would turn a silently-ignored
  annotation into a hard import failure. Treat inline annotation as convenient, not
  as a contract, and keep the authoritative capture on brunch's side.

- **A generator has to supply things the schema will not check.** From §5.2 and
  §5.4: place names must be PascalCase or every code surface breaks (import does
  not validate this); arcs must carry exactly one of `placeId` / `endpoint` or the
  file passes validation and throws later at `getArcEndpoint`; and a net with no
  `scenario` has no initial marking, so it opens but simulates to nothing. These
  are brunch's problems to catch, and the good news is it can — `parseSDCPNFile` is
  pure and exported, so brunch can validate in CI, but it will need its own checks
  on top for the three items above.
- Petrinaut's _editing_ affordances are unavailable to the elicitor: once the
  file is handed over, brunch cannot revise the net in place, watch the user edit
  it, or read back what changed. It is a one-way handoff per file.
- Nothing in the format expresses "this is a draft" or "these fields are
  uncertain".
- The Actual-mode form is deliberately extension-free (no colours,
  stochasticity, dynamics, parameters), so it cannot carry an SDCPN — only a plain
  Petri net. The file form has no such restriction.

**Risk against 5 weeks: low.** Both mechanisms are shipped, `parseSDCPNFile` is
pure and exported so brunch can validate its own output in CI, and the reference
fixture server (§7.1) is a working contract test. The open work is generation
quality, not integration.

### 6d. Where the evidence is thin

- **Forward compatibility of a generated v1 file is genuinely unknown.** There is
  no file migration system (§5.2), and `parseSDCPNFile` rejects any `version`
  above `SDCPN_FILE_FORMAT_VERSION` outright. If Petrinaut bumps to v2 before
  September, brunch-generated v1 files keep working only if the legacy/v1 path is
  retained — which is likely but is a decision owned by the Petrinaut team, not a
  guarantee in the code.
- I read `placeSchema` in full and confirmed the strictness pattern, but I did not
  read every member schema in `schemas/entity-schemas.ts` /
  `action-schemas.ts` (561 lines) / `metric-schema.ts` / `scenario-schema.ts`.
  Per-field required/optional detail for Transition, Color, Parameter,
  DifferentialEquation, Scenario, Metric, Subnet, and ComponentInstance is
  uncharacterized. Anyone generating nets should read those files directly — the
  `.meta({ description })` strings on each field are the real spec.
- No load/perf evidence for large nets, and no evidence about whether the
  assistant's tool-call-per-element approach scales to a net of the size the demo
  needs — worth a spike, since a 40-place net is ~100 sequential mutation calls.
- The Brunch SSE protocol's owner is explicitly unsettled (see §7.1); I have no
  evidence about who on the Petrinaut side would commit to stabilizing it by
  September.

---

## 7. Incidental findings

### 7.1 A brunch↔Petrinaut integration already exists ("Actual mode")

This was not in the ticket's assumptions and materially changes the picture.

`../hash/libs/@hashintel/petrinaut-core/src/actual-mode/README.md`:

> Actual Mode lets Petrinaut render an execution that comes from an external
> source instead of from Quick Simulation or Monte Carlo. The first integration is
> the Brunch demo route in `apps/petrinaut-website`, which connects to a Brunch
> SSE endpoint and feeds Petrinaut a Petri net definition, an initial marking, and
> transition firing events.

Flow (README, "Current Brunch Flow"): `/brunch?sse=<url>` → `EventSource` →
website-local parsers validate → normalize to read-only SDCPN with extensions
disabled → `ActualModeContext` into `@hashintel/petrinaut` → core reconstructs
markings and timeline frames.

Implementation: `../hash/apps/petrinaut-website/src/main/app/brunch-demo/`
(10 files, ~850 lines) — `brunch-protocol.ts` (zod schemas),
`brunch-definition.ts` (normalizer, §5.3), `brunch-frame-parsers.ts`,
`brunch-actual-mode-provider.tsx` (the `EventSource` wiring),
`brunch-endpoint.ts`, `brunch-petrinaut.tsx`, `brunch-status-page.tsx`.

SSE event names (`brunch-actual-mode-provider.tsx:250-255`): `definition`,
`initial_state`, `transition_firing`, `terminal`, `error`. Transition payload
(`actual-mode/README.md:46-58`):

```json
{
  "transitionId": "start_implementation",
  "input": { "queued": 1 },
  "output": { "implementing": 1 },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

`input`/`output` are transition-local token count maps, not before/after markings.
Reconnect semantics are already solved: the stream replays from the beginning and
Petrinaut rebuilds the timeline, so an interruption neither duplicates nor drops
firings (`docs/actual-mode.md:17`).

**There is a reference producer in-repo**:
`../hash/apps/petrinaut-website/scripts/brunch-sse-fixture.ts` (941 lines,
`turbo run brunch:fixture --filter '@apps/petrinaut-website'`) — a Brunch-compatible SSE server that serves a net, an
initial marking, historical firings, then streams new ones, and can replay a
Petrinaut Actual-mode export. This is effectively a written-down contract test for
the brunch side.

**Ownership is explicitly unsettled**, and this is the caveat to weigh:

> This is not a stable Petrinaut protocol yet. The Brunch SSE event names,
> endpoint layout, raw export shape, and temporary Brunch definition schema are
> still owned by the demo website integration. They should not be treated as a
> public Petrinaut Core protocol until the Brunch and Petrinaut teams standardize
> that contract.

And in `brunch-protocol.ts:41-57`: "This is intentionally not Petrinaut's full
SDCPN document format […] The whole schema is temporary and should be replaced by
the standardized Brunch/Petrinaut protocol once that protocol is owned in
Petrinaut Core."

Note the split: Actual mode is about _executions_ (a running net), whereas the
September demo needs _elicitation of a model_ (a net definition). The existing
integration solves the downstream half. But its `definition` event already
carries a net, and `brunch-definition.ts` already normalizes an external
graph-only definition into a Petrinaut SDCPN — which is exactly the artifact
handoff §6c needs, minus the extensions.

### 7.2 Rendering and simulation capability (SDCPN in the UI)

- Canvas is `@xyflow/react`; layout via ELK (`elkjs`), exposed as
  `calculateGraphLayout` from core and as the `applyAutoLayout` AI tool.
- Simulation: worker-based, with `SimulationProvider` mirroring `status`/`frames`
  stores, a `PlaybackProvider` driving a `requestAnimationFrame` loop, three
  backpressure/ack policies (`viewOnly`, `computeBuffer`, `computeMax`), and an
  `ExecutionFrameSource` abstraction so canvas and timeline work identically for
  live playback and Actual-mode recordings
  (`../hash/libs/@hashintel/petrinaut/ARCHITECTURE.md`).
- Monte Carlo experiments with per-run metric frames, distribution histograms
  (bins × frames heatmap), and run aggregations (mean/median/min/max/p10-p90),
  rendered with uPlot.
- Optimization via Optuna over a scenario's flat parameters, streamed trials,
  cancellable (§4).
- Users author real code in-editor (transition lambdas, kernels, dynamics,
  metrics, place visualizers as JSX) with a Monaco-based TS LSP and a diagnostics
  panel. `.changeset/petrinaut-hir-compiler.md` records that all user code now
  compiles through a new HIR to programs reading packed frame buffers directly,
  replacing Babel — with an explicit compatibility break for code outside the
  supported TypeScript subset.
- Place visualizers are compiled in the UI package
  (`src/ui/lib/compile-visualizer.ts`, Babel + classic React runtime) — described
  in ARCHITECTURE.md as "the one authoring surface that is inherently React".

### 7.3 Other notes

- `../hash/libs/@hashintel/petrinaut/docs/` is not developer documentation — it is
  the end-user guide, **consumed at runtime by the AI assistant** via
  `readPetrinautDoc` (eleven pages, each with a summary in `ai.ts:104-127`). If
  brunch ever authors Petrinaut content, this doc set is the assistant's own
  reference and is worth reading as spec.
- `ARCHITECTURE.md` carries an explicit note that it deliberately does _not_ live
  in `docs/` for that reason.
- HASH removed Petrinaut branding from the AI panel in favour of HASH breadcrumbs
  (git log, H-6720, #9084) — the panel is already treated as a white-labelled
  host-configurable surface.
- `../hash/libs/@hashintel/petrinaut-old` exists alongside the current library;
  I did not investigate what remains of it.
- **Two latent bugs found in passing**, both consequences of the opaque-origin
  iframe, neither blocking but both worth knowing:
  1. Petrinaut persists its own visual/user settings to `localStorage` key
     `"petrinaut:user-settings"` _inside the library_
     (`petrinaut/src/react/state/user-settings-provider.tsx:19-45`, try/catch
     wrapped). In HASH's opaque-origin iframe that storage is unavailable, so user
     settings **silently fail to persist across reloads** in HASH while working
     fine on the demo site.
  2. Draft AI conversations are written but **never restored**, and are migrated
     onto the new entity UUID on first save
     (`process-editor.tsx:259-262`, `804-828`).
- Sentry cannot ship from inside the embed CSP, so the iframe's `reportError`
  bridge message exists purely so the host can re-capture errors
  (`process-editor.tsx:563-584`).
- HASH passes `createNewNet`/`loadPetriNet` as a `noNetSwitchingError` that
  **throws** (`embed-content.tsx:58-63`) — the host drives every net load over the
  bridge rather than letting the editor initiate one. Import/export
  implementations live in `petrinaut/src/ui/file-io/` (`import-sdcpn.ts` uses a
  hidden `<input type="file" accept=".json">` → core `parseSDCPNFile` → ELK when
  positions are missing).
- brunch-lite itself currently contains **no application code** — only `docs/`,
  `.scratch/`, `CONTEXT.md`, `AGENTS.md`. There is no package.json. Whatever the
  coupling decision, the brunch side of it is greenfield, which means no
  dependency conflicts to inherit but also no app shell, UI, or backend to build
  on within the 5-week window.
