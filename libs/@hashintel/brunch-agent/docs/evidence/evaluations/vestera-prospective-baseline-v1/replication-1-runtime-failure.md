# Prospective baseline v1 — replication 1 runtime failure

- Evidence recorded at: `2026-08-31T10:49:43Z`
- Source commit: `b738aa1be1a62a9f9cdde89ced78558f04293a77`
- Interviewer configuration: frozen v1 default, `claude-sonnet-4-5`
- Simulated expert configuration: frozen v1 default, `claude-sonnet-4-5`
- Instrument manifest paths were clean before dispatch.
- Command invocation: `yarn workspace @apps/brunch-agent runbook:elicit`
- Disposition: invalid replication; do not replace.

The opening interviewer dispatch completed far enough for the runner to call the simulated expert. The Anthropic response contained no text, and the runner threw before persisting its normal run record:

```text
file:///Users/lunelson/.herdr/worktrees/hash/bravo/apps/brunch-agent/src/runbook-elicitation-run.ts:237
    throw new Error("The simulated expert returned no text");
          ^

Error: The simulated expert returned no text
    at askExpert (file:///Users/lunelson/.herdr/worktrees/hash/bravo/apps/brunch-agent/src/runbook-elicitation-run.ts:237:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async file:///Users/lunelson/.herdr/worktrees/hash/bravo/apps/brunch-agent/src/runbook-elicitation-run.ts:333:25

Node.js v22.21.1
```

No normal `<run-id>.json`, transcript, or recovered IR was written. This is itself a protocol/instrument finding: the protocol says invalid runs are retained, but the frozen runner does not persist failures that occur while obtaining a non-empty simulated-expert response. Because the first paid invocation occurred, it remains replication 1 and will not be replaced. It cannot receive omniscient or cold IR grading; the campaign adjudication must include it in validity and gate rates.
