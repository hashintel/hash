# HASH AI Agent - Client

A minimal React chat frontend that connects to the Mastra backend server.

## Architecture

This setup runs **two separate processes**:

```txt
┌─────────────────────┐         ┌─────────────────────┐
│   Vite Dev Server   │         │   Mastra Server     │
│   (port 5173)       │ ──────▶ │   (port 4111)       │
│                     │  HTTP   │                     │
│   React SPA         │  proxy  │   Agents, Workflows │
│   - Chat UI         │         │   - /chat/:agentId  │
│   - react-router    │         │   - /api/*          │
└─────────────────────┘         └─────────────────────┘
```

- **Mastra server** (`yarn dev:mastra`): Runs your agents, workflows, and storage
- **Vite client** (`yarn dev:client`): Serves the React SPA, proxies API requests

## Quick Start

```bash
# From apps/hash-ai-agent directory

# Install dependencies (if not already done)
yarn

# Start both servers concurrently
yarn dev

# Or run them separately:
yarn dev:mastra   # Start Mastra on port 4111
yarn dev:client   # Start Vite on port 5173
```

Open http://localhost:5173 to use the chat interface.

## Key Files

```txt
src/
├── mastra/              # Mastra server (agents, workflows)
│   └── index.ts         # Mastra config with chatRoute()
└── client/              # React client (this directory)
    ├── index.html       # HTML entry point
    ├── vite.config.ts   # Vite config with proxy settings
    ├── tsconfig.json    # TypeScript config for JSX
    ├── README.md        # This file
    ├── main.tsx         # React entry point
    ├── app.tsx          # Router setup
    └── components/
        └── chat.tsx     # Chat UI using useChat()
```

## How It Works

### Server Side (Mastra)

The Mastra server configuration in `src/mastra/index.ts` includes:

```typescript
import { chatRoute } from "@mastra/ai-sdk";

export const mastra = new Mastra({
  agents: { myAgent, anotherAgent },
  server: {
    port: 4111,
    cors: { origin: ["http://localhost:5173"] },
    apiRoutes: [
      // Creates POST /chat/:agentId endpoint
      chatRoute({ path: "/chat/:agentId" }),
    ],
  },
});
```

The `chatRoute()` helper from `@mastra/ai-sdk` creates an AI SDK v5 compatible streaming endpoint.

### Client Side (React)

The chat component uses `useChat()` from `@ai-sdk/react`:

```typescript
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

function Chat() {
  const { messages, input, setInput, handleSubmit, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/chat/myAgent`, // Proxied to Mastra server
    }),
  });

  // ... render messages and input form
}
```

### CORS & Proxy

During development, Vite proxies `/chat/*` and `/api/*` requests to the Mastra server. This avoids CORS issues by making requests same-origin from the browser's perspective.

For production, you have two options:

1. Configure your production server to proxy requests similarly
2. Set appropriate CORS headers on the Mastra server

## Packages Used

| Package          | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `@mastra/ai-sdk` | `chatRoute()` helper for AI SDK streaming |
| `@ai-sdk/react`  | `useChat()` hook for client-side chat     |
| `ai`             | Vercel AI SDK core (DefaultChatTransport) |
| `react-router`   | Client-side routing                       |
| `vite`           | Dev server with HMR and proxy             |

## Adding More Features

### Custom API Routes

Add routes in `src/mastra/index.ts`:

```typescript
import { registerApiRoute } from "@mastra/core/server";

server: {
  apiRoutes: [
    chatRoute({ path: "/chat/:agentId" }),
    
    // Custom endpoint
    registerApiRoute("/api/status", {
      method: "GET",
      handler: async (c) => {
        return c.json({ status: "ok" });
      },
    }),
  ],
}
```

### Workflow Streaming

For workflows, use `workflowRoute()`:

```typescript
import { workflowRoute } from "@mastra/ai-sdk";

apiRoutes: [
  workflowRoute({ path: "/workflow/:workflowId" }),
]
```

### Using @mastra/react

For more Mastra-specific features, wrap your app with `MastraReactProvider`:

```typescript
import { MastraReactProvider, useMastraClient } from "@mastra/react";

function App() {
  return (
    <MastraReactProvider baseUrl="http://localhost:4111">
      <MyApp />
    </MastraReactProvider>
  );
}

function MyComponent() {
  const client = useMastraClient();
  // client.listAgents(), client.getAgent(id).details(), etc.
}
```

## Troubleshooting

### "Failed to fetch" or Network Errors

- Ensure Mastra server is running (`yarn dev:mastra`)
- Check that port 4111 is not in use by another process

### Agent Not Found

- Verify the agent ID matches one registered in `src/mastra/index.ts`
- Check Mastra server logs for errors

### CORS Errors in Production

- Configure CORS in Mastra server config: `server.cors.origin`
- Or set up a reverse proxy in your production infrastructure
