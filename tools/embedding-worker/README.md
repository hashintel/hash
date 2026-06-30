# Bulk Embedding Worker

Generates embeddings for ~986K HASH entities (~6.17M vectors) via OpenRouter,
mirroring the logic in `apps/hash-ai-worker-ts`.

## Hetzner box setup

### Postgres

```bash
docker compose up -d
docker compose exec postgres pg_isready

# Restore the dump
gzip -cd supply-chain-ontology-v1.restore-as-postgres.sql.gz \
  | docker compose exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

### Running

Requires [uv](https://docs.astral.sh/uv/). No venv setup needed; `uv run`
handles dependencies automatically.

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/graph"
export OPENROUTER_API_KEY="sk-or-..."

# 1. Build embedding inputs from Postgres -> inputs.parquet
uv run embed.py prepare

# 2. Generate embeddings (adaptive concurrency: starts at 4, ramps to 64)
uv run embed.py run
uv run embed.py run -n 8 -m 32    # or tune manually

# 3. Check progress (from another terminal)
uv run embed.py status

# 4. If interrupted, just re-run. Completed checkpoints are skipped.
uv run embed.py run

# 5. Export replayable SQL dumps
uv run embed.py export -o ./dumps
```

## Output

Two gzipped COPY-format SQL files:

| File                            | Contents                                               | Rows   |
| ------------------------------- | ------------------------------------------------------ | ------ |
| `embeddings-entity-only.sql.gz` | One combined embedding per entity (`property IS NULL`) | ~986K  |
| `embeddings-all.sql.gz`         | Per-property + combined embeddings                     | ~6.17M |

Replay on the target database:

```bash
gzip -cd embeddings-entity-only.sql.gz | psql $TARGET_DATABASE_URL
```

## How it works

1. **prepare** queries Postgres for entities with non-empty properties, formats
   embedding inputs (matching the TS worker: `"Title: value"` per property,
   newline-joined combined), and writes `inputs.parquet`.

2. **run** reads `inputs.parquet`, batches inputs respecting the API limits
   (2048 inputs and 300K tokens per request), sends concurrent calls to
   OpenRouter, and checkpoints results to `checkpoints/*.parquet`.
   Concurrency adapts automatically: ramps up while throughput improves,
   backs off on 429s or throughput dips (AIMD).

3. **export** joins `inputs.parquet` with `checkpoints/*.parquet` via DuckDB
   and streams COPY-format SQL through gzip.

## Cost estimate

~6.17M inputs, ~50-100 tokens average, at $0.13/M tokens: roughly $10-15.
