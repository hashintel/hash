# Substrate coupling: Flue 2.0.3 over Pi 0.83

Assessment dated 2026-09-16. This is reference material recording evidence and reasoning; it is not planning authority. The operative obligation, its current disposition, the freeze relative to Mission 7e and the re-entry triggers live in the [substrate-coupling strain](../../../MISSION.next.md#conditional-technical-strains) in `MISSION.next.md`. Re-inspect every version claim below before acting on it; upstream moves weekly and this snapshot is not a fresh verification.

## Question and provenance

Lu asked whether adopting Flue was a mistake, given the number of repository-root patches Brunch carries on `@flue/runtime@2.0.3` and its Pi dependencies, and whether the same product could have been built more simply by depending on the [Pi packages](https://github.com/earendil-works/pi/tree/main/packages) directly. This document records the evidence gathered that day and the assessment Lu accepted, narrowed the same day after oracle review. It was first written as a mission draft and rehomed here because substrate maintenance has no visible product advance of its own, which the [drafts README](../../mission-drafts/README.md) requires of a cut mission.

## Cold-start reads

- Root [`package.json`](../../../../../../package.json) `resolutions`: four `patch:` entries covering three patch files (`@flue/runtime@2.0.3`, `@earendil-works/pi-agent-core@^0.83.0`, and `@earendil-works/pi-ai` under both its exact `0.83.0` and caret `^0.83.0` request ranges). [`.yarnrc.yml`](../../../../../../.yarnrc.yml) `packageExtensions` adds `@standard-schema/spec` to `@flue/runtime@2.0.3`.
- The three patch files under [`.yarn/patches/`](../../../../../../.yarn/patches/): `@flue-runtime-npm-2.0.3-192c31f50c.patch`, `@earendil-works-pi-agent-core-npm-0.83.0-6cd8fe314f.patch`, `@earendil-works-pi-ai-npm-0.83.0-c607801251.patch`.
- [`flue-routing.md`](flue-routing.md#model-context-projection): the exit condition for the projection patch, the "every runtime upgrade must port or deliberately replace the patch and rerun that suite" rule, and the [regression owners](flue-routing.md#regression-owners-and-limits) that form the core of any substrate qualification. That list is bounded representation and recovery coverage, not a complete compatibility suite.
- [`flue-architecture-cheatsheet.md`](flue-architecture-cheatsheet.md) for how Brunch composes Flue agents, hooks, routers and transports.
- [`apps/brunch-agent/AGENTS.md`](../../../../../../apps/brunch-agent/AGENTS.md), which records the `pi-ai` patch rationale and the reason the caret resolution exists.
- Consumers of the local projection extension: [`agent.ts`](../../../../../../apps/brunch-agent/src/agents/chat-agent/agent.ts) and [`context-projection.ts`](../../../../../../apps/brunch-agent/src/agents/chat-agent/context-projection.ts).
- The native tool-input consumer that motivates the Standard Schema part: [`petrinaut-construction.ts`](../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts), which already derives provider-facing JSON Schema via `toJSONSchema()` from Petrinaut's Zod schemas.
- [`MISSION.md`](../../../MISSION.md) Status and Owner decisions for 2026-09-16, which show that event-idle recovery observations are already under way on the patched 2.0.3 runtime.
- Spine [standing architecture](../../../MISSION.next.md#standing-architecture) ("One model-facing agent owns the conversation. Bindings, transports and hosts adapt that agent without creating a second history or protocol.") and the existing live tool-call channel strain, which states that the fan-out limitation does not authorize an upstream Flue change. Nothing here contradicts that: the moves below are substrate maintenance, not fan-out work.

## Patch ledger

Every patch is a fact about a specific pinned version. The ledger records what each part does, why Brunch needed it, and what upstream has done since. "Upstream" was checked on 2026-09-16 against `withastro/flue` main and releases and against `earendil-works/pi` main and releases.

| Layer | Part | What it changes | Why Brunch needed it | Upstream status at 2026-09-16 | Classification |
| --- | --- | --- | --- | --- | --- |
| `@flue/runtime@2.0.3` (843-line patch) | (a) `useContextProjection` hook and `contextProjection` agent config | Adds a pre-model projection of the canonical context, integrated with rebuild, compaction planning and independently projected summary and split-prefix slices; about 40% of the patch | Model-context economy (Mission 7c remediation, Mission 7e net-read economy); Flue exposes no pre-model projection surface | Absent from Flue through 2.0.7. Pi's `Agent.transformContext` (present in installed `pi-agent-core@0.83.0`) is a native per-call seam, but Flue does not expose it and the compaction-slice integration is not one callback | Missing Flue extension surface |
| | (b) Native tool inputs (`isNativeToolInput`, `toolInputToJsonSchema`, `parseToolInputSchema`) plus `prepareArguments` on `defineTool` | Lets a tool declare an input that implements both Standard Schema and Standard JSON Schema with a top-level object export, parsed by the schema's own authoritative parser alongside Flue's Valibot path | `plugin-sdcpn` ships Zod 4 schemas from Petrinaut whose parse carries defaults and transforms; Flue accepts only Valibot and would otherwise coerce generically before the tool sees its input | Absent from Flue through 2.0.7. Pi remains TypeBox-only and has no `validateArguments`; `prepareArguments` was already in Pi 0.83.0 | Cross-layer schema/validation mismatch, unchanged by upgrading either layer |
| | (c) `usePersistentState` per-tool-call drain via `AsyncLocalStorage`, committed atomically with each tool outcome | State written during a tool run lands with that tool's outcome record rather than at response end | Workpiece and net state must not be lost when a response fails between tool calls | Absorbed by Flue 2.0.7 | Upstream fix awaiting adoption |
| | (d) No retry of the assistant tail when overflow is inferred from usage on a successful `stop` without tool calls | Avoids a redundant model call after a clean stop | Observed wasted call and latency on long conversations | Absorbed by Flue 2.0.7 | Upstream fix awaiting adoption |
| | (e) `RETRYABLE_INTERRUPTION_MARKER` exported from the package root | Lets the host mark the first acknowledged idle in an agent-operation scope so Flue's own recovery retries it | Authorised by Lu on 2026-09-16 for Mission 7e event-idle recovery | Still Cloudflare-subpath only in Flue 2.0.7 | Missing public export |
| | `abandonToolOnAbort` around tool prepare and run | Abort during tool preparation abandons the tool instead of hanging | Supporting change for (b) and for abort correctness | Flue 2.0.7 changed abort and truncated-batch recovery independently | Unresolved until compared against the new runtime |
| `@earendil-works/pi-agent-core@0.83.0` (77-line patch) | `AgentTool.validateArguments` plus a third `TArguments` type parameter | Lets a tool's authoritative parser replace Pi's generic JSON Schema validation and coercion for that tool only; `beforeToolCall`, `afterToolCall` and `execute` receive the parsed data | Exists solely to support Flue part (b) | Not upstream in Pi 0.85.1 | Same mismatch as (b); not an obsolete backport |
| `@earendil-works/pi-ai@0.83.0` (54-line patch) | Anthropic adapter carries the full `input_schema` instead of collapsing to `{type, properties, required}`; `anyOf` accepts an already-valid arm before coercion | Pi's adapter dropped schema constraints the construction tools rely on; `baseRevisionId: null` was coerced to `""` | Both fixed in Pi 0.85.1 (the `anyOf` fix is upstream commit [2e95584](https://github.com/earendil-works/pi/commit/2e95584dab802ae2f7c8d1a4994d6e0e9f67ec09), cited as external provenance) | Upstream fixes blocked by Flue's supported range and by Brunch's own exact pin and resolutions |

What the ledger supports is a mixed cause, not a single one. Two Flue parts and both `pi-ai` fixes are ordinary upstream lag, reachable by upgrading. Parts (a) and (b) with the `pi-agent-core` companion are requirements that cross surfaces Flue controls but does not expose; upgrading does not remove them. Part (e) is a missing export, not lag. Upgrading therefore reduces the maintenance burden without resolving the mismatch. This document does not claim that the remaining adaptations are permanently outside Flue's design centre, only that they remain ported at every upgrade until an upstream seam exists.

## Why the Pi range matters

Flue main and every 2.0.x release declare `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` at `^0.83.0`. On a 0.x major, caret means `>=0.83.0 <0.84.0`, so Flue cannot receive Pi 0.85.1 without a Flue release that widens the range. Brunch's own exact `pi-ai@0.83.0` pin and its two `pi-ai` resolutions hold the same line from the app side. The `pi-ai` fixes Brunch needs are published upstream and unreachable through either path.

That range is a compatibility boundary across potentially breaking 0.x minors, not bad hygiene on Flue's part. The goal is an owned, tested Flue-plus-Pi combination, not removal of the boundary. The app also depends on `@earendil-works/pi-tui@0.84.3` directly, so a Pi bump has several entry points to keep coherent.

## What Flue supplies that Pi does not

Pi 0.85.1 ships `pi-agent-core` (agent loop, harness, JSONL and in-memory session repositories, compaction, skills, `transformContext`), `pi-ai` (provider adapters), `pi-tui`, `pi-coding-agent`, and new since 0.83: `pi-session-backend-sqlite-node`, experimental `pi-server`/`pi-client`/`pi-protocol` over a Unix-socket CBOR transport, `chord`, and `pi-telemetry`. There is no HTTP transport, no browser SSE protocol, no browser client, no React binding, and no Postgres backend (explicitly listed as future).

Flue supplies exactly that missing layer: the HTTP agent router, the SSE stream protocol, `@flue/sdk` (`createFlueClient().history()`), `@flue/react` (`useFlueAgent`), `@flue/postgres`, `@flue/opentelemetry` and `@flue/vite`. Sixty-nine source files across `apps/brunch-agent/src`, `libs/@hashintel/brunch-agent/packages/*/src` and `apps/petrinaut-website/src` import `@flue/*`, and core and every plugin expose their production resources through a `./flue` subpath (an enforced topology gate). Brunch's canonical conversation log, its public history read by the website, the transport package's stream merge and the persistence split all sit on Flue-owned contracts.

## The Pi-direct counterfactual

Had Brunch depended on Pi directly in mid-2026, it would have had `Agent`, `AgentHarness`, `transformContext` and session repositories for free, and the per-call half of part (a) would have been an ordinary `transformContext` call; the compaction-slice integration would still have been Brunch's to build. The obligations behind the other parts transfer; the identical patches do not necessarily transfer:

- (b) and the `pi-agent-core` patch: Pi is TypeBox-only, so the Zod-from-Petrinaut mismatch would have required a Pi-side adapter or patch of the same shape.
- The `pi-ai` patch: identical, since it patches Pi.
- (c), (d), (e): these are properties of Flue's HTTP submission and persistence loop. A Brunch-owned loop would have had to own the same atomicity, overflow handling and interruption recovery; it would have had its own defects rather than Flue's, and the ledger cannot say whether there would have been more or fewer.

Brunch would additionally have had to write and own the HTTP transport, the stream protocol, a browser client with history reads, the React binding and a Postgres store, then keep them coherent with the canonical-history contract that `flue-routing.md` now inherits from Flue. That is a rewrite of the layer Flue exists to provide, on a team whose mission is elicitation, not agent infrastructure. A deliberate migration could preserve a single authoritative history, so the rejection rests on cost and the absence of a consumer that needs something Flue cannot provide, not on the single-history invariant alone.

## Assessment

As accepted by Lu and narrowed after review: Flue remains the better-supported choice for Brunch's current product boundary, and there is no demonstrated reason to rewrite on Pi. The maintenance burden combines upstream fixes awaiting adoption with missing extension surfaces for projection and native tool validation. The Flue-to-Pi version coupling specifically prevents retiring the `pi-ai` fixes; upgrading alone will not eliminate the remaining adaptations. What was unmanaged is that the coupling never had an owner, an upgrade cadence, or a disposition rule beyond the projection patch's exit condition. The spine now carries that obligation.

## Recommended moves

Three bounded moves. Move 1 then Move 2 is the default landing order, not a dependency graph: upstream requests for Moves 2 and 3 are independent of Move 1 and should be opened early, since their response time sets the schedule. Each move has a discriminator that says whether it worked and names the oracles it must consume. Scheduling, the 7e freeze and the standing disposition rule are the spine's; this section records what each move would have to prove.

### Move 1 — Upgrade to Flue 2.0.7 and retire the absorbed parts

- **Do:** bump `@flue/runtime` and `@flue/sdk` (and any other `@flue/*` present) to 2.0.7 in every consuming workspace, including the website and transport packages; regenerate the runtime patch against 2.0.7 keeping (a), (b), (e) and whatever of `abandonToolOnAbort` 2.0.7 has not made redundant; delete (c) and (d); re-add the `packageExtensions` entry for the new version.
- **Discriminator:** the obsolete semantic changes are deleted and the earned contracts survive. Regenerated line count is diagnostic only; generated export and declaration lines distort it.
- **Oracles:** the full [regression owners](flue-routing.md#regression-owners-and-limits) list run from the HASH root after building `@apps/brunch-agent`; the native-validation owner [`native-schema-carriage.test.ts`](../../../../../../apps/brunch-agent/test/integration/native-schema-carriage.test.ts); the 7e recovery owners for event-idle and retryable interruption once 7e names them; and `lint:tsc` across every `@flue/*` consumer. Oracle gap: the routing doc's `test:reopened-why-retention` is not a script in the current app manifest; locate its current owner or replace the reference before claiming that leaf.
- **Interaction with Mission 7e:** 2.0.7 changed abort and truncated-batch recovery, terminating-tool compaction and compaction telemetry, the same surface 7e's event-idle recovery is observing on the patched 2.0.3 runtime. Move 1 is not an evidenced 7e prerequisite: the absorbed corrections already exist locally as patch parts.

### Move 2 — Break the Pi range

- **Preferred:** open an upstream request on `withastro/flue` to widen `pi-agent-core`/`pi-ai` to `^0.85`. If accepted, the `pi-ai` patch disappears on the next Flue release, and Brunch's direct `pi-ai` pin and both resolutions move in step.
- **Fallback:** a fixed-budget spike forcing `@earendil-works/pi-ai@0.85.1` and `pi-agent-core@0.85.1` under Flue 2.0.7 by root resolution. 0.83 to 0.85 crosses two 0.x minors that Pi treats as potentially breaking, and Flue's adapter code may call APIs that moved. Treat it as a spike, not an upgrade.
- **Discriminator:** the `pi-ai` patch file is deleted and the Anthropic `input_schema` carriage and `anyOf`/`baseRevisionId: null` cases still pass.
- **Oracles:** [`native-schema-carriage.test.ts`](../../../../../../apps/brunch-agent/test/integration/native-schema-carriage.test.ts) checks the actual serialised `input_schema` through both SDK entrypoints, including equality with the canonical mutation schema; `schema-carrier.test.ts` does not qualify this claim because its probe returns through a faux provider before any Anthropic serialisation. Because forcing Pi replaces `pi-agent-core` too, the spike must also consume the native-validation, recovery and applicable retention and compaction owners from Move 1, not only schema carriage plus settlement.
- **Residual:** the `pi-agent-core` `validateArguments` patch is regenerated against 0.85.1 and stays as long as part (b) does.

### Move 3 — Upstream a pre-model projection seam to Flue

- **Do:** propose a Flue surface (Flue's naming) carrying the contract the routing doc states: projection is model-facing only, canonical storage and public history keep originals, compaction plans from projected context and independently projects summary and split-prefix slices, rebuilt suffixes rematerialise exact bodies. Supply a minimal reference implementation derived from part (a).
- **Discriminator:** a Flue release exposes a seam that Brunch's `context-projection.ts` can adopt without changing its observable behaviour. This is the exit condition the routing doc already names for the projection part.
- **Oracles:** the projection regression owners (`context-projection.test.ts`, `net-freshness.test.ts`, `chat-agent-compaction.test.ts`, `history-retention.test.ts`, `test:workpiece-evidence`, `measure:context-replay`, and the oracle gap above) pass with the projection hunks removed and the residual patch for (b) and (e) still applied. The routing doc's older wording of removing the whole patch and resolution has been overtaken by the enlarged patch; update it when this move lands.
- **Residual:** part (b) has no upstream home. Flue is Valibot-committed and Pi is TypeBox-committed; neither has signalled Standard Schema adoption. A JSON Schema export from Petrinaut is not the missing capability, since the adapter already derives one; what (b) preserves is authoritative parsing with defaults and transforms and without destructive generic coercion first. Expect to carry (b) and its `pi-agent-core` companion until Flue or Pi accepts an authoritative-parser seam, or until Petrinaut's tool inputs no longer need parse-time defaults and transforms.

## Risks and assumptions

| Assumption | If false | Cheapest discriminating check |
| --- | --- | --- |
| Flue 2.0.7's absorbed versions of (c) and (d) match Brunch's semantics closely enough that the existing tests still pass | Brunch keeps a smaller local variant, or adapts tests to the upstream semantics after owner review | Run the regression owners against 2.0.7 with (c) and (d) removed before touching anything else |
| 2.0.7's abort and truncated-batch recovery changes do not invalidate 7e's event-idle recovery evidence | 7e's evidence must be regathered on the new runtime | Diff the 2.0.3 and 2.0.7 submission loop around retryable interruption; land Move 1 after 7e closes |
| Flue will accept a Pi range bump | Brunch carries the `pi-ai` patch until Flue moves, or runs the forced-resolution spike | File the upstream request early; its response time is the schedule |
| Pi 0.83 to 0.85 is API-compatible for the surface Flue calls | Forced resolution fails at typecheck or runtime and the spike is abandoned | `lint:tsc` on the forced resolution plus `native-schema-carriage.test.ts` |
| Flue would take a projection seam upstream | Part (a) is carried indefinitely under the existing routing-doc rule | Open the proposal with the contract text from the routing doc and a minimal reference implementation |
| Petrinaut's tool inputs keep needing parse-time defaults and transforms | (b) could shrink to plain JSON Schema validation if the schemas became declaration-only at the tool boundary | Ask Petrinaut owners which mutation and read inputs rely on Zod defaults or transforms |

## Rejected alternatives

- **Rewrite on Pi now.** Rejected on cost and the absence of a consumer Flue cannot serve: obligations transfer rather than disappear, and Brunch would own HTTP transport, stream protocol, browser client and Postgres store. Reopen only for a named consumer needing a transport or session backend Flue structurally cannot supply, with a migration plan that preserves one authoritative history.
- **Force Pi 0.85.1 under Flue 2.0.3 without qualification.** Rejected: two 0.x minors of drift under an adapter layer that was not written against them; the qualification owners exist precisely to catch this, and skipping them converts a controlled upgrade into a latent production fault.
- **Leave the patches as they are indefinitely.** Rejected as a steady state: the routing doc's upgrade rule was unowned in practice, Flue is releasing weekly, and each release widens the gap between the patch base and upstream. Acceptable as an explicit, dispositioned posture during a live observation window.
- **Upgrade automatically whenever a release absorbs something.** Rejected: it creates a release-driven treadmill and removes the ability to defer around live observations. Review-and-disposition is the obligation.
- **Open a side quest now.** Rejected: the context root's side-quest rule requires concrete live-mission residual failures and owner authorization; this cluster is maintenance, not a 7e residual.
- **Make it a mission draft.** Rejected after oracle review: the drafts README requires a visible product advance passing the product-manager litmus, and substrate maintenance has none; inventing one would weaken the rule. The spine strain is the planning home; a runtime-touching mission admits the relevant obligation at its own cut.
- **Fork Flue.** Not considered seriously: it converts a dependency into a maintained codebase without removing the Pi coupling, and none of the carried parts justify owning the whole runtime.
