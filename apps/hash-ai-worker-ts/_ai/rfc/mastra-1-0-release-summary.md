Let me provide a comprehensive summary based on the transcript content, which covers the key features quite thoroughly.

---

## Mastra 1.0 Key Architectural Features Summary

### 1. **Server Adapters** (Presented by Leonard)

**Problem Solved:** Previously, integrating Mastra into existing applications (especially monorepos) was problematic because Mastra's bundler tried to bundle everything, causing edge cases and conflicts.

**Solution:** Server adapters allow seamless integration of Mastra into existing server frameworks without custom reimplementation.

**Supported Frameworks:**
- Hono
- Express
- Fastify
- Koa
- Custom adapters (via documentation)

**How It Works:**
```typescript
// Example with Hono
import { MastraServer } from '@mastra/hono'

const server = new MastraServer()
server.init(mastraInstance)
// Adds middleware to existing server
// All Mastra API routes become available in your app
// Access mastra in route context for custom routes
```

**Key Benefit:** The `init()` call placement matters - it determines middleware behavior. You can run Mastra dev/studio in parallel with your existing server.

---

### 2. **Observability Overhaul** (Presented by Eric)

**Problem with Previous System:** The old OpenTelemetry-based system couldn't ship trace data until spans completed. For AI agents that run for minutes or hours, this made real-time debugging impossible.

**New Custom Tracing System:**
- Ships data at start, middle, and end of requests
- Enables live debugging of long-running agent processes
- Still supports OpenTelemetry for backwards compatibility

**Exporters (Zero-Config):**
- Default (local storage persistence)
- Mastra Cloud
- Third-party: Arize, BrainTrust, DataDog, Laminar, Langfuse, Langsmith, PostHog, Sentry
- OpenTelemetry (for any OTel-compatible system)
- OpenTelemetry Bridge (for existing OTel setups)

**Key Features:**
- Real-time trace viewing while agents are still running
- Custom native exporters use provider APIs directly (not OTel) for platform-specific features
- Prompt caching visibility (shows cache write/read tokens)

**Coming Soon:** Metrics (token sums, costs, time), datasets, experiments, and eval integration.

---

### 3. **Composite Storage**

**Problem:** Different data types have different storage requirements:
- Message history: frequently accessed, relatively small
- Observability traces: accessed less frequently, can be enormous

**Solution:** Composite storage allows different databases for different domains.

```typescript
const compositeStore = new CompositeStore({
  default: new LibSQLStore(),  // Default for everything
  observability: new ClickHouseStore(),  // Override for traces
  workflows: new PostgresStore(),  // Override for workflows
})

new Mastra({
  storage: compositeStore
})
```

**Recommendation:** Use columnar stores (ClickHouse) for observability, relational databases for other domains.

---

### 4. **Processor System Overhaul** (Presented by Daniel)

**Previous Limitations:** Processors only had three hooks and didn't scale well for complex systems.

**New Processor Lifecycle Hooks:**
1. `processInput` - Start of execution
2. `processInputStep` - **NEW** - Each step going into the agentic loop
3. `processOutputStep` - **NEW** - Each step coming out of the agentic loop
4. `processOutputStream` - Process each streaming chunk
5. `processOutputResult` - Final result processing

**Workflow-Based Processor Composition:**
```typescript
// Processors can be wrapped in createStep
const processorWorkflow = new Workflow()
  .step(createStep(processor1))
  .step(createStep(processor2))
  .step(createStep(processor3))
  .parallel() // Run in parallel!
  .then(finalStep)

// Attach to agent
agent.processors = processorWorkflow
```

**Benefits:**
- Run processors in parallel (previously only sequential)
- Full workflow capabilities (branching, mapping, etc.)
- Testable in Studio UI individually or as workflow

**Trip Wires:** Distinguish expected bailouts from errors - allows graceful handling and course correction rather than catastrophic failure.

**Dynamic Configuration via Processors:**
```typescript
processInputStep: (context) => {
  // Change tools, models, configuration per step
  const model = await routeModel(context.prompt)
  return { model }
}
```

**Memory as Processors:** The entire memory implementation has been moved to processors internally, giving more control over memory features like working memory.

---

### 5. **Agent Approval (Human-in-the-Loop)**

**New Feature:** Tool call approval mechanism for agents.

**How It Works:**
- Enable `requireToolApproval: true` in stream/generate calls
- When a tool is called, execution pauses for user approval
- If declined, the result "tool call was not approved by user" is returned to the model
- Model can respond intelligently based on approval status

**Implementation:**
- **Streaming:** Check for `toolCallApproval` chunk type
- **Generate:** Check `output.approval` property, then resume workflow

**Also Works With:** Agent networks for multi-agent approval flows.

---

### 6. **Bundling Improvements**

**Change:** Mastra no longer tries to bundle external packages from monorepos - instead lets npm handle dependencies.

**Result:** Better monorepo support, fewer edge cases with complex setups.

---

### Key Takeaways

| Feature | Problem Solved |
|---------|----------------|
| Server Adapters | Integration with existing frameworks |
| Custom Observability | Real-time debugging of long-running agents |
| Composite Storage | Right database for each data type |
| Processor Overhaul | Parallel execution, per-step hooks, workflow composition |
| Agent Approval | Human-in-the-loop for tool calls |
| Bundling Improvements | Monorepo compatibility |
