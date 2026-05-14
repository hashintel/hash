# Petrinaut AI assistance MVP

# Goals

1. Implement a simple chat where users can ask an LLM to generate or revise a Petri net.
2. Use the [Figma sidebar chat design](https://www.figma.com/design/EuokCTrNYWhEMBQ7MmGrwJ/Petrinaut?node-id=194-63830&m=dev)
3. Out of scope for MVP:
    1. Chat tabs
    2. Actions
    3. Suggestion review (LLM will just edit the net directly, but we can have a summary of what was changed)

# Technical components / plan

Split by which part of Petrinaut they affect.

## Decisions captured before implementation

1. The first implementation stage is the `core` stage.
2. Core mutation methods now use object-style inputs everywhere, inferred from Zod action schemas. Do not reintroduce callback-style update functions in the public mutation context.
3. All existing mutation helpers should move into `core` and be available as AI tools, including destructive actions such as remove/delete helpers. For the MVP, tool calls execute directly without suggestion review or confirmation.
4. The prompt generator should inline `probabilisticSatellitesSDCPN` from `src/examples/satellites-launcher.ts`, provided it continues to demonstrate the relevant SDCPN features compactly: stochastic transitions, predicate transitions, transition kernels with distributions, coloured tokens, dynamics, differential equations, parameters, visualizer code, and scenarios.
5. The UI and website stages should consume the exported core AI tool metadata and callback map, rather than redefining tool names or schemas outside `core`.

# `core (libs/@hashintel/petrinaut)`

This is where the non-UI logic lives.

I’ve put the non-UI AI stuff here for now. It could go in an `core/ai` folder. Alternatively we can create another area for it.

### Core stage status

The core stage has been implemented. Future stages should build on these exported APIs rather than redefining tool names, schemas, prompts, or callbacks outside `core`.

1. Core action input schemas live in `core/action-schemas.ts` and are exported for AI use as `petrinautAiToolInputSchemas`.
2. Runtime mutation validation is performed by the core actions using `mutationActionInputSchemas`.
3. AI tool metadata is exported as `petrinautAiTools`. These tools deliberately do not include `execute`, because tool calls are applied client-side to the live Petrinaut instance.
4. Client-side tool execution should use `createPetrinautAiToolCallbacks(instance)`.
5. The prompt generator is exported as `createPetrinautAiPrompt()`.
6. Useful exported types include `PetrinautAiToolName`, `PetrinautAiToolInput`, `PetrinautAiToolCallbacks`, and `PetrinautAiTools`.
7. Update payloads are intentionally lean:
    1. Entity IDs are passed separately from `update`.
    2. Place/transition positions should use `updatePlacePosition`, `updateTransitionPosition`, or `commitNodePositions`.
    3. Arc edits should use `addArc`, `removeArc`, `updateArcWeight`, `updateArcType`, or `updateArcPlace`.
    4. Type element edits should use `addTypeElement`, `updateTypeElement`, `removeTypeElement`, or `moveTypeElement`.
    5. Broad array replacement through `updateTransition({ update: { inputArcs/outputArcs } })` or `updateType({ update: { elements } })` is intentionally not supported.

### Requirements

1. Granular actions to modify a Petri net (e.g. `addPlace`, `addTransition`) which are typed using a zod schema with lots of explanation of each, so that LLM tool calls can be generated from the schemas and we don’t have to separately maintain a list of LLM tools. As a byproduct it also improves the `core`.
2. The schemas should match the object-style core action inputs, not higher-level intent inputs. For update helpers, define serializable tool inputs that can be applied by core callbacks without exposing arbitrary functions to the LLM.
3. A set of LLM tools which incorporate the above. These will be exported for use by the server making the tool call and the frontend processing the response.
4. An LLM prompt generator for use in a Petri net-building AI assistant. This should inline `probabilisticSatellitesSDCPN` from the `examples` folder, which compactly demonstrates probabilistic transitions, dynamics, colours, stochastic firing, transition kernels, parameters, visualizer code, and scenarios.

### Work

1. Move `addPlace` etc from the `react` area of Petrinaut to the `core`, as methods on the `Petrinaut` instance, using object-style action inputs.
2. Create well-described Zod schemas for each serializable action input, using inferred types where this does not make the existing API worse. Include full documentation of features on appropriate actions (e.g. creating a differential equation explaining dynamics; creating/amending a transition explaining probability distributions in transition kernels, etc).
3. Add a function which generates the LLM tool bundle from the schemas (using [Vercel’s AI SDK structure](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-calling) as a target) in `core/ai`
    1. This will have two consumers (see [Chat bot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#client-side-page) in the Vercel AI UI SDK)
        1. The React side will use this as a reference for how to handle tool calls (via `onToolCall`), including getting type inference (see `ui` section below)
        2. The server brokering the LLM calls – currently only `petrinaut-website` – will use this when calling the LLM, alongside the prompt.
    2. Note that because this is a client-side action, these shouldn’t include an `execute` property. But it should make a typed map of tool name to callback available.
    3. We should use a conditional mapped type (or similar) to ensure that the return of the LLM tool bundle generator and callback map remain in sync.
4. Add the LLM prompt generator, for consumption by the server making the call (in the first instance, `petrinaut-website`).
5. Add Zod validation to all granular actions that are now in `core`. This improves the `core` because it provides runtime errors if an input is inconsistent with expectations, including cases where input type safety is weakened by type casting or incoming AI/tool payloads.
    1. Ensure meaningful/nice error messages as feedback
    2. Add tests to check for validation failures when adding an incorrect input

# **`ui (libs/@hashintel/petrinaut)`**

### Requirements / Work

Use the Figma MCP to get reference design details (then translate into PandaCSS / ArkUI / ds-component equivalents)

1. The button to summon the AI is added to the toolbar – [see component reference in Figma](https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=44988-5621&m=dev)
    1. Note that the button has a blue icon on hover, and when the AI chat is opened should have a gray background. [See reference design within this screen](https://www.figma.com/design/EuokCTrNYWhEMBQ7MmGrwJ/Petrinaut?node-id=194-63830&m=dev).
2. It will open a chat window that appears adjacent to the right-hand side node panel (if open), otherwise flush to the right. [Reference design for the chat window itself here](https://www.figma.com/design/EuokCTrNYWhEMBQ7MmGrwJ/Petrinaut?node-id=194-63837&m=dev)
3. Agent output should be streamed and formatted as Markdown.
4. Reasoning stream parts should also be streamed and then collapsed when complete. [See reference design for chat parts here.](https://www.figma.com/design/EuokCTrNYWhEMBQ7MmGrwJ/Petrinaut?node-id=430-47402&m=dev) This displays both the collapsed view (”Reasoning”) and expanded (”Understanding prompt requirements”).
5. All UI should use existing conventions within Petrinaut (e.g. related to usage of PandaCSS and ArkUI, and `ds-components` where possible).
6. The UI app uses React compiler and should avoid `useMemo`. `useEffect` should be used sparingly, if at all.
7. The chat window should use the current editor `Petrinaut` instance/handle so tool calls mutate the live document. It may create a callback map with `createPetrinautAiToolCallbacks(instance)`, but must not create an isolated JSON document unless building an explicit preview/review mode.
8. Completed tool calls should be shown as ‘Added Node X’ style things, [see reference design here](https://www.figma.com/design/EuokCTrNYWhEMBQ7MmGrwJ/Petrinaut?node-id=556-247310&m=dev). If an agent does multiple things, these should be expandable lists. Clicking on an individual item (e.g. a node) should select it in the UI.
9. It can [infer types](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#type-inference-for-tools) from the tools exported by `core`.
10. The chat should use Vercel AI SDK’s [useChat](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot). It will accept a prop which provides the [transport](https://ai-sdk.dev/docs/ai-sdk-ui/transport), which should conform to Vercel’s `DefaultChatTransport` interface. Whether this prop is available or not determines whether the AI button/feature is available at all. It can be a prop to the entrypoint `petrinaut.tsx` component and then passed directly to `EditorView`.
11. Add appropriate unit tests which test meaningful behaviour, using appropriate mocks for the AI call (e.g. checking that the right chat elements are rendered when the model is thinking, has called a tool, etc).

### UI handoff notes

1. Use `petrinautAiTools` for tool typing and `createPetrinautAiToolCallbacks(instance)` for client-side tool execution.
2. Tool calls should apply to the live Petrinaut instance via `onToolCall`, not on the server.
3. Tool-call UI should map tool names to concise human-readable summaries, such as “Added place X”, “Updated arc weight”, or “Removed type Y”.
4. Completed tool summaries should select or focus affected entities where the tool input identifies one. For non-entity or batch mutations, show a generic mutation summary.
5. Destructive tools are allowed for the MVP because there is no suggestion review. The UI should rely on existing document history/undo rather than building an AI-specific review flow.
6. Feature availability should be controlled by the optional chat transport prop. If no transport is provided, hide or disable the AI entry point.

# `apps/petrinaut-website`

1. Add the Vercel AI SDK in a server endpoint for the chat window to consume, following the requirements of the Vercel AI SDK (i.e. endpoint accepting messages/sendMessages and streaming response back). `petrinaut-website` is currently a Vite app, so this may require adding an appropriate Vercel/serverless function rather than a Next.js server action. See reference implementation [here](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#api-route).
2. Set up a provider registry with only OpenAI for now – [see Vercel docs](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
3. Add an `OPENAI_API_KEY` environment variable. NOT PUBLIC! Should not be exposed to the browser.
4. Use GPT-5.5 model, `gpt-5.5-2026-04-23`, as the default model, but keep the model configurable via server-side environment/configuration.
5. Import `petrinautAiTools` and `createPetrinautAiPrompt` from Petrinaut; do not duplicate tool schemas or prompt text in the website.
6. The endpoint streams model output and tool-call parts but does not execute Petrinaut mutations server-side. The browser applies tool calls to the live editor instance through the UI `onToolCall` path.
7. Protect the endpoint before exposing it publicly: at minimum add request size limits, origin/CORS checks, and rate limiting.
8. Add the prop created for the chat transport to Petrinaut in the demo website.

## Known non-goals for the next two phases

1. Do not add suggestion review or approval flows for MVP; tool calls edit the live net directly.
2. Do not add chat tabs.
3. Do not add AI-specific undo/redo UX beyond existing Petrinaut document history.
4. Do not persist chat history server-side unless explicitly scoped later.
