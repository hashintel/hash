## Mastra: Agent Framework for Production

### Workflow Orchestration
Mastra's core strength is **graph-based workflows** with:
- `.then()`, `.branch()`, `.parallel()` for step composition
- **Suspend/resume**: Pause workflows for human-in-the-loop (HITL), external callbacks, or rate limiting
- **Event-driven execution**: `.waitForEvent()`, `.sendEvent()` for async triggers

Neither TanStack AI nor Vercel AI SDK have workflow engines—they focus on chat/agent loops.

### Human-in-the-Loop (HITL)
Workflows can **suspend at any step**, persist state to storage (LibSQL/PostgreSQL), and resume later:
```typescript
execute: async ({ inputData, resumeData, suspend }) => {
  const { approved } = resumeData ?? {}
  if (!approved) {
    return await suspend({ reason: "Human approval required." })
  }
  return { output: `${message} - Deleted` }
}
```
State persists across deployments and server restarts. TanStack AI has tool approval but no workflow suspension. Vercel AI SDK relies on external state management.

### Memory Systems
Mastra provides **working memory** and **semantic recall** with storage backends (PostgreSQL, LibSQL, Upstash). Agents remember conversation history across sessions:
```typescript
const agent = new Agent({
  memory: new Memory({
    storage: new LibSQLStore({ url: "file:memory.db" })
  })
})
```
TanStack AI and Vercel AI SDK require manual memory implementation.

### RAG Support
Built-in **document processing, chunking, embeddings, and vector search** with:
- `MDocument.fromText()` for document ingestion
- Chunking strategies (recursive, sliding window)
- Vector store integrations (pgvector, Pinecone, Qdrant, MongoDB)

Neither TanStack AI nor Vercel AI SDK provide RAG primitives—use external libraries like LangChain or LlamaIndex.

### Agents vs. Workflows
Mastra distinguishes **agents** (autonomous, LLM-driven reasoning) from **workflows** (deterministic step sequences):
- **Agents**: Use `maxSteps` for iteration limits, call tools dynamically based on LLM reasoning
- **Workflows**: Explicit control flow with fixed steps, branches, and parallel execution

Vercel AI SDK and TanStack AI focus on agents (agentic loops), not deterministic workflows.

### Deployment Options
Mastra offers:
- **Mastra Cloud**: Fully managed, GitHub integration, auto-deploy on push, built-in observability
- **Self-hosted**: Node.js server, custom middleware, integrates with Next.js/Express/Hono
- **Serverless**: Vercel, Netlify, Cloudflare Workers

TanStack AI and Vercel AI SDK are libraries, not platforms—deployment is your responsibility.

### Observability
Comprehensive tracing via **OpenTelemetry** with exporters for:
- Mastra Cloud (centralized dashboard)
- Langfuse, Datadog, Sentry, Axiom

Traces show agent/workflow execution, token usage, tool calls, and errors.

### Integration with Vercel AI SDK
Mastra **integrates with Vercel AI SDK UI**. Use `useChat()` hook to call Mastra agents:
```typescript
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: 'http://localhost:4111/chat' })
})
```
This lets you combine Mastra's backend orchestration with Vercel's frontend tooling.

***

## Key Trade-Offs

| Feature                 | TanStack AI                              | Vercel AI SDK                        | Mastra                                |
| ----------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------- |
| **Maturity**            | Alpha (Dec 2025)                         | Stable (v5)                          | Stable                                |
| **Isomorphic Tools**    | ✅ Define once, `.server()` / `.client()` | ❌ Separate implementations           | ❌ Single tool definition              |
| **Structured Outputs**  | ❌ Not documented                         | ✅ `generateObject`, `streamObject`   | ✅ Via `outputSchema` on agents        |
| **DevTools**            | ✅ Built-in                               | ❌ Third-party only                   | ✅ Mastra Cloud dashboard              |
| **Workflow Engine**     | ❌ Chat/agent loops only                  | ❌ Chat/agent loops only              | ✅ Graph-based, suspend/resume         |
| **Human-in-the-Loop**   | ⚠️ Tool approval only                     | ⚠️ Manual implementation              | ✅ Workflow suspend/resume             |
| **Memory Systems**      | ❌ Manual                                 | ❌ Manual                             | ✅ Built-in storage backends           |
| **RAG Support**         | ❌ External libraries                     | ❌ External libraries                 | ✅ Document processing, vector stores  |
| **Agent Loop Control**  | `maxIterations(n)`                       | `stopWhen`, `prepareStep` (granular) | `maxSteps` + workflow control         |
| **Provider Count**      | 4 (OpenAI, Anthropic, Gemini, Ollama)    | 40+                                  | Uses Vercel AI SDK models (40+)       |
| **Multi-Language**      | JS/TS (Python/PHP planned)               | JS/TS only                           | JS/TS only                            |
| **Deployment Platform** | ❌ Library only                           | ❌ Library only                       | ✅ Mastra Cloud + self-hosted          |
| **Type Safety**         | ✅ Per-model options typed                | ⚠️ Provider options not typed         | ⚠️ Depends on AI SDK                   |
| **Framework Lock-in**   | ❌ Truly agnostic                         | ⚠️ Optimized for Next.js/Vercel       | ⚠️ Node.js-focused, React/Next.js best |

***

## Critical Assessment

### TanStack AI Strengths
- **Isomorphic tools**: Cleanest API for shared tool definitions between server/client
- **Type safety**: Provider-specific options are typed per model
- **DevTools**: Real-time inspection from day one
- **Multi-framework**: Works with any JS framework, not just React/Next
- **No vendor lock-in**: Open protocols, multiple adapters

### TanStack AI Weaknesses
- **Alpha stage**: Missing features (structured outputs, speech APIs, more providers)
- **Small ecosystem**: Fewer adapters, integrations, and community resources vs. Vercel AI SDK
- **Sparse docs**: Advanced patterns (custom streaming, complex agent flows) underdocumented
- **No workflow engine**: Can't pause/resume execution for HITL or long-running tasks
- **No memory/RAG**: Requires external libraries

### Vercel AI SDK Strengths
- **Mature**: Stable v5 with 40+ providers, extensive docs, large community
- **Feature-rich**: Structured outputs, speech APIs, MCP, RSC, transport flexibility
- **Agentic control**: `stopWhen` + `prepareStep` for fine-grained agent loops
- **React integration**: `useChat` hook simplifies frontend state management
- **Production-ready**: Used by thousands of apps on Vercel

### Vercel AI SDK Weaknesses
- **No isomorphic tools**: Separate server/client implementations
- **Type safety gaps**: Provider options not strongly typed
- **No devtools**: Relies on third-party observability (Datadog, Axiom)
- **No workflow engine**: Agent loops only, no suspend/resume
- **Vercel optimization**: Best DX on Vercel platform (edge caching, streaming)

### Mastra Strengths
- **Workflow orchestration**: Graph-based, suspend/resume, event-driven
- **HITL**: Pause workflows for approvals, persist state across deployments
- **Memory & RAG**: Built-in storage, document processing, vector search
- **Production observability**: Mastra Cloud dashboard, OpenTelemetry exporters
- **Agent + Workflow**: Combine autonomous agents with deterministic workflows

### Mastra Weaknesses
- **Heavy**: `@mastra/core` is 1000+ files, 10MB, 43 dependencies
- **TypeScript-only**: No Python/PHP support (unlike TanStack AI's roadmap)
- **Node.js-focused**: Best on Next.js/React, less suited for other frameworks
- **Less flexible**: More opinionated than TanStack AI or Vercel AI SDK
- **Workflow complexity**: Steeper learning curve for graph-based orchestration

***

## Use Case Recommendations

### Choose **TanStack AI** if:
- You need **framework-agnostic** AI (Vue, Svelte, Solid, vanilla JS)
- **Isomorphic tools** (single definition, server/client implementations) are critical
- You want **per-model type safety** for provider options
- **DevTools** for debugging are essential from day one
- You're willing to adopt **alpha software** and contribute to a new ecosystem

### Choose **Vercel AI SDK** if:
- You need **production-ready** features (structured outputs, speech APIs, 40+ providers)
- **Fine-grained agent control** (`stopWhen`, `prepareStep`) is required
- You're building in **Next.js/React** and want seamless `useChat` integration
- **Transport flexibility** (WebSockets, client-only) matters
- You prefer **mature ecosystem** with extensive docs and community support

### Choose **Mastra** if:
- You need **workflow orchestration** (branching, parallel steps, suspend/resume)
- **Human-in-the-loop** with persistent state is critical
- **Memory systems** and **RAG** are required out-of-the-box
- You want **production observability** with Mastra Cloud or custom exporters
- You're building **multi-step agent systems** that mix autonomous and deterministic logic

***

## Summary: Philosophical Differences

**TanStack AI** prioritizes **developer freedom**: no framework lock-in, no cloud vendor, true isomorphism. It's the "Swiss Army knife" approach—minimal, composable, type-safe primitives that work anywhere. The trade-off? Alpha maturity, missing features, smaller ecosystem.

**Vercel AI SDK** prioritizes **production velocity**: mature features, 40+ providers, seamless Next.js integration. It's the "Rails of AI"—opinionated but powerful, optimized for Vercel's platform. The trade-off? Less isomorphic tooling, weaker type safety for provider options.

**Mastra** prioritizes **orchestration complexity**: workflows, HITL, memory, RAG. It's the "enterprise backbone"—built for multi-step agent systems with observability and persistence. The trade-off? Heavy dependencies, Node.js focus, steeper learning curve.

### Terse Summary
- **TanStack AI**: Framework-agnostic, isomorphic tools, type-safe provider options, built-in devtools, alpha stage (missing structured outputs, 40+ providers)
- **Vercel AI SDK**: Production-ready, 40+ providers, structured outputs, fine-grained agent control (`stopWhen`/`prepareStep`), React/Next.js optimized, no isomorphic tools
- **Mastra**: Workflow orchestration (suspend/resume, HITL), memory + RAG built-in, agent + workflow hybrid, production observability (Mastra Cloud), heavy (10MB, Node.js-focused)
- TanStack AI: Choose for framework flexibility + isomorphic tooling
- Vercel AI SDK: Choose for mature features + Next.js integration  
- Mastra: Choose for multi-step workflows + enterprise orchestration
- TanStack AI vs Vercel: Isomorphic tools, type safety vs. mature ecosystem, structured outputs
- Mastra vs both: Workflow engine, HITL, memory/RAG vs. chat-focused agent loops
- All three integrate: Use Mastra backend + Vercel `useChat` frontend, or TanStack AI with custom memory/RAG
