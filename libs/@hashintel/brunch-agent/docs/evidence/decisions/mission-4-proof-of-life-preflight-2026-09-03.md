# Mission 4 proof-of-life model and cost preflight

Date: 2026-09-03

Status: **non-billable preflight complete; freeze and paid authorization pending.** No model invocation was made while gathering this evidence, and no secret value was printed or retained.

## Credential and catalog availability

The local environment reports non-empty `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `OPENROUTER_API_KEY` variables. Only presence was inspected.

`pi --list-models` resolves all selected direct-provider catalog entries:

| Role | Exact requested entry | Context | Maximum output | Thinking |
| --- | --- | ---: | ---: | --- |
| Elicitor | `anthropic/claude-sonnet-4-6` | 1M | 128K | yes |
| Persona | `openai/gpt-5.6-sol` | 272K | 128K | yes |
| Adjudicator | `anthropic/claude-opus-4-6` | 1M | 128K | yes |

This proves local catalog and credential presence, not a successful paid invocation. No fallback or router substitution is authorized. Each retained run must record the requested and provider-reported model ids; a mismatch is technical invalidity and stops or consumes the slot's sole replacement under the protocol.

## Published prices

Official sources inspected on 2026-09-03:

- Anthropic, [Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing): Claude Sonnet 4.6 is $3 per million base input tokens and $15 per million output tokens; Claude Opus 4.6 is $5 per million base input tokens and $25 per million output tokens. Default global inference pricing is assumed; US-only inference would add 10% and is not selected.
- OpenAI, [API pricing](https://developers.openai.com/api/docs/pricing): GPT-5.6 Sol short-context standard pricing is $4 per million input tokens and $20 per million output tokens. The selected persona budget stays far below the listed long-context threshold.

Prompt-cache discounts are not assumed. Tool/system overhead and reasoning tokens are included in observed provider usage where reported and charged according to the provider response.

## Planning estimate

The estimate is deliberately conservative because exact usage is observable only after execution.

| Role | Normal planning tokens | Normal cost | Worst-case planning tokens | Worst-case cost |
| --- | --- | ---: | --- | ---: |
| Sonnet elicitor | 250k input, 15k output | $0.98 | 500k input, 30k output | $1.95 |
| GPT-5.6 persona | 150k input, 30k output | $1.20 | 400k input, 80k output | $3.20 |
| Opus adjudicator | 120k input, 15k output | $0.98 | 300k input, 40k output | $2.50 |
| **Total** |  | **$3.16** |  | **$7.65** |

The normal estimate covers five successful conversation attempts, about 14 visible Brunch submissions, about 12 persona continuations, and five adjudications. The worst-case estimate covers the accepted logical ceiling of 10 attempts, 32 Brunch submissions, 28 persona continuations, and 10 adjudications. Internal Sonnet tool continuations are included in the token allowances rather than counted as visible submissions.

A proposed hard currency ceiling is **$10 USD** for the whole Mission 4 proof-of-life campaign, including replacements and adjudications. Record provider-reported usage after each settled attempt and adjudication. Stop before admitting the next paid action when cumulative reported cost reaches $10 or when the remaining allowance cannot cover that action under the worst observed same-role action cost. A single provider response can overshoot an estimate, so the logical ceilings and serial execution order remain the primary preventive bounds.

## Remaining gates

Before the first paid call:

1. Commit the final instrument content and machine-readable hash manifest.
2. Pass the full focused package build/type/lint/unit suite and immutable Mission 3 comparison at that commit.
3. Obtain explicit owner acceptance of the freeze manifest and the $10 USD currency ceiling.

This document is evidence for those decisions; it does not perform them.
