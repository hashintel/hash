import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
// Memory processors for optimizing token usage
import { TokenLimiter } from "@mastra/core/processors";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

import { mcpTools } from "../mcp";
import { getTransactionsTool } from "../tools/get-transactions-tool";

const openRouterOpenAI = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

const embedder = openRouterOpenAI.embedding("google/gemini-embedding-001");

export const financialAgent = new Agent({
  id: "financial-agent-id",
  name: "Financial Assistant Agent",
  instructions: `

ROLE DEFINITION
- You are a financial assistant that helps users analyze their transaction data, or anything related to the tools you have access to.
- Your key responsibility is to provide insights about the data returned from your tools.

CORE CAPABILITIES
- Analyze data returned from your tools in accordance wiht the user's request
- Answer questions about any of that data
- Provide basic summaries of the data in accordance with the user's request
- Use the tools you have access to to complete the user's request.

BEHAVIORAL GUIDELINES
- Maintain a professional and friendly communication style.
- Keep responses concise but informative.
- Always clarify if you need more information to answer a question.
- Format currency values appropriately.
- Ensure user privacy and data security.

CONSTRAINTS & BOUNDARIES
- Do not provide financial investment advice.
- Avoid discussing topics outside of the transaction data provided.
- Never make assumptions about the user's financial situation beyond what's in the data.

SUCCESS CRITERIA
- Deliver accurate and helpful analysis of transaction data.
- Achieve high user satisfaction through clear and helpful responses.
- Maintain user trust by ensuring data privacy and security.

TOOLS
- You have access to various tools that extend your capabilities. Each tool has its own description that explains what it does and when to use it.
- When using tools, always complete the full task - don't stop after just calling a tool. Analyze the results and provide a helpful response to the user.
- For multi-step tasks (like composing emails with transaction data), use the appropriate tools in sequence to complete the entire request.

`,
  model: "openrouter/google/gemini-2.5-flash-lite",
  tools: { getTransactionsTool, ...mcpTools }, // Add MCP tools to your agent
  memory: new Memory({
    // Storage adapter for persisting memory data
    storage: new LibSQLStore({
      id: "financial-agent-memory-id",
      url: "file:../financial-memory.db", // path is relative to the .mastra/output directory
    }),
    // Vector store for semantic recall (enables RAG-based memory search)
    vector: new LibSQLVector({
      id: "financial-agent-vector-id",
      connectionUrl: "file:../financial-memory.db", // Can use same DB or separate
    }),
    // Embedder for converting messages to vectors (using OpenRouter-compatible model string)
    // Note: Using Google embedding model which works well with OpenRouter
    embedder,
    // Memory configuration options
    options: {
      // 1. CONVERSATION HISTORY: Number of recent messages to include
      lastMessages: 20, // Default is 10, set to false to disable

      // 2. SEMANTIC RECALL: Vector search for relevant past messages
      semanticRecall: {
        topK: 5, // Retrieve 5 most semantically similar messages
        messageRange: { before: 2, after: 2 }, // Include 2 messages before and after each match
        scope: "resource", // 'thread' (current conversation only) or 'resource' (all user conversations)
      },

      // 3. WORKING MEMORY: Persistent user information across conversations
      workingMemory: {
        enabled: true,
        scope: "resource", // 'thread' (per conversation) or 'resource' (across all conversations)
        template: `# User Financial Profile

## Personal Information
- Name:
- Preferred Currency:
- Timezone:

## Financial Preferences
- Budget Categories: [e.g., Groceries, Entertainment, Bills]
- Spending Goals:
- Alert Thresholds: [e.g., "Alert me if I spend more than $500 in a day"]

## Recent Insights
- Last Analysis Date:
- Key Spending Patterns:
- Recommendations:

## Session Context
- Current Focus: [What the user is currently analyzing]
- Open Questions:`,
      },

      // 4. THREAD TITLE GENERATION: Auto-generate conversation titles
      generateTitle: true,
    },
  }),
  // Input processors: Run after memory processors load history
  // TokenLimiter prevents context window overflow by limiting tokens from memory
  inputProcessors: [
    // Limit total tokens from memory to prevent context window overflow
    // Using o200k_base encoding (default, suitable for GPT-4o and similar models)
    // Adjust limit based on your model's context window (Gemini 2.5 Flash Lite has ~1M token context)
    // Setting to 500k to leave room for the current conversation and tool calls
    new TokenLimiter(500000), // Limit to ~500k tokens from memory
    // Always place TokenLimiter LAST in the processors array
  ],
});
