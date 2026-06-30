#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "asyncpg>=0.30",
#     "httpx[http2]>=0.28",
#     "tqdm>=4.66",
#     "pyarrow>=19",
#     "duckdb>=1.3",
#     "numpy>=2.0",
# ]
# ///
"""
Bulk HASH entity embedding generation via OpenRouter.

Mirrors the embedding logic from apps/hash-ai-worker-ts:
  - Per property: "Title: value"
  - Combined: all property lines joined by newlines
  - Model: text-embedding-3-large (3072 dims)

Usage:
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/graph"
    export OPENROUTER_API_KEY="sk-or-..."

    uv run embed.py prepare
    uv run embed.py run
    uv run embed.py status
    uv run embed.py export -o ./dumps
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import array
import ctypes
import gc
import struct
from datetime import datetime, timezone

import asyncpg
import duckdb
import httpx
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from tqdm import tqdm

def _release_memory():
    """Force Python GC and return freed arenas to the OS."""
    gc.collect()
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENROUTER_URL = "https://openrouter.ai/api/v1/embeddings"
MODEL = "openai/text-embedding-3-large"

# API limits per the docs:
#   max 2048 inputs per request
#   max 8192 tokens per input
#   max 300,000 tokens summed across all inputs in a request
# 2048 * 3072-dim = ~80MB JSON response, way too large.
# 128 inputs -> ~5MB response, manageable.
MAX_INPUTS = 128
MAX_TOTAL_TOKENS = 100_000
CHARS_PER_TOKEN = 3  # conservative overcount

MAX_RETRIES = 8
CHECKPOINT_EVERY = 2_000  # flush to parquet every N embeddings

# 8192 token per-input limit. Structured data with numbers/URLs tokenizes
# at ~2-3 chars/token, so 16K chars keeps nearly everything intact.
MAX_INPUT_CHARS = 16_000
INPUTS_FILE = "inputs.parquet"
CHECKPOINT_DIR = "checkpoints"

_CHECKPOINT_SCHEMA = pa.schema(
    [("row_id", pa.int32()), ("embedding", pa.list_(pa.float32()))]
)

# ---------------------------------------------------------------------------
# Postgres binary COPY format
# ---------------------------------------------------------------------------

_PG_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)
_PGCOPY_HEADER = b"PGCOPY\n\xff\r\n\0" + struct.pack("!II", 0, 0)
_PGCOPY_TRAILER = struct.pack("!h", -1)

# Pre-packed constants for row writing
_BIN_FIELD_COUNT = struct.pack("!h", 7)
_BIN_NULL = struct.pack("!i", -1)
_BIN_UUID_LEN = struct.pack("!i", 16)
_BIN_TS_LEN = struct.pack("!i", 8)
_BIN_VEC_DATA_LEN = struct.pack("!i", 2 + 2 + 3072 * 4)
_BIN_VEC_DIMS = struct.pack("!hh", 3072, 0)


def _ts_to_pg_us(ts_str: str) -> int:
    """Timestamp string to Postgres binary (microseconds since 2000-01-01 UTC)."""
    dt = datetime.fromisoformat(ts_str)
    delta = dt - _PG_EPOCH
    return delta.days * 86_400_000_000 + delta.seconds * 1_000_000 + delta.microseconds


def _write_binary_row(f, web_id, entity_uuid, prop, emb, dt_str, tt_str):
    """Write one row in Postgres binary COPY format."""
    f.write(_BIN_FIELD_COUNT)

    # UUIDs (16 bytes each)
    f.write(_BIN_UUID_LEN)
    f.write(bytes.fromhex(web_id.replace("-", "")))
    f.write(_BIN_UUID_LEN)
    f.write(bytes.fromhex(entity_uuid.replace("-", "")))

    # draft_id (NULL)
    f.write(_BIN_NULL)

    # property (TEXT or NULL)
    if prop is None:
        f.write(_BIN_NULL)
    else:
        prop_b = prop.encode("utf-8")
        f.write(struct.pack("!i", len(prop_b)))
        f.write(prop_b)

    # embedding (pgvector binary: int16 dims + int16 unused + float32[])
    f.write(_BIN_VEC_DATA_LEN)
    f.write(_BIN_VEC_DIMS)
    a = array.array("f", emb)
    if sys.byteorder == "little":
        a.byteswap()
    f.write(a.tobytes())

    # timestamps (int64 microseconds since PG epoch)
    f.write(_BIN_TS_LEN)
    f.write(struct.pack("!q", _ts_to_pg_us(dt_str)))
    f.write(_BIN_TS_LEN)
    f.write(struct.pack("!q", _ts_to_pg_us(tt_str)))


# ---------------------------------------------------------------------------
# Adaptive concurrency (AIMD)
# ---------------------------------------------------------------------------


class Pacer:
    """Ramps concurrency up while throughput improves, halves on 429 or dip."""

    def __init__(self, initial: int = 4, max_c: int = 64):
        self.target = initial
        self.max_c = max_c
        self._active = 0
        self._cond = asyncio.Condition()

    @asynccontextmanager
    async def slot(self):
        async with self._cond:
            await self._cond.wait_for(lambda: self._active < self.target)
            self._active += 1
        try:
            yield
        finally:
            async with self._cond:
                self._active -= 1
                self._cond.notify()

    async def set_target(self, n: int):
        async with self._cond:
            self.target = max(1, min(self.max_c, n))
            self._cond.notify_all()

    @property
    def active(self):
        return self._active


# ---------------------------------------------------------------------------
# Embedding input formatting (mirrors TS worker)
# ---------------------------------------------------------------------------


def _build_entity_inputs(
    properties: dict, titles: dict[str, str]
) -> list[tuple[str | None, str]]:
    """Build embedding inputs for one entity.

    Returns [(property_base_url | None, input_text), ...].
    Last element is the combined embedding (property=None).
    Empty list if no embeddable properties.
    """
    sorted_keys = sorted(properties.keys())
    items: list[tuple[str, str]] = []
    combined = ""

    for key in sorted_keys:
        title = titles.get(key)
        if title is None:
            continue
        val = properties[key]
        text = f"{title}: {val}" if isinstance(val, str) else f"{title}: {json.dumps(val)}"
        combined += f"{text}\n"
        items.append((key, text))

    if not items:
        return []
    return [*items, (None, combined)]


def _vec_to_pg(emb) -> str:
    if hasattr(emb, 'tolist'):
        emb = emb.tolist()
    return "[" + ",".join(str(v) for v in emb) + "]"


# ---------------------------------------------------------------------------
# Batching
# ---------------------------------------------------------------------------


def _make_batches(
    row_ids: list[int], texts: list[str]
) -> list[tuple[list[int], list[str]]]:
    """Group into API-call-sized batches respecting both input count and token limits."""
    batches: list[tuple[list[int], list[str]]] = []
    cur_ids: list[int] = []
    cur_texts: list[str] = []
    cur_tokens = 0

    for rid, text in zip(row_ids, texts):
        # Truncate inputs that would exceed the per-input token limit
        if len(text) > MAX_INPUT_CHARS:
            text = text[:MAX_INPUT_CHARS]
        est = len(text) // CHARS_PER_TOKEN + 1
        if cur_ids and (len(cur_ids) >= MAX_INPUTS or cur_tokens + est > MAX_TOTAL_TOKENS):
            batches.append((cur_ids, cur_texts))
            cur_ids, cur_texts, cur_tokens = [], [], 0
        cur_ids.append(rid)
        cur_texts.append(text)
        cur_tokens += est

    if cur_ids:
        batches.append((cur_ids, cur_texts))
    return batches


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


async def _call_api(
    client: httpx.AsyncClient,
    api_key: str,
    texts: list[str],
    pacer: Pacer | None = None,
) -> list[list[float]]:
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.post(
                OPENROUTER_URL,
                json={"model": MODEL, "input": texts, "encoding_format": "float"},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=180.0,
            )
            if resp.status_code == 429:
                if pacer:
                    await pacer.set_target(max(1, pacer.target // 2))
                wait = float(resp.headers.get("retry-after", 2**attempt))
                tqdm.write(f"  429 -> c={pacer.target if pacer else '?'}, wait {wait:.0f}s")
                await asyncio.sleep(wait)
                continue
            if resp.status_code >= 500:
                tqdm.write(f"  {resp.status_code}, retry {attempt+1}/{MAX_RETRIES}")
                await asyncio.sleep(2**attempt)
                continue
            resp.raise_for_status()

            try:
                data = resp.json()
            except (json.JSONDecodeError, ValueError) as exc:
                body_preview = resp.text[:200] if resp.text else "(empty)"
                tqdm.write(f"  bad JSON (attempt {attempt+1}): {body_preview}")
                await asyncio.sleep(2**attempt)
                continue

            if "data" not in data:
                err_msg = data.get("error", {})
                if isinstance(err_msg, dict):
                    err_msg = err_msg.get("message", str(data)[:200])
                tqdm.write(f"  API error (attempt {attempt+1}): {err_msg}")
                await asyncio.sleep(2**attempt)
                continue

            return [
                np.array(d["embedding"], dtype=np.float32)
                for d in sorted(data["data"], key=lambda x: x["index"])
            ]
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            tqdm.write(f"  connection error (attempt {attempt+1}): {exc}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)
            else:
                raise
    raise RuntimeError(f"API failed after {MAX_RETRIES} retries")


# ---------------------------------------------------------------------------
# Checkpoint I/O
# ---------------------------------------------------------------------------


def _load_completed(cp_dir: str) -> set[int]:
    d = Path(cp_dir)
    completed: set[int] = set()
    if not d.exists():
        return completed
    for f in sorted(d.glob("*.parquet")):
        t = pq.read_table(f, columns=["row_id"])
        completed.update(t["row_id"].to_pylist())
    return completed


def _next_cp_idx(cp_dir: str) -> int:
    d = Path(cp_dir)
    if not d.exists():
        return 0
    existing = sorted(d.glob("*.parquet"))
    return len(existing)


def _flush(cp_dir: str, idx: int, buf: list[tuple[int, np.ndarray]]):
    d = Path(cp_dir)
    d.mkdir(exist_ok=True)
    row_ids = [r for r, _ in buf]
    # Stack numpy arrays into a single 2D array, then convert to Arrow
    stacked = np.stack([e for _, e in buf])
    # Arrow fixed_size_list from contiguous numpy is zero-copy
    flat = pa.array(stacked.ravel(), type=pa.float32())
    embeddings_col = pa.FixedSizeListArray.from_arrays(flat, list_size=stacked.shape[1])
    table = pa.table(
        {
            "row_id": pa.array(row_ids, type=pa.int32()),
            "embedding": embeddings_col,
        },
    )
    pq.write_table(table, d / f"{idx:06d}.parquet", compression="zstd")
    _release_memory()


# ---------------------------------------------------------------------------
# prepare
# ---------------------------------------------------------------------------


_INPUTS_SCHEMA = pa.schema(
    [
        ("row_id", pa.int32()),
        ("web_id", pa.string()),
        ("entity_uuid", pa.string()),
        ("property", pa.string()),
        ("input_text", pa.string()),
        ("dt_start", pa.string()),
        ("tt_start", pa.string()),
    ]
)

# Flush to parquet every N inputs to bound memory
_PREPARE_FLUSH = 100_000


async def cmd_prepare(pg_url: str):
    if Path(INPUTS_FILE).exists():
        meta = pq.read_metadata(INPUTS_FILE)
        print(f"{INPUTS_FILE} exists ({meta.num_rows:,} rows), skipping")
        return

    pool = await asyncpg.create_pool(pg_url, min_size=1, max_size=2)
    try:
        async with pool.acquire() as conn:
            title_rows = await conn.fetch(
                """
                SELECT DISTINCT ON (oi.base_url)
                    oi.base_url, pt.schema->>'title' AS title
                FROM property_types pt
                JOIN ontology_ids oi ON pt.ontology_id = oi.ontology_id
                ORDER BY oi.base_url, oi.version DESC
                """
            )
            titles = {r["base_url"]: r["title"] for r in title_rows}
            print(f"loaded {len(titles)} property type titles")

            entity_count_total = await conn.fetchval(
                """
                SELECT count(*)
                FROM entity_temporal_metadata etm
                JOIN entity_editions ee ON etm.entity_edition_id = ee.entity_edition_id
                WHERE ee.properties != '{}'::jsonb
                  AND upper(etm.transaction_time) IS NULL
                  AND etm.draft_id IS NULL
                """
            )
            print(f"{entity_count_total:,} entities to process")

            # Stream with a cursor to avoid loading everything into memory
            row_id = 0
            entity_count = 0
            buf: dict[str, list] = {k: [] for k in _INPUTS_SCHEMA.names}
            writer = pq.ParquetWriter(INPUTS_FILE, _INPUTS_SCHEMA, compression="zstd")
            bar = tqdm(total=entity_count_total, desc="building inputs", unit="ent")

            try:
                async with conn.transaction():
                    async for ent in conn.cursor(
                        """
                        SELECT etm.web_id::text, etm.entity_uuid::text, ee.properties,
                               lower(etm.decision_time)::text AS dt_start,
                               lower(etm.transaction_time)::text AS tt_start
                        FROM entity_temporal_metadata etm
                        JOIN entity_editions ee
                            ON etm.entity_edition_id = ee.entity_edition_id
                        WHERE ee.properties != '{}'::jsonb
                          AND upper(etm.transaction_time) IS NULL
                          AND etm.decision_time @> now()
                          AND etm.draft_id IS NULL
                        """,
                        prefetch=5000,
                    ):
                        props = json.loads(ent["properties"])
                        inputs = _build_entity_inputs(props, titles)
                        if not inputs:
                            bar.update(1)
                            continue

                        entity_count += 1
                        for prop_key, text in inputs:
                            buf["row_id"].append(row_id)
                            buf["web_id"].append(ent["web_id"])
                            buf["entity_uuid"].append(ent["entity_uuid"])
                            buf["property"].append(prop_key)
                            buf["input_text"].append(text)
                            buf["dt_start"].append(ent["dt_start"])
                            buf["tt_start"].append(ent["tt_start"])
                            row_id += 1

                        bar.update(1)

                        if len(buf["row_id"]) >= _PREPARE_FLUSH:
                            writer.write_table(
                                pa.table(
                                    {k: pa.array(v) for k, v in buf.items()},
                                    schema=_INPUTS_SCHEMA,
                                )
                            )
                            buf = {k: [] for k in _INPUTS_SCHEMA.names}

                # Flush remaining
                if buf["row_id"]:
                    writer.write_table(
                        pa.table(
                            {k: pa.array(v) for k, v in buf.items()},
                            schema=_INPUTS_SCHEMA,
                        )
                    )
            finally:
                writer.close()
                bar.close()

            print(f"{entity_count:,} entities -> {row_id:,} inputs -> {INPUTS_FILE}")
    finally:
        await pool.close()


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------


async def cmd_run(api_key: str, initial_c: int, max_c: int):
    if not Path(INPUTS_FILE).exists():
        print(f"{INPUTS_FILE} not found, run prepare first", file=sys.stderr)
        sys.exit(1)

    # Memory-mapped read: Arrow data stays on disk, paged in on demand
    inputs = pq.read_table(INPUTS_FILE, memory_map=True, columns=["row_id", "input_text"])
    completed = _load_completed(CHECKPOINT_DIR)

    # Filter in Arrow without materializing to Python lists
    if completed:
        completed_arr = pa.array(list(completed), type=pa.int32())
        mask = pa.compute.invert(pa.compute.is_in(inputs["row_id"], value_set=completed_arr))
        remaining = inputs.filter(mask)
        del completed_arr, mask
    else:
        remaining = inputs
    del inputs

    total = len(remaining)
    if total == 0:
        print("all done")
        return

    # Count batches without materializing all texts
    num_batches = (total + MAX_INPUTS - 1) // MAX_INPUTS
    print(f"{total:,} remaining across ~{num_batches:,} API calls")

    pacer = Pacer(initial=initial_c, max_c=max_c)
    bar = tqdm(total=total, unit="emb", smoothing=0.05)
    buf: list[tuple[int, list[float]]] = []
    cp_idx = _next_cp_idx(CHECKPOINT_DIR)
    failed = 0
    stop = asyncio.Event()

    async with httpx.AsyncClient(
        http2=True,
        limits=httpx.Limits(max_connections=max_c + 10),
    ) as client:

        async def process(batch_ids: list[int], batch_texts: list[str]):
            nonlocal buf, cp_idx, failed
            async with pacer.slot():
                try:
                    embs = await _call_api(client, api_key, batch_texts, pacer)
                except Exception as exc:
                    failed += len(batch_ids)
                    tqdm.write(f"  batch failed ({len(batch_ids)}): {exc}")
                    bar.update(len(batch_ids))
                    return

                buf.extend(zip(batch_ids, embs))
                bar.update(len(batch_ids))

                if len(buf) >= CHECKPOINT_EVERY:
                    _flush(CHECKPOINT_DIR, cp_idx, buf)
                    cp_idx += 1
                    buf = []

        async def adapt():
            prev_n, prev_t, prev_tp = 0, time.monotonic(), 0.0
            while not stop.is_set():
                await asyncio.sleep(10)
                now = time.monotonic()
                dt = now - prev_t
                tp = (bar.n - prev_n) / dt if dt > 0 else 0

                if prev_tp == 0 or tp >= prev_tp * 0.7:
                    await pacer.set_target(pacer.target + 2)
                else:
                    await pacer.set_target(pacer.target - 4)

                tqdm.write(f"  c={pacer.target} active={pacer.active} {tp:.0f} emb/s")
                prev_n, prev_t, prev_tp = bar.n, now, tp

        monitor = asyncio.create_task(adapt())

        # Process batches lazily: only materialize one Arrow chunk at a time
        # and keep at most pacer.target tasks alive
        pending: set[asyncio.Task] = set()

        for record_batch in remaining.to_batches(max_chunksize=MAX_INPUTS):
            batch_ids = record_batch["row_id"].to_pylist()
            batch_texts = record_batch["input_text"].to_pylist()
            # Truncate oversized inputs
            batch_texts = [
                t[:MAX_INPUT_CHARS] if len(t) > MAX_INPUT_CHARS else t
                for t in batch_texts
            ]

            # Backpressure: wait if we have too many in-flight tasks
            while len(pending) >= max_c:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)

            task = asyncio.create_task(process(batch_ids, batch_texts))
            pending.add(task)

        # Drain remaining tasks
        if pending:
            await asyncio.gather(*pending)

        stop.set()
        monitor.cancel()
        del remaining

    if buf:
        _flush(CHECKPOINT_DIR, cp_idx, buf)

    bar.close()
    done_total = len(completed) + total - failed
    all_total = pq.read_metadata(INPUTS_FILE).num_rows
    print(f"\n{done_total:,}/{all_total:,} complete")
    if failed:
        print(f"{failed:,} failed (run again to retry)")


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


def cmd_status():
    if not Path(INPUTS_FILE).exists():
        print("no inputs file, run prepare first")
        return
    total = pq.read_metadata(INPUTS_FILE).num_rows
    completed = len(_load_completed(CHECKPOINT_DIR))
    entity_level = duckdb.sql(
        f"SELECT count(*) FROM read_parquet('{INPUTS_FILE}') WHERE property IS NULL"
    ).fetchone()[0]

    print(f"inputs:    {total:,} ({entity_level:,} entity-level, {total - entity_level:,} per-property)")
    if total:
        print(f"completed: {completed:,} ({completed / total * 100:.1f}%)")
    print(f"remaining: {total - completed:,}")


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------


def _export_worker_binary(args: tuple) -> tuple[str, int]:
    """Process checkpoint files, write binary COPY part. Much faster than text."""
    cp_files_chunk, entity_only, part_path, worker_id, inputs_file = args
    count = 0
    total_files = len(cp_files_chunk)
    where = "WHERE i.property IS NULL" if entity_only else ""
    db = duckdb.connect()

    with gzip.open(part_path, "wb", compresslevel=4) as f:
        batch_size = 10
        for fi in range(0, total_files, batch_size):
            batch_files = cp_files_chunk[fi : fi + batch_size]
            file_list = ", ".join(f"'{p}'" for p in batch_files)

            result = db.execute(f"""
                SELECT i.web_id, i.entity_uuid, i.property,
                       e.embedding, i.dt_start, i.tt_start
                FROM read_parquet([{file_list}]) e
                JOIN read_parquet('{inputs_file}') i ON e.row_id = i.row_id
                {where}
            """)

            while rows := result.fetchmany(5000):
                for web_id, entity_uuid, prop, emb, dt, tt in rows:
                    _write_binary_row(f, web_id, entity_uuid, prop, emb, dt, tt)
                    count += 1

            done = min(fi + batch_size, total_files)
            if done % 25 < batch_size or done == total_files:
                print(f"  w{worker_id}: {done}/{total_files} files, {count:,} rows", flush=True)

    db.close()
    return part_path, count


def _export_worker(args: tuple) -> tuple[str, int]:
    """Process a chunk of checkpoint files, write a gzip part. Runs in forked process."""
    cp_files_chunk, entity_only, part_path, worker_id, inputs_file = args
    count = 0
    total_files = len(cp_files_chunk)
    where = "WHERE i.property IS NULL" if entity_only else ""
    db = duckdb.connect()

    with gzip.open(part_path, "wt", compresslevel=4) as f:
        # Process checkpoint files in small batches for efficient DuckDB joins
        batch_size = 10
        for fi in range(0, total_files, batch_size):
            batch_files = cp_files_chunk[fi : fi + batch_size]
            file_list = ", ".join(f"'{p}'" for p in batch_files)

            result = db.execute(f"""
                SELECT i.web_id, i.entity_uuid, i.property,
                       e.embedding, i.dt_start, i.tt_start
                FROM read_parquet([{file_list}]) e
                JOIN read_parquet('{inputs_file}') i
                ON e.row_id = i.row_id
                {where}
            """)

            while rows := result.fetchmany(5000):
                for web_id, entity_uuid, prop, emb, dt, tt in rows:
                    f.write(
                        "\t".join(
                            [
                                web_id,
                                entity_uuid,
                                "\\N",
                                prop if prop is not None else "\\N",
                                _vec_to_pg(emb),
                                dt,
                                tt,
                            ]
                        )
                        + "\n"
                    )
                    count += 1

            done = min(fi + batch_size, total_files)
            if done % 25 < batch_size or done == total_files:
                print(f"  w{worker_id}: {done}/{total_files} files, {count:,} rows", flush=True)

    db.close()
    return part_path, count


def cmd_export(output_dir: str, num_export_workers: int = 8, fmt: str = "binary"):
    import multiprocessing as mp

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cp_files = sorted(Path(CHECKPOINT_DIR).glob("*.parquet"))
    if not cp_files:
        print("no checkpoints to export")
        return

    num_workers = min(mp.cpu_count() or 4, num_export_workers)
    cols = (
        "web_id, entity_uuid, draft_id, property, embedding, "
        "updated_at_decision_time, updated_at_transaction_time"
    )

    use_binary = fmt == "binary"
    ext = ".bin.gz" if use_binary else ".sql.gz"
    worker_fn = _export_worker_binary if use_binary else _export_worker

    for label, entity_only, basename in [
        ("entity-only", True, "embeddings-entity-only"),
        ("all", False, "embeddings-all"),
    ]:
        filename = basename + ext
        path = out / filename
        parts_dir = out / f".parts_{label}"
        parts_dir.mkdir(exist_ok=True)
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            print(f"  {filename} already exists ({size_mb:,.1f} MB), skipping")
            continue

        print(f"exporting {label} ({fmt}) with {num_workers} workers...")

        # Split checkpoint files across workers
        chunks = [[] for _ in range(num_workers)]
        for i, f in enumerate(cp_files):
            chunks[i % num_workers].append(f)

        work = [
            (chunk, entity_only, str(parts_dir / f"part_{i:03d}.gz"), i, str(Path(INPUTS_FILE).resolve()))
            for i, chunk in enumerate(chunks)
            if chunk
        ]

        ctx = mp.get_context("fork")
        total_count = 0
        with ctx.Pool(num_workers) as pool:
            for part_path, count in pool.imap_unordered(worker_fn, work):
                total_count += count
                print(f"  {Path(part_path).name}: {count:,} rows")

        # Concatenate: gzip concat is valid (decompresses to concatenation)
        print(f"  concatenating {len(work)} parts...")
        with open(path, "wb") as out_f:
            if use_binary:
                out_f.write(gzip.compress(_PGCOPY_HEADER))
            else:
                out_f.write(gzip.compress(
                    f"COPY entity_embeddings ({cols}) FROM stdin;\n".encode()
                ))

            for w in sorted(work, key=lambda x: x[2]):
                with open(w[2], "rb") as pf:
                    while chunk := pf.read(1024 * 1024):
                        out_f.write(chunk)

            if use_binary:
                out_f.write(gzip.compress(_PGCOPY_TRAILER))
            else:
                out_f.write(gzip.compress(b"\\.\n"))

        # Clean up parts
        for w in work:
            Path(w[2]).unlink(missing_ok=True)
        parts_dir.rmdir()

        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"  {filename}: {total_count:,} rows ({size_mb:,.1f} MB)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    p = argparse.ArgumentParser(description="Bulk HASH entity embedding generation")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("prepare", help="build embedding inputs from Postgres into inputs.parquet")

    run_p = sub.add_parser("run", help="generate embeddings via OpenRouter")
    run_p.add_argument("-n", "--initial-concurrency", type=int, default=4, help="starting concurrency (default: 4)")
    run_p.add_argument("-m", "--max-concurrency", type=int, default=64, help="concurrency ceiling (default: 64)")

    sub.add_parser("status", help="show progress")

    exp_p = sub.add_parser("export", help="export replayable SQL dumps")
    exp_p.add_argument("-o", "--output", default=".", help="output directory")
    exp_p.add_argument("-w", "--workers", type=int, default=4, help="parallel workers (default: 4)")
    exp_p.add_argument("-f", "--format", choices=["binary", "text"], default="binary",
                       help="binary (faster, smaller) or text (COPY FROM stdin)")


    args = p.parse_args()

    match args.cmd:
        case "prepare":
            db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/graph")
            asyncio.run(cmd_prepare(db_url))
        case "run":
            api_key = os.environ.get("OPENROUTER_API_KEY")
            if not api_key:
                print("set OPENROUTER_API_KEY", file=sys.stderr)
                sys.exit(1)
            asyncio.run(cmd_run(api_key, args.initial_concurrency, args.max_concurrency))
        case "status":
            cmd_status()
        case "export":
            cmd_export(args.output, args.workers, args.format)


if __name__ == "__main__":
    main()
