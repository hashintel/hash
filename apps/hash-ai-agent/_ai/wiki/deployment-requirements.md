# Deployment Requirements: Mastra Workflow State Management

> Technical requirements for deploying human-in-the-loop workflows with Mastra.
> Captured 2024-12-22. Source: Analysis of Mastra core (vNext/Evented model).

## Key Finding: Storage is Required for Human-in-the-Loop

**In-memory state is sufficient for single-run workflows**, but **storage is essential for suspend/resume across execution sessions**.

### Why This Matters

- **Single-run workflow**: Steps pass outputs in-memory via accumulated `stepResults` object. No database involved.
- **Human-in-the-loop workflow**: Step calls `suspend()`, workflow state persists to storage, process can terminate. Hours/days later, `resume()` loads state from storage and continues.

Without storage configured, suspended workflows lose all state on process restart.

## Storage Requirements by Use Case

| Use Case | Storage Required? |
|----------|-------------------|
| Workflows completing in single execution | No |
| Human approval gates | **Yes** |
| Long-running workflows (survive restarts) | **Yes** |
| External webhook callbacks | **Yes** |
| Audit trail / workflow history queries | **Yes** |

## Configuring Storage

```typescript
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";

const mastra = new Mastra({
  storage: new PostgresStore({ 
    connectionString: process.env.DATABASE_URL 
  })
});
```

### Supported Backends

- **PostgreSQL** - production recommended
- **LibSQL/SQLite** - local development, serverless edge
- **Custom** - implement `BaseStorage` interface

## Suspend/Resume Pattern

### Suspending a Workflow

```typescript
const approvalStep = createStep({
  id: "request-approval",
  inputSchema: z.object({ proposal: z.string() }),
  suspendSchema: z.object({ 
    reason: z.string(),
    context: z.record(z.unknown()) 
  }),
  resumeSchema: z.object({ 
    approved: z.boolean(),
    notes: z.string().optional() 
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    // If not yet approved, suspend and wait
    if (!resumeData?.approved) {
      await suspend({ 
        reason: "Human approval required",
        context: { proposal: inputData.proposal }
      });
      return; // Execution stops here
    }
    
    // Resumed with approval
    return { approved: true, notes: resumeData.notes };
  }
});
```

### Resuming a Workflow

```typescript
// Later, when human approves via API/UI:
const run = await workflow.getRunById(runId);
const result = await run.resume({
  resumeData: { approved: true, notes: "LGTM" }
});
```

### Querying Suspended Workflows

```typescript
// Find workflows awaiting human input
const pending = await mastra.getStorage().getWorkflowRuns({
  workflowName: "approval-workflow",
  status: "suspended"
});
```

## vNext (Evented) Model

The evented execution model treats suspend/resume as first-class workflow states:

- **Suspend** publishes `workflow.suspend` event, persists snapshot
- **Resume** publishes `workflow.resume` event, loads snapshot, continues from `suspendedPaths`
- **External systems** can subscribe to events for notifications

This model is cleaner for human-in-the-loop because state transitions are explicit events rather than implicit control flow.

## Implementation Checklist

1. **Configure storage backend** (PostgreSQL for production)
2. **Define `suspendSchema`** - what context surfaces to human reviewer
3. **Define `resumeSchema`** - validate human input on resume
4. **Build resume trigger** - API endpoint or UI action
5. **Handle edge cases** - abandoned workflows, failed resumes, timeouts

## Open Questions

1. **Storage backend**: PostgreSQL vs LibSQL for our deployment?
2. **Resume mechanism**: API endpoint, UI component, or event subscription?
3. **Suspend payload design**: What information do human reviewers need?
4. **Workflow lifecycle**: How to handle abandoned/expired suspended workflows?
