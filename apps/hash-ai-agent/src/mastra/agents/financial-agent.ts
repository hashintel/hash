import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
// Memory processors - uncomment when needed
// import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';
import { getTransactionsTool } from '../tools/get-transactions-tool';

import { createOpenAI } from '@ai-sdk/openai';

const openRouterOpenAI = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});

const embedder = openRouterOpenAI.embedding('google/gemini-embedding-001');

export const financialAgent = new Agent({
  id: 'financial-agent-id',
  name: 'Financial Assistant Agent',
  instructions: `ROLE DEFINITION
- You are a financial assistant that helps users analyze their transaction data.
- Your key responsibility is to provide insights about financial transactions.
- Primary stakeholders are individual users seeking to understand their spending.

CORE CAPABILITIES
- Analyze transaction data to identify spending patterns.
- Answer questions about specific transactions or vendors.
- Provide basic summaries of spending by category or time period.

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
- Use the getTransactions tool to fetch financial transaction data.
- After calling getTransactions, you MUST analyze the CSV data returned and provide a helpful response to the user.
- Parse the CSV data to extract transaction details (dates, amounts, vendors, categories).
- Always provide insights, summaries, or answers based on the transaction data you retrieve.
- Never just call the tool and stop - always follow up with analysis and a response.`,
  model: 'openrouter/google/gemini-2.5-flash-lite',
  tools: { getTransactionsTool },
  memory: new Memory({
    // Storage adapter for persisting memory data
    storage: new LibSQLStore({
      id: 'financial-agent-memory-id',
      url: 'file:../financial-memory.db', // path is relative to the .mastra/output directory
    }),
    // Vector store for semantic recall (enables RAG-based memory search)
    vector: new LibSQLVector({
      id: 'financial-agent-vector-id',
      connectionUrl: 'file:../financial-memory.db', // Can use same DB or separate
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
        scope: 'resource', // 'thread' (current conversation only) or 'resource' (all user conversations)
      },

      // 3. WORKING MEMORY: Persistent user information across conversations
      workingMemory: {
        enabled: true,
        scope: 'resource', // 'thread' (per conversation) or 'resource' (across all conversations)
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

    // 5. MEMORY PROCESSORS: Filter/transform messages before sending to LLM
    // Uncomment and import processors when needed:
    // processors: [
    //   // Remove tool calls from memory to save tokens (optional - keeps memory cleaner)
    //   // new ToolCallFilter({ exclude: ['getTransactionsTool'] }), // Exclude specific tools
    //   // new ToolCallFilter(), // Or exclude all tool calls
    //
    //   // Limit total tokens from memory to prevent context window overflow
    //   // Using o200k_base encoding (default, suitable for GPT-4o and similar models)
    //   new TokenLimiter(127000), // Limit to ~127k tokens (adjust based on your model)
    //   // Always place TokenLimiter LAST in the processors array
    // ],
  }),
});
