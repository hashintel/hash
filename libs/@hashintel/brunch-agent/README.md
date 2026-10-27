# `@hashintel/brunch-agent`

Brunch's shared contracts, and its browser client. Each entry point serves one runtime; inside the package, code is grouped by feature.

| Entry                                      | Runtime                         | Holds                                                                                                                                                                                                                                                                                       | Consumers                                               |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `@hashintel/brunch-agent`                  | browser and server, no React    | The contracts (below), and the voice and interview-budget contracts that browser and server share (`src/shared/`)                                                                                                                                                                         | the Brunch agent app, the website, every entry below    |
| `@hashintel/brunch-agent/client`           | browser, no React value imports | The browser runtime (`src/client/`). The entry exports the Flue adapter, the panel transport and its conversation tracker, conversation IDs, the client tool-name sets, canonical speech selection, the OpenAI Realtime session and the Realtime bridge; the rest of `src/client/` (`requestFlueStop`, in-band browser calls, the Live bridge, the turn controller, mediation history) is not exported | `./ui`, the website                                     |
| `@hashintel/brunch-agent/ui`               | browser, React                  | Brunch's Petrinaut plugin and `BrunchAssistantContext`, `useBrunchAssistant`, the chat (`src/ui/chat/`, FE-1960's copy of Petrinaut's panel), the approval and draft cards, the Ledger tab and comments bar, words, the interview budget, the voice controls, and `temporary-editor-compat` (temporary, until Petrinaut's plugin API reports edit refusals) | the website                                             |
| `@hashintel/brunch-agent/server`           | server, web-standard            | Voice's handlers (`src/server/voice/`), each `(environment) => (Request) => Response`                                                                                                                                                                                                       | the website's `api/voice/*` routes                      |
| `@hashintel/brunch-agent/interview-budget` | browser and server              | The interview allowance alone                                                                                                                                                                                                                                                               | code type-checked under `nodenext`                      |
| `@hashintel/brunch-agent/words`            | browser and server              | The custom-word spelling bounds alone                                                                                                                                                                                                                                                       | code type-checked under `nodenext`                      |

`./ui` ships `panda.buildinfo.json` (`build:buildinfo`, `panda ship`), as `@hashintel/petrinaut` does: a host adds `@hashintel/brunch-agent/panda.buildinfo.json` to its Panda `include` so Brunch's `css()` utilities are generated in its own stylesheet. A host provides `BrunchAssistantContext`'s inputs: the owner key, the chat endpoint, and Petrinaut's `ErrorTrackerContext`. Voice's preview clips are served by the host at `/voice-previews/v1`.

## Import rules

`.oxlintrc.json` enforces these with `no-restricted-imports`, so `lint:eslint` fails on a crossing:

- `.` imports none of `./client`, `./ui` or `./server`, and no React or Petrinaut UI (`react`, `react-dom`, `@ai-sdk/react`, `@hashintel/ds-*`, and the other UI-only packages), so the server's built output carries none;
- `./client` imports the contracts root by package name, its own entry, and `src/shared/` by relative path, and no React or Petrinaut UI by value. Type-only imports (`import type`) from `./ui/chat` by relative path are the one allowed exception: the runtime names the chat's message, transport and composer types, which FE-1960's copy defines. It never imports `./ui` or `./server` by package name;
- `./ui` imports `./client` and `.`, not `./server`;
- `./server` imports the contracts root by package name and `src/shared/` by relative path, never `./client` or `./ui`, and nothing that touches the browser. Its relative imports keep their `.js` extensions, because the website type-checks its routes, and so this source, under `nodenext`.

Tests are exempt. `src/shared/` holds the voice and interview-budget code that browser and server share. The root entry exports only part of it (`interview-budget` and `voice-settings`); the rest is internal, so `./client` and `./server` reach it by relative path, and `./server` re-exports the voice diagnostics and mediation contracts from it. `./client` and `./ui` reach the other contracts by the package's own name, `@hashintel/brunch-agent`, which the build keeps external so every entry shares the root entry's output.

## The contracts

What the Brunch agent app (`apps/brunch-agent`) and the Petrinaut website (`apps/petrinaut-website`) must agree on: Brunch's named constants, conversation identity, the browser-tool envelope, the browser-call protocol and the tools the browser executes, message metadata, the Petrinaut tool contracts, net element identity, contextual user messages with their submission context, the interview allowance and custom-word spellings, and the Ledger with its projection. They never import the Flue runtime.

Code belongs in the contracts when the server and the browser must agree on it: a contract between them, a derivation from conversation history that both compute, or how an element's ID is recognised. It belongs here even when only one side calls it today. Code only one side runs, with nothing to agree on, belongs in that side's entry or app. Types derive from their owner here rather than being restated in either app.

The agents themselves, their guidance, Flue tools and evaluations live in [`apps/brunch-agent`](../../../apps/brunch-agent/README.md). The Petrinaut agent's architecture, including the Ledger and the browser boundary, is in [`apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md`](../../../apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md).

```sh
turbo run test:unit --filter @hashintel/brunch-agent
```
