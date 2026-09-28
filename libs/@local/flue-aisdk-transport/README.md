# Flue AI SDK transport

Connects an AI SDK chat UI (`useChat` and its `ChatTransport`) to a Flue agent conversation. It is product-neutral and unpublished.

## Entries

- `@local/flue-aisdk-transport` (browser-safe):
  - `createFlueChatTransport` admits one user turn per submission and projects its Flue stream into AI SDK UI chunks.
  - `snapshotToUiMessages` rebuilds `UIMessage`s from a stored conversation for reopening.
  - `createFlueUiStream` is the stream projector both paths share.
- `@local/flue-aisdk-transport/server`: the live tool-input side channel. Flue's conversation stream carries only settled tool inputs, so `createLiveToolObserver` watches runtime observations, `createLiveToolBroadcaster` fans them out per submission, and `liveToolResponse` serves them as SSE. The caller owns routing and must authorize the conversation first.

Hosts adapt their own conventions through options rather than forks: `deliveredMessage` frames the admitted user turn, `mapToolOutput` unwraps a host envelope from tool results, and `mapClientToolInput`, `clientToolNames` and `dynamicClientToolNames` shape how client-executed tools render.

## Development

```sh
yarn workspace @local/flue-aisdk-transport test:unit
```
