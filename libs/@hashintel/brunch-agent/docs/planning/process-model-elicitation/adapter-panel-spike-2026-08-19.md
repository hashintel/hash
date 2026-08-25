# FE-1435: AI SDK stream adapter against Petrinaut's real panel

Date: 2026-08-19

Source checkout: `hashintel/hash` `main` at `1046b5c881cd00cf205b4895348b022934d66b4a`

Panel packages: `ai@6.0.182`, `@ai-sdk/react@3.0.184`, `@hashintel/petrinaut@0.0.16`

## Question

Can harness-level reply parts, translated into the AI SDK v6 UI-message-stream protocol, drive
Petrinaut's real chat panel without replacing its host-supplied transport wrappers or editor
tool execution?

An answer required one real-panel run to show all of the following: streamed reasoning and text;
a server-executed tool rendered by the panel; multiple client tools executed against the live
editor and returned together; and the diagnostics decorator changing the follow-up request.

## Approach

The probe ran the unmodified `apps/petrinaut-website` local-storage application from the clean
`hashintel/hash` checkout. After the application loaded, a temporary browser-level `fetch` shim
intercepted only `/api/chat`. This preserved the site's real `DefaultChatTransport`, the panel's
diagnostics and reasoning-timing decorators, `useChat`, tool dispatcher, renderers, and live
`Petrinaut` instance. No model, Flue suspension, or modified hash source was involved.

The fake loop returned delayed SSE chunks for one user turn with an automatic tool-result
follow-up:

1. reasoning and text parts;
2. a provider-executed `serverProbe` tool with a result that had no custom `title`;
3. client-executed `addPlace` and `addTransition` calls in the same step;
4. a final follow-up text response after the panel posted both tool outputs.

The first shim attempt encoded the frame separators as literal backslash characters. It produced
no parsed assistant parts and was discarded. The successful run used real blank-line SSE frame
delimiters. Its two complete parsed POST bodies and complete server-sent event chunks are frozen under
`test/fixtures/transport-aisdk/`; `test/transport-aisdk-golden.test.ts` asserts the load-bearing
facts rather than relying on this narrative alone.

## Observed behavior

| Acceptance criterion                                               | Observation                                                                                                                                                                                                                                     | Evidence                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Streamed text and reasoning render                                 | Mid-stream, the real panel showed `Reasoning (checking the wire seam)` with its timer and `Harness-streamed text reached Petrinaut before tool execution.`                                                                                      | Recorded runtime observation; `panel-initial.sse` preserves the chunks supplied to the real panel                                   |
| Client tools execute against the live editor and post outputs back | `SpikeBuffer` and `Spike dispatch` appeared both in the editor's node list and on the canvas. The second POST contained both `tool-addPlace` and `tool-addTransition` with `state: output-available` and `applied: true`.                       | Recorded runtime observation plus `panel-tool-results.post.json`                                                                    |
| Server tools use default summaries                                 | Expanding the panel's `3 changes` group showed `serverProbe`, `Added place SpikeBuffer`, and `Added transition Spike dispatch`. `serverProbe` had no title-bearing output, so its visible label came from the panel fallback.                   | Recorded runtime observation plus `panel-initial.sse`; pinned panel source supplies the name fallback                               |
| Diagnostics decorator fires                                        | Only the automatic second POST contained the request-only user message `petrinaut-diagnostics-context`, beginning `Petrinaut diagnostics context only; this is not a user request.` It carried the diagnostics read after the editor mutations. | `panel-tool-results.post.json`                                                                                                      |
| Full POST bodies and SSE chunks freeze                             | The complete parsed successful request bodies, dynamic chat/message IDs, reasoning timing metadata, batched outputs, complete SSE chunks, and `[DONE]` terminators are committed as four fixtures.                                              | `test/fixtures/transport-aisdk/`; the golden test validates load-bearing semantics while version control freezes the complete files |
| Written verdict; zero hash commits                                 | The verdict below is scoped to the pinned versions. The hash checkout started and ended at `1046b5c881cd00cf205b4895348b022934d66b4a`; final `git status --short --branch` was `## main...origin/main`.                                         | Before/after HEAD and final tracked-status checks; generated build and browser caches listed below were removed                     |

The transition input deliberately reused the repository's Storybook probe shape. The mutation
succeeded, then Petrinaut's live language service reported three `TS2451` diagnostics for its
code strings. That does not weaken the transport result: the errors appeared in the diagnostics
decorator's follow-up context, demonstrating that the wrapper waited for and read the mutated
editor state. It does mean these fixtures prove transport compatibility, not semantic validity of
that illustrative transition. Rendering the three duplicate diagnostics also emitted one React
duplicate-key warning; the panel remained interactive and completed the follow-up.

## Commands

Read and prepare:

```sh
linear issue view FE-1435 --json --no-download --no-pager
linear issue comment list FE-1435 --json
linear issue relation list FE-1435
```

The requested `gt create ln/fe-1435-aisdk-panel-spike --onto
ln/fe-1433-petrinaut-integration-spec --no-interactive` first rejected the detached isolated
worktree without changing it. The same Graphite command created the child from the clean parent
checkout; Graphite then returned that checkout to the parent and checked out the tracked child in
this isolated worktree. No raw Git branch or rebase command was used.

Run the real panel:

```sh
turbo run build --filter=@apps/petrinaut-website...
yarn workspace @apps/petrinaut-website dev --host 127.0.0.1 --port 4915
chrome-devtools-axi open http://127.0.0.1:4915/
chrome-devtools-axi snapshot
chrome-devtools-axi eval <temporary-fetch-shim>
chrome-devtools-axi click <snapshot-ref-for-Show-AI-assistant>
chrome-devtools-axi fill <snapshot-ref-for-Message-AI-assistant> 'Run the FE-1435 transport probe.'
chrome-devtools-axi click <snapshot-ref-for-Send-message>
chrome-devtools-axi snapshot
chrome-devtools-axi stop
```

The angle-bracketed arguments above describe ephemeral interaction values, not literal replayable
commands: `chrome-devtools-axi` refs are snapshot-scoped, and the fetch shim was deliberately
throwaway. The fixtures are the durable output of that shim. They contain every request field and
every response frame required to rebuild a replay harness without preserving prototype code.

After the bounded server and browser stopped, the probe removed the ignored outputs it had touched:
the website Vite cache and `dist`; Petrinaut, Petrinaut core, DS components, refractive, local ESLint,
and optimizer-client `dist` directories; optimizer Turbo caches; and the optimizer `.venv`. It then
repeated the hash HEAD and status checks recorded above.

## Verdict

**Feasible.** A server that translates harness-level parts into AI SDK v6 UI-message-stream
chunks can drive Petrinaut's current real panel through its stock host transport seam. All five
wire/runtime obligations passed in one two-request loop, and the transcript, verdict, and clean
external-checkout constraints are discharged here. The run and pinned AI SDK source support the
inference that the provider-executed part bypassed the browser dispatcher while rendering through
the default summary. Two browser-executed calls completed before one batched automatic follow-up,
and the diagnostics decorator amended that request.

This retires the panel-compatibility uncertainty. It does not implement `transport-aisdk`, prove
Flue suspension, or settle production concerns such as CORS, identity, retry semantics, or server
deployment.

## Confidence shift

Confidence moves from **source-supported but unproved** to **high for the pinned panel and AI SDK
versions**. The evidence crossed the actual React panel, wrapped transport, HTTP stream parser,
live editor, language-service refresh, and automatic `useChat` follow-up. Confidence is not
version-independent: upgrades to `ai`, `@ai-sdk/react`, or Petrinaut's wrapper order must replay
these fixtures and re-run a real-panel smoke probe.

## Recommendation

Proceed to FE-1436 using this transcript as the primary wire-seam contract. Build the production
package separately: encode only harness-level parts, replay these POST/SSE fixtures in contract
tests, and retain a small real-panel smoke check for dependency upgrades. Keep provider-executed
server tools and browser-executed Petrinaut tools distinct in the translator; the run shows the
panel already supplies the desired behavior when those protocol flags are correct.

> **Reflection:** The hardest boundary was not rendering text; it was preserving the panel's own
> wrappers and letting its automatic second dispatch reveal their composition. The synthetic
> diagnostics message is a stronger oracle than a spy would have been because it proves the
> decorator changed the same request that carried both live-editor outputs.
