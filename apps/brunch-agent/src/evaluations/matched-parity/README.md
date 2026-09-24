# Matched Petrinaut assistant evaluation

This harness sends the same prompts through three separately identified product arms, one arm at a time in isolated fresh browser contexts:

- **S** — native Stock.
- **F** — Stock over Flue (`VITE_BRUNCH_EVALUATION_MODE=F`).
- **I** — integrated canonical Brunch (`VITE_BRUNCH_EVALUATION_MODE=I`).

F/I use the Brunch panel and exact build-time override shown above. S uses the native Stock assistant and removes the evaluation override. Every arm has its own uppercase artifact directory, fresh browser context, document, local history, and conversation identity. The harness records evidence for human review and mechanical presence checks; it does not assign semantic quality scores.

The first scenario is the exact empty-net **Surprise me** prompt. The second is a bounded queue construction requiring title, executable transition code, a saved scenario, a saved metric, a place visualizer, diagnostics, and layout. Provider, model, `medium` reasoning, prompts, and scenario order remain matched.

## Dry run (default)

A dry run resolves and compares all settings, prints the serial six-run plan, USD allowance, mode overrides, and output location, and starts no browser, service, provider, or inference process:

```bash
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts
```

The command refuses a provider/model mismatch, any Brunch reasoning value other than `medium`, or a nonpositive budget before launch.

## Paid run under the standing allowance

Dry-run remains the default. Paid execution requires an operator-owned OpenAI credential, but no recurring authorization token. The default matched-set allowance is USD 50; set `MATCHED_PARITY_BUDGET_USD` or `--budget-usd` to another positive amount. Arms run serially and each turn is bounded to ten minutes by default. The harness does not retry an indeterminate or timed-out turn.

```bash
OPENAI_API_KEY='<operator-owned-key>' \
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_BUDGET_USD=50 \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts --execute-paid
```

Use unused `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` values if the defaults are occupied. `MATCHED_PARITY_MAX_TURN_MS` may lower the per-turn bound but must be a positive integer.

Provider-reported catalogue cost is recorded as observed spend when present; it is not an invoice. Missing cost stays `null`/`unknown`, never zero. Because the next request's cost cannot be known in advance, the harness emits a deterministic warning before initial launch and each continuation, showing known observed spend, unknown-cost arm count, and remaining known allowance. It warns rather than silently treating unknown cost as affordable.

## Resume completed arms

Default execution is always fresh. Add `--resume-completed` with the same output root to retain complete new-format arms. A retained arm is reused only when its schema, exact uppercase arm and mode, complete artifact, raw document, diagnostics, raw transcript, readable transcript, exact scenario, arm configuration, and provider/model/reasoning settings all match. A partial or mismatched arm is refused; a genuinely missing arm runs normally.

```bash
OPENAI_API_KEY='<operator-owned-key>' \
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_BUDGET_USD=50 \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts --execute-paid --resume-completed
```

Prior complete `stock`/`brunch` artifacts remain readable historical evidence and can be reviewed alongside a new run, but they are schema-v1 input only: resume never relabels or reuses them as S/F/I. The console, `run.json`, and each completed scenario comparison identify every new arm as `reused` or `executed`.

## Artifacts

The command above writes `/tmp/petrinaut-matched-parity-441799f/`:

- `run.json` — resolved three-arm configuration, provider/model/reasoning, timeout, budget, known observed spend, unknown-cost count, and exact ordered scenarios.
- `<scenario>/<S|F|I>/artifact.json` — schema, arm/mode identity, elapsed wall time, model-step count, provider-reported spend when available, tool calls, final title/net, and diagnostics.
- `<scenario>/<arm>/document.json` — exact retained browser document, including scenarios and metrics.
- `<scenario>/<arm>/diagnostics.json` — final definition checked by Petrinaut's Node/tooling diagnostics entrypoint.
- `<scenario>/<arm>/raw-transcript.json` and `transcript.txt` — complete native transcript data and a readable rendering.
- `<scenario>/<F|I>/canonical-flue/` — canonical Flue snapshot, transcript, and proof trace produced by the existing persona evidence writer.
- `<scenario>/comparison.{json,md}` — all three mechanical summaries plus explicit S→F transport drag and F→I Brunch architecture drag, with no semantic score.
- `manifest.json` — SHA-256 digest of every retained file.

The fresh browser contexts and uppercase arm roots prevent documents, Stock local history, and conversation identities from crossing arms. Integrated-arm Flue artifacts retain Ledger and browser call history for human review; the harness does not convert that evidence into a semantic score.
