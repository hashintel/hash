# Flue AI SDK transport

Connects an AI SDK chat UI (`useChat` and its `ChatTransport`) to a Flue agent conversation. It is product-neutral and unpublished.

## Entries

- `@local/flue-aisdk-transport` (browser-safe):
  - `createFlueChatTransport` admits one user turn per submission and projects its Flue stream into AI SDK UI chunks.
  - `snapshotToUiMessages` rebuilds `UIMessage`s from a stored conversation for reopening.
  - `createFlueUiStream` is the stream projector both paths share.
- `@local/flue-aisdk-transport/server`: the live tool-input side channel. Flue's conversation stream carries only settled tool inputs, so `createLiveToolObserver` watches runtime observations, `createLiveToolBroadcaster` fans them out per submission, and `liveToolResponse` serves them as SSE. The caller owns routing and must authorize the conversation first.

Hosts adapt their own conventions through options rather than forks: `deliveredMessage` frames the admitted user turn, `mapToolOutput` unwraps a host envelope from tool results, and `mapClientToolInput`, `clientToolNames` and `dynamicClientToolNames` shape how client-executed tools render.

## AI SDK compatibility

The transport targets `ai@6.0.286` and `@flue/sdk`/`@flue/runtime` `2.0.3`. Upstream cases come from vercel/ai at that tag (commit `38f42fce`). When either dependency moves, rerun the suites below and re-derive any case whose upstream source changed.

- Every chunk sequence in the unit tests must pass the AI SDK wire schema and reduce through `readUIMessageStream` and `validateUIMessages` ([`src/shared/ai-sdk-oracle.ts`](src/shared/ai-sdk-oracle.ts)).
- [`src/ai-sdk-compatibility/`](src/ai-sdk-compatibility/) runs an in-process Flue runtime with a scripted model and this package's live channel:
  - `live-reopen-parity.test.ts` requires a reduced live response to equal the message its stored history reopens as.
  - `upstream-reducer-cases.test.ts` reproduces cases from `process-ui-message-stream.test.ts` as real Flue turns.
  - `chat.test.ts` drives the AI SDK's own `AbstractChat`.

Those suites label each case as a guarantee (behaviour the AI SDK types or documents), an observed behaviour the transport relies on, or a decision. The decisions and known gaps are:

| Behaviour                                                                                                                                                                       | Status        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Every Flue-executed tool is `providerExecuted`, including a client tool once its in-band result arrives, so the AI SDK never runs it through `onToolCall` or re-submits for it. | Decision      |
| A server tool's output arrives after the step that called it closes; the reducer finds the part in the earlier step.                                                            | Observed      |
| Reopened messages have no `step-start` parts, because Flue history does not keep step boundaries.                                                                               | Accepted gap  |
| A live reasoning part carries the stream's own optional `id`; a reopened one does not.                                                                                          | Accepted gap  |
| With the live channel, a tool part can appear before text the model wrote earlier in the same step, and the reducer cannot reorder it; history keeps the model's order.         | Open decision |
| A durable Flue abort ends the stream with an `abort` chunk, which the AI SDK does not report as `isAbort`.                                                                      | Observed      |
| Regenerating is refused and resuming finds no stream; reopened history is the recovery path.                                                                                    | Decision      |

## Development

```sh
yarn workspace @local/flue-aisdk-transport test:unit
```
