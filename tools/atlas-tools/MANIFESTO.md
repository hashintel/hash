# Relation Judge Manifesto

This file is the working memory for the relation-judge pilot. It records the intent recovered from the repository, the invariants that must survive implementation changes, the next work to perform, and the mistakes that must not recur.

## Purpose

The relation judge assigns a type-level map-placement verdict to every relation card:

- `coincident`: one referent; render one dot.
- `proximal`: distinct entities whose typical instances should be near.
- `overlay`: a genuine relation that should not move either endpoint.
- `unclear`: the card or relation population cannot support a safe type-level ruling.

The pilot exists to qualify judges and decide which prompt shells, framings, and effort settings are stable enough for the complete production grid. It is not an informal model bake-off.

## Recovered source of truth

Commit `16b87bd4b1` defined the intended nine-model roster:

1. `anthropic/claude-opus-4.8`
2. `anthropic/claude-sonnet-5`
3. `openai/gpt-5.6-sol-pro`
4. `openai/gpt-5.6-luna`
5. `google/gemini-3.5-flash`
6. `z-ai/glm-5.2`
7. `nvidia/nemotron-3-ultra-550b-a55b`
8. `deepseek/deepseek-v4-pro`
9. `mistralai/mistral-small-2603`

Commit `fa36eaf311` removed that roster while refactoring the executor. The roster should have been migrated into a checked-in runtime configuration instead. It is now restored in `config/eval/pilot.yaml`, with the ninth operational slot changed to `inception/mercury-2`: Mistral failed the retention requirement and Grok 4.5 was unavailable in-region. OpenRouter's ZDR inventory lists Mercury 2's single `Inception` endpoint with `reasoning_effort`, `temperature`, and `max_tokens` support.

For the current schema, the persisted `family_id` is derived from the exact `model` ID. It is not authored separately and is not a dated nickname. Provider and OpenRouter region are pinned independently and contribute to vote and request identity.

## Prompt and execution invariants

- The prompt pack lives in `atlas_tools/relation/eval/prompt.py`, not in YAML.
- `S1`-`S3` select the three system-prompt shells.
- `F1`-`F3` select the three live-card framings.
- Every request contains one system prompt, the fixed source-qualified few-shot turns, and one live relation card.
- Few-shot relation IDs remain source-qualified and are excluded from pilot and production targets.
- The response contract is the ordered JSON object `reason`, then `verdict`.
- Verdict parsing case-folds the verdict and validates the last JSON object.
- One malformed completion gets one conversational repair turn. A second malformed completion becomes `ABSTAIN`.
- A valid but semantically wrong answer is evidence and is never retried.
- Retryable transport/provider failures receive the configured visible physical-attempt budget; routing, response-envelope, and accounting failures remain terminal. None are abstentions.

## Routing and privacy invariants

Every physical OpenRouter request must:

- pin exactly one provider slug;
- disable provider fallbacks;
- require every sent parameter to be supported;
- require `data_collection: deny`;
- require ZDR;
- disable the OpenRouter response cache;
- disable SDK retries so every retry is controlled and durably visible to the executor;
- request router metadata;
- record the native result, route, usage, cost, and timestamps.

OpenRouter's detailed `attempts` array is optional even when metadata is enabled.
The executor therefore requires the public model ID, requested model, direct first
attempt, exactly one selected endpoint, and pinned provider name. When the detailed
array is present, it must agree and contain exactly one HTTP-200 attempt. A
provider-internal deployment model name is evidence about the selected endpoint,
not a replacement for the public model identity.

`provider_slug` is a provider identifier from `/api/v1/providers` and is the value sent through `provider.only`. It is not an endpoint tag: suffixes such as `/europe`, `/eu`, and `/fp8` are endpoint metadata and are invalid in `provider.only`. `provider_name` is the exact name expected in returned router metadata. The executor fails closed if the actual response disagrees.

`openrouter_region` selects an API boundary rather than pretending endpoint tags are routable providers. `global` calls `https://openrouter.ai/api/v1`; `eu` calls `https://eu.openrouter.ai/api/v1` and therefore requires enterprise EU in-region routing on the account. A live preflight confirmed that this account does not have EU routing enabled, so the current roster uses `global` throughout. Claude uses Amazon Bedrock after Google Vertex rejected the exact global privacy-pinned request; OpenAI uses Azure.

Output limits are route capabilities, not a universal OpenRouter field. `output_token_limit.parameter` explicitly records whether the pinned endpoint supports `max_tokens` or `max_completion_tokens`. The transport sends only the selected field so `require_parameters: true` remains meaningful. Null sampling parameters are converted to the SDK's native `UNSET` value and omitted rather than serialized as unsupported JSON nulls.

## Current pilot scale

With nine judges, nine bundles, 144 sampled non-holdouts, six holdouts, one repeat, and one higher-effort arm per judge:

- baseline grid: `9 × 9 × 150 = 12,150` logical votes;
- repeat arm: `9 × 144 = 1,296` logical votes;
- effort arm: `9 × 150 = 1,350` logical votes;
- total: `14,796` logical votes;
- worst case with one parser repair per vote: `29,592` physical requests.

The first accepted Opus call used 12,956 prompt tokens and cost `$0.066505`, so
the old 7,500-token planning estimate is not credible. The pilot config currently
has no `max_cost_usd`; that is an explicit operational risk, not a default budget.
Do not infer complete-pilot cost from one family, but do not launch blindly either:
measure the remaining routes and set an intentional cap when one is available.

## Before launching the pilot

1. Validate `config/eval/pilot.yaml` with `load_run_config`.
2. Query OpenRouter's JSON model, provider, endpoint, and ZDR-preview APIs and verify every configured model, provider slug/name, region, supported request parameter, and endpoint status.
3. Add or run a one-card preflight for every judge route with the exact production privacy and request settings. Public endpoint metadata does not prove that EU routing is enabled for the account or that its account-level policies permit the route.
4. Confirm each preflight returns exactly one HTTP-200 router attempt with the pinned model and provider.
5. Record current input/output/reasoning/cache prices and calculate the pilot's expected and worst-case cost.
6. Set `max_cost_usd` deliberately.
7. Run a tiny deterministic smoke slice into a disposable output directory.
8. Only then run the 144-card pilot.
9. Analyze the completed handoff and inspect all data-health, routing, abstention, and cost findings before authorizing the full grid.

A dedicated `relation preflight` command would make steps 2-4 explicit and cheap. It should validate routes without creating a pilot handoff or pretending that a partial pilot is statistically meaningful.

## Implemented execution architecture

- `contract.py` owns schema-v3 pilot/full configs and deterministic round-robin vote plans.
- `inputs.py` verifies cards and derives the pilot slice; `authorization.py` binds full mode to the analyzed corpus, exact judge request pins, admissions, efforts, and reviewed call counts.
- `transport.py` owns native OpenRouter request and response contracts.
- `journal.py` owns durable append and per-attempt in-flight markers; `resume.py` owns semantic journal validation.
- `vote.py` executes one physical/logical vote; `executor.py` owns Trio workers, channels, ramping, draining, and ordered commits.
- `artifacts.py` owns run state and manifests; `run.py` is a small composition facade.

The executor starts at `concurrency.initial`, doubles its worker limit after a
current-limit cohort of successful logical votes, and caps at
`concurrency.maximum`. Workers steal from a shared bounded channel and each owns
its OpenRouter client. A terminal failure atomically closes the physical-request
boundary. Calls with an existing durable in-flight marker finish and journal;
peer workers cannot start a repair or retry afterward. Attempts may be recorded
in completion order; votes remain a deterministic plan prefix. Resume reuses
successful attempts beyond that prefix.

Transient retries are executor-owned because the SDK retries only a narrower
class of failures and cannot journal each attempt. Initial and malformed-repair
requests each receive `transient_retries.maximum_attempts` total physical
attempts. Every failed attempt is durable before a retry. Backoff is deterministic
and interruptible by a peer terminal failure; a provider `Retry-After` value may
extend it. HTTP and embedded provider statuses are stored separately, which
covers HTTP-200 envelopes carrying an upstream 502.
Permanent 4xx, route validation, completion-envelope, and accounting failures do
not retry. If a configured cost cap encounters an attempt with unknown billed
cost, the next physical request is denied rather than weakening the cap.

One `relation evaluate` command handles both phases. The config discriminates
`mode: pilot` from `mode: full`; full mode binds the schema-v3 analysis
`decisions` artifact. Those decisions hash every pilot judge request and record the
exact concat card and manifest hashes, so a changed route or card population cannot
inherit an unrelated qualification result.

## Next implementation work

### Required around the paid pilot

- Add a route preflight command that exercises one minimal judgement per configured judge and writes a small audit artifact.
- Add a cost-estimation command using current OpenRouter pricing metadata and the exact task count.
- The checked-in pilot config now compares `minimal` against `high` for every judge. This is an explicit operator decision; the recovered historical candidates used `low`.

### Schema cleanup after the pilot is unblocked

- Stop asking operators to duplicate `provider_name` if OpenRouter's provider API can supply and snapshot the slug-to-name mapping during preflight.
- Separate reusable judge roster data from pilot sampling and operational cost-cap settings.
- Keep API-specific distinctions at the transport boundary while preserving enough route capability data to make request hashes and manifests auditable.

### Analysis and production follow-through

- Confirm the pilot report reproduces byte-identically.
- Treat undefined bootstrap intervals as undefined; decisions fail closed.
- Keep abstentions separate from verdict classes in nominations and posteriors.
- Run the full grid only from validated pilot decisions, admitted bundles, passed judges, and selected effort settings.
- Re-check projected full-grid cost against current measured per-family cost before dispatch.

## What must be done better

### Inspect history before redesigning

The repository already contained the nine intended judges. Replacing them with invented examples was avoidable. Before changing an existing subsystem:

1. inspect the current diff;
2. inspect the relevant file history;
3. search deleted and renamed paths;
4. write down recovered invariants;
5. only then redesign.

### Do not invent domain vocabulary

A placeholder such as `judge-a-2026-07-13` became documentation even though it had no domain meaning. Names and IDs must correspond to real identities or be derived from structured data. “Family” means one judge model in the factorial analysis; it is not an OpenRouter concept.

### Validate external contracts before documenting them

The original executor hardcoded `max_completion_tokens`, while most recovered routes advertise `max_tokens`. A configuration is not finished merely because Pydantic accepts it. Validate the exact endpoint capabilities and the request that will be sent.

### Keep atomicity proportional

Durability is essential for paid-request journals and unknown in-flight billing states. It does not justify turning every ordinary overwrite into a publication protocol. Apply atomicity where interruption creates an unrecoverable or falsely valid state; prefer simple overwrites where regeneration is intentional and validation already fails safely.

### Prefer decomposition over suppression

No unexplained `noqa`, no complexity suppression, and no positional state tuples. If a function carries too much state, introduce a named domain type or split the responsibility. The former 2,500-line executor facade was evidence of misplaced boundaries; execution is now separated into focused modules near the repository's roughly 500-line target.

### Make the operational path visible

The system prompt, task matrix, repair behavior, privacy policy, task count, and cost exposure must be obvious from the README and checked-in configuration. Operators should not need to reconstruct the executor from source before a paid run.

## Working rule

Do not run a paid matrix because the code appears complete. Run it only when the checked-in roster, prompt hash, route pins, privacy constraints, endpoint capabilities, task count, cost bound, and resume semantics have each been independently verified.
