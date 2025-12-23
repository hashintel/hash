/**
 * Minimal chat component using AI SDK's useChat hook.
 *
 * Key concepts:
 * 1. useChat() from @ai-sdk/react manages message state and streaming
 * 2. DefaultChatTransport connects to our Mastra server's chatRoute()
 * 3. The :agentId in the URL path selects which agent to chat with
 *
 * The Mastra server exposes: POST /chat/:agentId
 * - Request body: { messages: [{ role: 'user' | 'assistant', content: string }] }
 * - Response: Server-Sent Events stream in AI SDK v5 format
 */
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

/**
 * Available agents registered in src/mastra/index.ts
 * These correspond to the agents object in the Mastra config
 */
const AGENTS = [
  { id: "genericAgent", label: "Generic Agent" },
  { id: "plannerAgent", label: "Planner Agent" },
  { id: "nerAgent", label: "NER Agent" },
] as const;

/**
 * Render message parts from AI SDK v5 format.
 * Messages can contain text, reasoning, tool calls, etc.
 */
const renderMessageParts = (message: UIMessage) => {
  if (message.parts.length === 0) {
    // Fallback for messages without parts
    return null;
  }

  return message.parts.map((part, index) => {
    const key = `${message.id}-part-${index}`;

    if (part.type === "text") {
      return <span key={key}>{part.text}</span>;
    }

    if (part.type === "reasoning") {
      return (
        <details key={key} style={{ marginTop: "0.5rem", color: "#888" }}>
          <summary style={{ cursor: "pointer" }}>Reasoning</summary>
          <pre
            style={{
              fontSize: "0.875rem",
              marginTop: "0.5rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {part.text}
          </pre>
        </details>
      );
    }

    return null;
  });
};

export const Chat = () => {
  // Track which agent is selected
  const [agentId, setAgentId] = useState<string>(AGENTS[0].id);

  // Track input separately (AI SDK v5 pattern)
  const [input, setInput] = useState("");

  // useChat manages the message history and streaming state
  // The transport defines how to connect to the backend
  const { messages, sendMessage, status, error } = useChat({
    // Connect to Mastra's chatRoute() endpoint
    // Vite's proxy forwards /chat/* to localhost:4111
    transport: new DefaultChatTransport({
      api: `/chat/${agentId}`,
    }),
    // Reset messages when agent changes
    id: agentId,
  });

  const handleAgentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setAgentId(event.target.value);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.trim() === "") {
      return;
    }
    void sendMessage({ text: input });
    setInput("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxWidth: "800px",
        margin: "0 auto",
        padding: "1rem",
      }}
    >
      {/* Agent selector */}
      <div style={{ marginBottom: "1rem" }}>
        <label
          htmlFor="agent-select"
          style={{ marginRight: "0.5rem", color: "#888" }}
        >
          Agent:
          <select
            id="agent-select"
            value={agentId}
            onChange={handleAgentChange}
            style={{
              marginLeft: "0.5rem",
              background: "#1a1a1a",
              color: "#fafafa",
              border: "1px solid #333",
              padding: "0.5rem",
              borderRadius: "4px",
            }}
          >
            {AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Messages display area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          marginBottom: "1rem",
          padding: "1rem",
          background: "#111",
          borderRadius: "8px",
          minHeight: "400px",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "#666", textAlign: "center", marginTop: "2rem" }}>
            Start a conversation with{" "}
            {AGENTS.find((agent) => agent.id === agentId)?.label}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: "8px",
                background: message.role === "user" ? "#1a3a1a" : "#1a1a2a",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#888",
                  marginBottom: "0.25rem",
                }}
              >
                {message.role === "user" ? "You" : "Agent"}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {renderMessageParts(message)}
              </div>
            </div>
          ))
        )}

        {/* Show loading state while streaming */}
        {status === "streaming" ? (
          <div style={{ color: "#888", fontStyle: "italic" }}>
            Agent is typing...
          </div>
        ) : null}

        {/* Show errors if any */}
        {error ? (
          <div
            style={{
              color: "#ff6b6b",
              padding: "0.75rem",
              background: "#2a1a1a",
              borderRadius: "8px",
              marginTop: "1rem",
            }}
          >
            Error: {error.message}
          </div>
        ) : null}
      </div>

      {/* Input form */}
      <form
        onSubmit={handleFormSubmit}
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          disabled={status === "streaming"}
          style={{
            flex: 1,
            padding: "0.75rem",
            background: "#1a1a1a",
            color: "#fafafa",
            border: "1px solid #333",
            borderRadius: "8px",
            fontSize: "1rem",
          }}
        />
        <button
          type="submit"
          disabled={status === "streaming" || input.trim() === ""}
          style={{
            padding: "0.75rem 1.5rem",
            background: status === "streaming" ? "#333" : "#2563eb",
            color: "#fafafa",
            border: "none",
            borderRadius: "8px",
            cursor: status === "streaming" ? "not-allowed" : "pointer",
            fontSize: "1rem",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
};
