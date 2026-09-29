# Flue AI SDK transport

Connects an AI SDK chat UI (`useChat` and its `ChatTransport`) to a Flue agent conversation. It is product-neutral and unpublished.

## Entries

- `@local/flue-aisdk-transport` (browser-safe): `createFlueAiSdkAdapter` binds one host's projection of Flue conversations into the AI SDK. Its `chatTransport` admits one user turn per submission and streams it as AI SDK UI chunks; its `reopen` rebuilds the same messages from stored Flue history. `createFlueUiStream` is the live projector underneath.
- `@local/flue-aisdk-transport/server`: the live tool-input side channel. Flue's conversation stream carries only settled tool inputs, so `createLiveToolObserver` watches runtime observations, `createLiveToolBroadcaster` fans them out per submission, and `liveToolResponse` serves them as SSE. The client reads `<conversation URL>/<liveToolRouteSegment>?submissionId=<id>`; the host serves `liveToolResponse` at that route, behind the conversation's own authorization.

## Host contract

One adapter per host configuration, shared by the live transport and by reopened history so the two cannot drift:

- `clientToolNames`, `dynamicClientToolNames` and `mapClientToolInput` shape how client-executed tools render, and `mapToolOutput` unwraps a host envelope from tool results.
- `projectMetadata` derives message metadata from the agent's response metadata and the submission's outcome. Without it, agent metadata passes through.
- `metadataSchema` is the Standard Schema member of the AI SDK's `FlexibleSchema`, so the same schema can be given to `useChat`. It is required when the adapter's message type narrows its metadata, and it must validate synchronously. Projected metadata that fails it ends a live turn with an error and makes `reopen` throw. Messages carry the schema's output, so a schema that strips unknown keys drops them.

Per transport, `submittedUserMessage` frames the admitted user turn, and `initialData`, `liveToolStream` and the admission and response callbacks connect the host.

## AI SDK compatibility

The transport targets `ai@6.0.286` and `@flue/sdk`/`@flue/runtime` `2.0.3`. Upstream cases come from vercel/ai at that tag (commit `38f42fce`). When either dependency moves, rerun the suites below and re-derive any case whose upstream source changed.

- Every chunk sequence the unit tests and `AbstractChat` consume must pass the AI SDK wire schema and reduce through `readUIMessageStream` and `validateUIMessages` ([`test/ai-sdk-oracle.ts`](test/ai-sdk-oracle.ts)).
- [`test/`](test/) runs an in-process Flue runtime with a scripted model and this package's live channel:
  - `upstream-reducer-cases.test.ts` reproduces cases from `process-ui-message-stream.test.ts` as real Flue turns.
  - `chat.test.ts` drives the AI SDK's own `AbstractChat`, mapped to cases in `chat.test.ts`.
  - `live-reopen-parity.test.ts` covers the shapes no upstream case produces. Every real Flue turn in both suites requires the reduced live response to equal the message its stored history reopens as.
  - `metadata-contract.test.ts` holds the metadata half of the host contract.

The upstream and `AbstractChat` suites label each case as a guarantee (behaviour the AI SDK types or documents), an observed behaviour the transport relies on, or a decision. The parity and metadata suites assert this package's own contract, and label only the cases that pin a decision below. The decisions and known gaps are:

| Behaviour                                                                                                                                                                        | Status        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Every Flue-executed tool is `providerExecuted`, including a client tool once its in-band result arrives, so the AI SDK skips `onToolCall` and its continuation predicate for it. | Decision      |
| A server tool's output arrives after the step that called it closes; the reducer finds the part in the earlier step.                                                             | Observed      |
| Reopened messages have no `step-start` parts, because Flue history does not keep step boundaries.                                                                                | Accepted gap  |
| A live reasoning part carries the stream's own optional `id`; a reopened one does not.                                                                                           | Accepted gap  |
| With the live channel, a tool part can appear before text the model wrote earlier in the same step, and the reducer cannot reorder it; history keeps the model's order.          | Open decision |
| A durable Flue abort ends the stream with an `abort` chunk, preceded by the projected metadata for the aborted outcome; the AI SDK does not report it as `isAbort`.              | Decision      |
| Flue's SDK retries a dropped update stream, so the transport never reports a disconnect.                                                                                         | Observed      |
| The assistant message takes the id of Flue's response message, so live and reopened messages share it.                                                                           | Decision      |
| A failed submission ends the stream with one `error` chunk carrying Flue's error text.                                                                                           | Decision      |
| Stopping the chat ends only the local observer; the Flue turn runs on, and a durable stop is Flue's `abort`.                                                                     | Decision      |
| Regenerating is refused and resuming finds no stream; reopened history is the recovery path.                                                                                     | Decision      |
| An idempotency conflict is read from the body of Flue's 409 response, which no Flue type describes.                                                                              | Observed      |

## Development

```sh
yarn workspace @local/flue-aisdk-transport test:unit
```
