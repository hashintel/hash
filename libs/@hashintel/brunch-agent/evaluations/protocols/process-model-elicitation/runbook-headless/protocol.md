# Runbook headless drive — Mission 3

Restores the useful condition-5 drive loop (`createFlueClient` → `send` →
`wait` → `history()`) against the production `ChatAgent`. It does not restore
the SDCPN elicitor, `brunch_ask`, sweep, fold, or completion accounting.

## Command

From the repository root, with `ANTHROPIC_API_KEY` set:

```sh
yarn workspace @apps/brunch-agent runbook:headless
```

The interviewer is the mounted `ChatAgent`. The expert is a second model that
sees only
[`situation-pack.md`](../../../cases/process-model-elicitation/baseline/situation-pack.md).
The interviewer never sees that pack. Expert replies are ordinary user
messages.

## Environment

| Variable | Role |
| --- | --- |
| `ANTHROPIC_API_KEY` | both models unless a stand-in is set |
| `BRUNCH_CHAT_MODEL` | interviewer; script default `claude-sonnet-4-5` |
| `BRUNCH_RUNBOOK_EXPERT_MODEL` | expert; default `claude-sonnet-4-5` |
| `BRUNCH_RUNBOOK_HARD_STOP` | interview turns before construct; default 8 |
| `BRUNCH_RUNBOOK_LATENCY_STOP_MS` | abort if one interviewer turn exceeds this; default 180000 |
| `BRUNCH_RUNBOOK_OUTPUT_DIR` | artifact directory |
| `BRUNCH_RUNBOOK_ANTHROPIC_MODULE` | test-only expert client |

## Artifacts

Written under
`docs/evidence/evaluations/process-model-elicitation/runbook-headless/`
unless the output directory is overridden. The hermetic faux throughline is
`apps/brunch-agent/test/runbook-headless.test.ts`; it does not write here.
