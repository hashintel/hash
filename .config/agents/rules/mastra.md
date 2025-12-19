---
name: mastra
description: Mastra TypeScript framework for AI agents with memory, tools, workflows, and RAG. Use when working with @mastra/* packages or building AI agents.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - mastra
      - "@mastra/"
      - mastra.ai
    intent-patterns:
      - "\\b(use|build|create|implement)\\b.*?\\bmastra\\b"
      - "\\b(agent|workflow|rag)\\b.*?\\bmastra\\b"
---

# Mastra Framework

Open-source TypeScript framework for building AI agents with memory, tools, workflows, and RAG capabilities. Fetch the relevant documentation URL below to get current API details.

## Documentation Entry Points

### Getting Started and Installation

https://mastra.ai/docs/v1/getting-started/installation

Covers: create-mastra CLI, project setup wizard, Node.js 20+ prerequisites, LLM provider API keys, Studio interface (localhost:4111), manual installation, TypeScript config, example weather agent

### Building Agents

https://mastra.ai/docs/v1/agents/overview

Covers: Agent definition with LLMs and tools, instruction formats (string/array/system message), provider options, agent registration in Mastra instance, generate() vs stream() methods, structured output with Zod schemas, maxSteps parameter, image processing, onStepFinish callbacks, RuntimeContext for request-specific behavior

### Agent Memory

https://mastra.ai/docs/v1/memory/overview

Covers: Three memory types (working memory, conversation history, semantic recall), thread-scoped vs resource-scoped memory, storage adapters (LibSQL, MongoDB, Postgres, Upstash), context management, memory processors for token limits, tracing integration

### Creating Tools

https://mastra.ai/docs/v1/agents/using-tools

Covers: Tool definition (inputSchema, outputSchema, execute), loading tools from MCP servers, RuntimeContext in tools, AbortSignal for cancellation, AI SDK tool format compatibility, Studio testing

### Workflows (Deterministic Pipelines)

https://mastra.ai/docs/v1/workflows/overview

Covers: createStep() with input/output schemas, .then() chaining, .commit() finalization, workflow state sharing, nested workflows, .start() vs .stream() execution, suspend/resume, automatic restart, status tracking (running/suspended/success/failed)

### RAG (Retrieval-Augmented Generation)

https://mastra.ai/docs/v1/rag/overview

Covers: MDocument for document processing, chunking strategies (recursive, sliding window), embedding generation, vector stores (pgvector, Pinecone, Qdrant, MongoDB), similarity search, cost monitoring, query pattern analysis

### MCP (Model Context Protocol)

https://mastra.ai/docs/v1/mcp/overview

Covers: MCPClient (connect to MCP servers), MCPServer (expose Mastra tools), static vs dynamic tools configuration, local packages vs remote HTTP endpoints, serverless deployment (Cloudflare Workers, Vercel, Lambda), MCP registry integration (Klavis AI, mcp.run, Composio, Smithery)

### Voice Capabilities

https://mastra.ai/docs/v1/voice/overview

Covers: Text-to-Speech (TTS), Speech-to-Text (STT), Speech-to-Speech (real-time), providers (OpenAI, Azure, ElevenLabs, PlayAI, Google, Deepgram, Cloudflare), CompositeVoice for mixing providers, OpenAI Realtime, Google Gemini Live

### Streaming

https://mastra.ai/docs/v1/streaming/overview

Covers: .stream() (V2/AI SDK v5) vs .streamLegacy() (V1/AI SDK v4), textStream iteration, stream properties (text, finishReason, usage), Agent.network() for multi-agent, workflow event streaming, Run.streamVNext()

### Deployment

https://mastra.ai/docs/v1/deployment/overview

Covers: Mastra Cloud (managed platform), web framework integration (Next.js, Astro), Node.js HTTP server, serverless deployers (Cloudflare Workers, Vercel, Netlify), runtime compatibility (Node 20+, Bun, Deno), Client SDK

### Observability and Tracing

https://mastra.ai/docs/v1/observability/overview

Covers: Structured logging with trace correlation, AI tracing (LLM calls, agent paths, tool calls, workflow steps), token usage/latency tracking, external providers (Langfuse, Braintrust, Datadog, New Relic, SigNoz), Studio/Cloud dashboards

## Quick API Reference

| Class/Function   | Reference                                              |
| ---------------- | ------------------------------------------------------ |
| Agent            | https://mastra.ai/reference/v1/agents/agent            |
| Agent.generate() | https://mastra.ai/reference/v1/agents/generate         |
| Agent.stream()   | https://mastra.ai/reference/v1/streaming/agents/stream |
| Workflow         | https://mastra.ai/reference/v1/workflows/workflow      |
| Memory           | https://mastra.ai/reference/v1/memory/memory-class     |
| createTool()     | https://mastra.ai/reference/v1/tools/create-tool       |
| MCPClient        | https://mastra.ai/reference/v1/tools/mcp-client        |
| MCPServer        | https://mastra.ai/reference/v1/tools/mcp-server        |

## Gotchas

- Workflows vs Workflows (Legacy): Prefer non-legacy. Legacy uses different API patterns.
- generate() vs stream(): Use stream() for real-time token delivery; generate() waits for complete response
- stream() vs streamLegacy(): stream() is V2 (AI SDK v5), streamLegacy() is V1 (AI SDK v4)
- Memory storage: Requires explicit storage backend (LibSQL, Postgres, etc.) - not automatic
- maxSteps default: Agent maxSteps defaults to 5 - increase for complex multi-tool tasks
- MCP tools: Use getTools() for static single-user, getToolsets() for multi-tenant with varying credentials
