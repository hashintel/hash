Phase 1 Complete!
I've successfully implemented the plan compiler infrastructure. Here's a summary:
Files Created
| File                                   | Purpose                              | Lines |
| -------------------------------------- | ------------------------------------ | ----- |
| src/mastra/tools/mock-agent.ts         | Deterministic mock agent for testing | ~350  |
| src/mastra/tools/plan-compiler.ts      | Compiles PlanSpec → Mastra Workflow  | ~540  |
| src/mastra/tools/plan-compiler.test.ts | Integration tests                    | ~730  |
Test Results
All 20 tests pass:
Compilation Tests (5):
- ✓ Compiles minimal valid plan
- ✓ Compiles linear plan with sequential dependencies
- ✓ Compiles plan with parallel steps
- ✓ Compiles diamond-shaped plan
- ✓ Compiles plan with mixed parallelism
Topology Analysis Tests (7):
- ✓ Correctly identifies entry points
- ✓ Correctly identifies exit points
- ✓ Correctly computes parallel groups for parallel plan
- ✓ Correctly computes parallel groups for diamond plan
- ✓ Correctly computes topological order for linear plan
- ✓ Correctly identifies critical path
- ✓ Correctly identifies parallelizable steps within groups
Execution Tests (4):
- ✓ Executes minimal plan and returns result
- ✓ Executes linear plan in correct order
- ✓ Executes parallel plan respecting dependencies
- ✓ Executes diamond plan respecting dependencies
Streaming Events Tests (4):
- ✓ Emits plan-start event
- ✓ Emits step-start and step-complete events
- ✓ Emits progress events
- ✓ Emits plan-complete event
Key Implementation Details
1. MockAgent - Returns deterministic responses based on step type, includes traceable __mock metadata
2. TopologyAnalyzer integration - Uses your existing analyzer for parallel groups and execution order
3. Streaming events - Six data-plan-* event types flow through writer.custom()
4. Fail-fast error handling - Steps throw on error, workflow stops
