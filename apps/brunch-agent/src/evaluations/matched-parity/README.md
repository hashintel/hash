# Matched Petrinaut assistant evaluation

This harness sends the same prompt through the real Petrinaut AI panel to Stock and canonical Brunch, one arm at a time in isolated fresh browser contexts. It records evidence for human review and mechanical presence checks; it does not assign semantic quality scores.

The first scenario is the exact empty-net **Surprise me** prompt. The second is a bounded queue construction requiring title, executable transition code, a saved scenario, a saved metric, a place visualizer, diagnostics, and layout.

## Dry run (default)

A dry run resolves and compares model settings, prints the serial plan and output location, and starts no browser, service, provider, or inference process:

```bash
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts
```

The command refuses a provider/model mismatch or any Brunch reasoning value other than `medium` before launch.

## Authorized paid run

Only run this with an operator-owned OpenAI credential and explicit authorization. Stock and Brunch run serially; each turn is bounded to ten minutes by default. The harness does not retry an indeterminate or timed-out turn.

```bash
OPENAI_API_KEY='<operator-owned-key>' \
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_PAID_AUTHORIZATION=I_AUTHORIZE_MATCHED_PAID_INFERENCE \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts --execute-paid
```

Use unused `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` values if the defaults are occupied. `MATCHED_PARITY_MAX_TURN_MS` may lower the per-turn bound but must be a positive integer.

## Resume completed arms

Default execution is always fresh. After correcting the external timeout issue, resume the retained r3 output with this exact command. A retained arm is reused only when its complete artifact, raw document, diagnostics, raw transcript, readable transcript, exact scenario, and provider/model/reasoning settings all match. A partial or mismatched arm is refused; a genuinely missing arm runs normally.

```bash
OPENAI_API_KEY='<operator-owned-key>' \
PETRINAUT_AI_MODEL=gpt-5.5 \
BRUNCH_CHAT_MODEL=openai/gpt-5.5 \
BRUNCH_CHAT_THINKING=medium \
MATCHED_PARITY_PAID_AUTHORIZATION=I_AUTHORIZE_MATCHED_PAID_INFERENCE \
MATCHED_PARITY_OUTPUT_ROOT=/tmp/petrinaut-matched-parity-441799f-r3 \
node --experimental-strip-types apps/brunch-agent/src/evaluations/matched-parity/run.ts --execute-paid --resume-completed
```

The console, `run.json`, and each completed scenario comparison identify every arm as `reused` or `executed`.

## Artifacts

The command above writes `/tmp/petrinaut-matched-parity-441799f/`:

- `run.json` — resolved provider, model, reasoning, timeout, and exact ordered scenarios.
- `<scenario>/<arm>/artifact.json` — elapsed wall time, model-step count, tool calls, final title/net, and diagnostics.
- `<scenario>/<arm>/document.json` — exact retained browser document, including scenarios and metrics.
- `<scenario>/<arm>/diagnostics.json` — final definition checked by Petrinaut's Node/tooling diagnostics entrypoint.
- `<scenario>/<arm>/raw-transcript.json` and `transcript.txt` — complete native transcript data and a readable rendering.
- `<scenario>/brunch/canonical-flue/` — canonical Flue snapshot, transcript, and proof trace produced by the existing persona evidence writer.
- `<scenario>/comparison.{json,md}` — compact mechanical completeness and count comparison, with no semantic score.
- `manifest.json` — SHA-256 digest of every retained file.

The browser contexts are new for every arm, so documents and Stock local history cannot cross-contaminate runs. Ledger and provenance are deliberately outside this parity harness.
