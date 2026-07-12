"""Prefix transforms and bounded exact cosine kNN backed by FAISS.

The exact search uses :class:`faiss.IndexFlatIP`, which is exhaustive and therefore has no
recall trade-off. Both queries and corpus rows are L2-normalized, making inner product equal
to cosine similarity. The corpus is streamed through a reusable flat index in bounded
blocks; query batches are searched against each block and :class:`faiss.ResultHeap` merges
the block-local results into the exact global top-k.

The official Apple Silicon wheel exposes Metal through the regular GPU API. FAISS 1.14's
Metal flat search materializes a distance buffer for every query/corpus batch; measurements
show the process physical footprint retaining approximately one such buffer per search even
after explicit Python GC and GPU synchronization. Metal corpus blocks therefore run in
bounded spawned workers so process exit returns that backend memory to the OS.
``memory_cap_bytes`` bounds the estimated function-owned working set
(normalized batches, flat-index storage, result heaps, and the GPU/CPU score workspace); it
cannot account for caller-owned arrays, memory-mapped file pages retained by the OS, or
backend allocator bookkeeping.
"""

import multiprocessing
import traceback
from contextlib import suppress
from dataclasses import dataclass
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from multiprocessing.shared_memory import SharedMemory
from typing import Final, Literal, Protocol, cast

import faiss
import numpy as np

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter

DEFAULT_MEMORY_CAP_BYTES: Final = 8 << 30
_EPS: Final = 1e-12
_MATRIX_NDIM: Final = 2
_F32_BYTES: Final = np.dtype(np.float32).itemsize
_I64_BYTES: Final = np.dtype(np.int64).itemsize
_MAX_CORPUS_BATCH_BYTES: Final = 512 << 20
_MAX_SCORE_BATCH_BYTES: Final = 512 << 20
_MAX_QUERY_BATCH_ROWS: Final = 4096
_METAL_WORKER_MEMORY_FRACTION: Final = 0.5
_MAX_WORKER_ERROR_CHARS: Final = 8 << 10
_WORKER_TERMINATE_TIMEOUT_SECONDS: Final = 5.0

SearchBackend = Literal["cpu", "gpu"]
RequestedSearchBackend = Literal["auto", "cpu", "gpu"]


class _FaissIndex(Protocol):
    def add(self, vectors: np.ndarray) -> None: ...

    def reset(self) -> None: ...

    def search(self, queries: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]: ...


@dataclass(frozen=True)
class FaissSearchPlan:
    """Bounded block sizes and estimated peak owned memory for one exact search."""

    corpus_batch_rows: int
    query_batch_rows: int
    estimated_peak_bytes: int


def _normalize_rows_in_place(rows: np.ndarray, *, eps: float = _EPS) -> None:
    norms = np.linalg.norm(rows, axis=1)
    if not np.isfinite(norms).all():
        raise ValueError("input contains non-finite values")

    zero = norms < eps
    norms[zero] = 1.0
    np.divide(rows, norms[:, None], out=rows)
    if zero.any():
        rows[zero] = 0.0


def _validate_finite(rows: np.ndarray, *, target_chunk_bytes: int = 32 << 20) -> None:
    row_bytes = max(1, rows.shape[1] * rows.dtype.itemsize)
    chunk_rows = max(1, target_chunk_bytes // row_bytes)
    for start in range(0, rows.shape[0], chunk_rows):
        if not np.isfinite(rows[start : start + chunk_rows]).all():
            raise ValueError("input contains non-finite values")


def _search_arrays(
    queries: np.ndarray,
    corpus: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    queries_array = np.asarray(queries)
    corpus_array = np.asarray(corpus)
    if queries_array.ndim != _MATRIX_NDIM or corpus_array.ndim != _MATRIX_NDIM:
        raise ValueError("queries and corpus must be 2-d")
    if queries_array.shape[1] != corpus_array.shape[1]:
        raise ValueError(
            f"dim mismatch: queries {queries_array.shape[1]} vs corpus {corpus_array.shape[1]}"
        )
    if queries_array.shape[1] == 0:
        raise ValueError("embedding dimension must be positive")
    return queries_array, corpus_array


def l2_normalize(x: np.ndarray, *, eps: float = _EPS) -> np.ndarray:
    """Return a float32 copy whose rows have unit L2 norm.

    Rows whose norm falls below ``eps`` become zero vectors. Raises ``ValueError`` when the
    input is not two-dimensional or contains non-finite values.
    """
    out = np.array(x, dtype=np.float32, order="C", copy=True)
    if out.ndim != _MATRIX_NDIM:
        raise ValueError(f"expected a 2-d array, got shape {out.shape}")
    _normalize_rows_in_place(out, eps=eps)
    return out


def prefix_transform(x: np.ndarray, dim: int, *, eps: float = _EPS) -> np.ndarray:
    """Truncate rows to their first ``dim`` components, then L2-normalize the result."""
    x = np.asarray(x)
    if x.ndim != _MATRIX_NDIM:
        raise ValueError(f"expected a 2-d array, got shape {x.shape}")
    if not 0 < dim <= x.shape[1]:
        raise ValueError(f"prefix dim {dim} out of range for input with {x.shape[1]} dims")
    return l2_normalize(x[:, :dim], eps=eps)


def gpu_search_available() -> bool:
    """Return whether FAISS exposes at least one GPU-like backend (Metal/CUDA/ROCm)."""
    try:
        return int(faiss.get_num_gpus()) > 0
    except AttributeError, RuntimeError:
        return False


def metal_search_available() -> bool:
    """Return whether this FAISS build includes its Apple Metal backend."""
    try:
        return "MAC_METAL" in str(faiss.get_compile_options()).split()
    except AttributeError:
        return False


def resolve_search_backend(requested: RequestedSearchBackend) -> SearchBackend:
    """Resolve ``auto`` and validate explicitly requested GPU availability.

    Metal exact search is safe to select automatically because each bounded corpus block runs
    in a spawned worker. Process exit releases the worker's retained Metal distance buffers.
    """
    if requested == "auto":
        return "gpu" if gpu_search_available() else "cpu"
    if requested == "gpu" and not gpu_search_available():
        raise ValueError("FAISS GPU search requested, but no Metal/CUDA/ROCm device is available")
    return requested


def _create_index(dim: int, backend: SearchBackend) -> tuple[_FaissIndex, object | None]:
    cpu_index = faiss.IndexFlatIP(dim)
    if backend == "cpu":
        return cast("_FaissIndex", cpu_index), None

    try:
        resources = faiss.StandardGpuResources()
        gpu_index = faiss.index_cpu_to_gpu(resources, 0, cpu_index)
    except RuntimeError as error:
        raise ValueError(f"could not initialize FAISS GPU search: {error}") from error
    return cast("_FaissIndex", gpu_index), resources


def _search_plan(
    *,
    n_queries: int,
    n_corpus: int,
    dim: int,
    search_k: int,
    has_exclusions: bool,
    memory_cap_bytes: int,
    isolated_metal: bool = False,
) -> FaissSearchPlan:
    if memory_cap_bytes <= 0:
        raise ValueError("memory_cap_bytes must be positive")

    query_bytes = n_queries * dim * _F32_BYTES
    heap_bytes = n_queries * search_k * (_F32_BYTES + _I64_BYTES)
    output_bytes = n_queries * (search_k - int(has_exclusions)) * (_F32_BYTES + _I64_BYTES)
    bookkeeping_bytes = n_queries * _I64_BYTES * (1 + int(has_exclusions))
    fixed_bytes = query_bytes + heap_bytes + output_bytes + bookkeeping_bytes

    # A corpus row exists both in the normalized host batch and in the flat index. Norms and
    # a zero-row mask add five bytes per row at normalization time.
    vector_row_bytes = dim * _F32_BYTES
    indexed_row_bytes = 2 * vector_row_bytes + 5

    if isolated_metal:
        # The Metal flat kernel materializes one float32 score for every query/corpus pair.
        # Measurements on FAISS 1.14.3 show those allocations accumulating for the worker's
        # lifetime, regardless of query batching. Keep that cumulative volume below half of
        # the caller's cap and reclaim it at the end of each corpus-block worker.
        local_result_bytes = n_queries * search_k * (_F32_BYTES + _I64_BYTES)
        worker_fixed_bytes = fixed_bytes + local_result_bytes
        score_bytes_per_corpus_row = n_queries * _F32_BYTES
        transient_result_bytes_per_query = search_k * (_F32_BYTES + _I64_BYTES)
        bytes_per_corpus_row = indexed_row_bytes + score_bytes_per_corpus_row
        minimum_bytes = worker_fixed_bytes + bytes_per_corpus_row + transient_result_bytes_per_query
        if minimum_bytes > memory_cap_bytes:
            raise ValueError(
                "memory cap is too small for isolated Metal exact search: need at least "
                f"{minimum_bytes / (1 << 20):.1f} MiB, got "
                f"{memory_cap_bytes / (1 << 20):.1f} MiB"
            )

        score_budget = int(memory_cap_bytes * _METAL_WORKER_MEMORY_FRACTION)
        score_limited_rows = score_budget // max(1, score_bytes_per_corpus_row)
        host_limited_rows = _MAX_CORPUS_BATCH_BYTES // vector_row_bytes
        total_limited_rows = (
            memory_cap_bytes - worker_fixed_bytes - transient_result_bytes_per_query
        ) // bytes_per_corpus_row
        corpus_batch_rows = min(
            n_corpus,
            max(1, score_limited_rows),
            max(1, host_limited_rows),
            max(1, total_limited_rows),
        )

        base_bytes = worker_fixed_bytes + corpus_batch_rows * bytes_per_corpus_row
        available_for_results = memory_cap_bytes - base_bytes
        score_batch_limited_rows = _MAX_SCORE_BATCH_BYTES // max(1, corpus_batch_rows * _F32_BYTES)
        query_batch_rows = min(
            n_queries,
            _MAX_QUERY_BATCH_ROWS,
            score_batch_limited_rows,
            available_for_results // transient_result_bytes_per_query,
        )
        if query_batch_rows < 1:
            raise ValueError("memory cap cannot fit one isolated Metal query batch")

        estimated_peak_bytes = base_bytes + query_batch_rows * transient_result_bytes_per_query
        return FaissSearchPlan(
            corpus_batch_rows=corpus_batch_rows,
            query_batch_rows=query_batch_rows,
            estimated_peak_bytes=estimated_peak_bytes,
        )

    minimum_bytes = (
        fixed_bytes + indexed_row_bytes + _F32_BYTES + search_k * (_F32_BYTES + _I64_BYTES)
    )
    if minimum_bytes > memory_cap_bytes:
        raise ValueError(
            "memory cap is too small for exact search: need at least "
            f"{minimum_bytes / (1 << 20):.1f} MiB, got "
            f"{memory_cap_bytes / (1 << 20):.1f} MiB"
        )

    available = memory_cap_bytes - fixed_bytes
    corpus_budget = min(_MAX_CORPUS_BATCH_BYTES, available // 3)
    corpus_batch_rows = min(n_corpus, max(1, corpus_budget // vector_row_bytes))

    def max_query_rows(corpus_rows: int) -> int:
        block_bytes = corpus_rows * indexed_row_bytes
        remaining = available - block_bytes
        per_query_bytes = corpus_rows * _F32_BYTES + search_k * (_F32_BYTES + _I64_BYTES)
        score_limited = _MAX_SCORE_BATCH_BYTES // max(1, corpus_rows * _F32_BYTES)
        return min(
            n_queries,
            _MAX_QUERY_BATCH_ROWS,
            score_limited,
            remaining // per_query_bytes,
        )

    query_batch_rows = max_query_rows(corpus_batch_rows)
    if query_batch_rows < 1:
        max_block_bytes = available - search_k * (_F32_BYTES + _I64_BYTES)
        corpus_batch_rows = min(
            n_corpus,
            max(1, max_block_bytes // (indexed_row_bytes + _F32_BYTES)),
        )
        query_batch_rows = max_query_rows(corpus_batch_rows)
    if query_batch_rows < 1:
        raise ValueError("memory cap cannot fit one corpus row and one query row")

    estimated_peak_bytes = (
        fixed_bytes
        + corpus_batch_rows * indexed_row_bytes
        + query_batch_rows * (corpus_batch_rows * _F32_BYTES + search_k * (_F32_BYTES + _I64_BYTES))
    )
    return FaissSearchPlan(
        corpus_batch_rows=corpus_batch_rows,
        query_batch_rows=query_batch_rows,
        estimated_peak_bytes=estimated_peak_bytes,
    )


def _create_shared_memory(shape: tuple[int, int], *, itemsize: int) -> SharedMemory:
    size = shape[0] * shape[1] * itemsize
    return SharedMemory(create=True, size=size)


def _dispose_shared_memory(memory: SharedMemory) -> None:
    try:
        memory.close()
    finally:
        with suppress(FileNotFoundError):
            memory.unlink()


def _write_shared_f32_rows(
    memory: SharedMemory,
    shape: tuple[int, int],
    source: np.ndarray,
    *,
    normalized: bool,
) -> None:
    rows = np.ndarray(shape, dtype=np.float32, buffer=memory.buf)
    np.copyto(rows, source, casting="unsafe")
    if normalized:
        _validate_finite(rows)
    else:
        _normalize_rows_in_place(rows)


def _metal_search_worker_body(
    query_memory: SharedMemory,
    query_shape: tuple[int, int],
    corpus_memory: SharedMemory,
    corpus_shape: tuple[int, int],
    score_memory: SharedMemory,
    index_memory: SharedMemory,
    *,
    query_batch_rows: int,
    local_k: int,
) -> None:
    queries = np.ndarray(query_shape, dtype=np.float32, buffer=query_memory.buf)
    corpus = np.ndarray(corpus_shape, dtype=np.float32, buffer=corpus_memory.buf)
    output_shape = (query_shape[0], local_k)
    output_scores = np.ndarray(output_shape, dtype=np.float32, buffer=score_memory.buf)
    output_indices = np.ndarray(output_shape, dtype=np.int64, buffer=index_memory.buf)

    index_context = _create_index(query_shape[1], "gpu")
    index = index_context[0]
    index.add(corpus)
    for query_start in range(0, query_shape[0], query_batch_rows):
        query_stop = min(query_start + query_batch_rows, query_shape[0])
        scores, indices = index.search(queries[query_start:query_stop], local_k)
        output_scores[query_start:query_stop] = scores
        output_indices[query_start:query_stop] = indices


def _worker_error_text() -> str:
    text = traceback.format_exc()
    if len(text) <= _MAX_WORKER_ERROR_CHARS:
        return text
    return f"... worker traceback truncated ...\n{text[-_MAX_WORKER_ERROR_CHARS:]}"


def _terminate_worker(process: BaseProcess) -> None:
    process.terminate()
    process.join(timeout=_WORKER_TERMINATE_TIMEOUT_SECONDS)
    if process.is_alive():
        process.kill()
        process.join()


def _metal_search_worker(
    query_memory_name: str,
    query_shape: tuple[int, int],
    corpus_memory_name: str,
    corpus_shape: tuple[int, int],
    score_memory_name: str,
    index_memory_name: str,
    query_batch_rows: int,
    local_k: int,
    status_connection: Connection,
) -> None:
    memories: list[SharedMemory] = []
    status: tuple[str, str] = ("ok", "")
    try:
        query_memory = SharedMemory(name=query_memory_name, track=False)
        memories.append(query_memory)
        corpus_memory = SharedMemory(name=corpus_memory_name, track=False)
        memories.append(corpus_memory)
        score_memory = SharedMemory(name=score_memory_name, track=False)
        memories.append(score_memory)
        index_memory = SharedMemory(name=index_memory_name, track=False)
        memories.append(index_memory)
        _metal_search_worker_body(
            query_memory,
            query_shape,
            corpus_memory,
            corpus_shape,
            score_memory,
            index_memory,
            query_batch_rows=query_batch_rows,
            local_k=local_k,
        )
    except Exception:  # noqa: BLE001 - this is the subprocess error boundary
        status = ("error", _worker_error_text())
    finally:
        for memory in reversed(memories):
            try:
                memory.close()
            except Exception:  # noqa: BLE001 - report cleanup failures to the parent too
                if status[0] == "ok":
                    status = ("error", _worker_error_text())
        try:
            status_connection.send(status)
        except BrokenPipeError, EOFError, OSError:
            pass
        finally:
            status_connection.close()


def _run_isolated_metal_worker(
    *,
    query_memory_name: str,
    query_shape: tuple[int, int],
    corpus_memory_name: str,
    corpus_shape: tuple[int, int],
    score_memory_name: str,
    index_memory_name: str,
    query_batch_rows: int,
    local_k: int,
) -> None:
    context = multiprocessing.get_context("spawn")
    receive_status, send_status = context.Pipe(duplex=False)
    process = context.Process(
        target=_metal_search_worker,
        args=(
            query_memory_name,
            query_shape,
            corpus_memory_name,
            corpus_shape,
            score_memory_name,
            index_memory_name,
            query_batch_rows,
            local_k,
            send_status,
        ),
        name="faiss-metal-search",
    )
    started = False
    try:
        process.start()
        started = True
        send_status.close()
        try:
            try:
                status = receive_status.recv()
            except EOFError:
                status = None
            process.join()
        except KeyboardInterrupt:
            _terminate_worker(process)
            raise
        if process.exitcode != 0:
            detail = f"\n{status[1]}" if status is not None and status[0] == "error" else ""
            raise RuntimeError(f"FAISS Metal worker exited with code {process.exitcode}{detail}")
        if status is None:
            raise RuntimeError("FAISS Metal worker exited without reporting its status")
        if status[0] == "error":
            raise RuntimeError(f"FAISS Metal worker failed:\n{status[1]}")
    finally:
        send_status.close()
        receive_status.close()
        if started:
            if process.is_alive():
                _terminate_worker(process)
            process.close()


def _merge_shared_results(
    result_heap: faiss.ResultHeap,
    query_ids: np.ndarray,
    score_memory: SharedMemory,
    index_memory: SharedMemory,
    *,
    shape: tuple[int, int],
    corpus_start: int,
) -> None:
    scores = np.ndarray(shape, dtype=np.float32, buffer=score_memory.buf)
    indices = np.ndarray(shape, dtype=np.int64, buffer=index_memory.buf)
    indices += corpus_start
    result_heap.add_result_subset(query_ids, scores, indices)


def _search_isolated_metal(
    queries: np.ndarray,
    corpus: np.ndarray,
    *,
    search_k: int,
    normalized: bool,
    plan: FaissSearchPlan,
    progress: ProgressReporter,
) -> faiss.ResultHeap:
    n_queries, dim = queries.shape
    n_corpus = corpus.shape[0]
    query_shape = (n_queries, dim)
    query_memory = _create_shared_memory(query_shape, itemsize=_F32_BYTES)
    result_heap = faiss.ResultHeap(n_queries, search_k, keep_max=True)
    query_ids = np.arange(n_queries, dtype=np.int64)

    try:
        _write_shared_f32_rows(query_memory, query_shape, queries, normalized=normalized)
        for corpus_start in range(0, n_corpus, plan.corpus_batch_rows):
            corpus_stop = min(corpus_start + plan.corpus_batch_rows, n_corpus)
            corpus_shape = (corpus_stop - corpus_start, dim)
            local_k = min(search_k, corpus_shape[0])
            output_shape = (n_queries, local_k)
            block_memories: list[SharedMemory] = []
            try:
                corpus_memory = _create_shared_memory(corpus_shape, itemsize=_F32_BYTES)
                block_memories.append(corpus_memory)
                score_memory = _create_shared_memory(output_shape, itemsize=_F32_BYTES)
                block_memories.append(score_memory)
                index_memory = _create_shared_memory(output_shape, itemsize=_I64_BYTES)
                block_memories.append(index_memory)

                _write_shared_f32_rows(
                    corpus_memory,
                    corpus_shape,
                    corpus[corpus_start:corpus_stop],
                    normalized=normalized,
                )
                _run_isolated_metal_worker(
                    query_memory_name=query_memory.name,
                    query_shape=query_shape,
                    corpus_memory_name=corpus_memory.name,
                    corpus_shape=corpus_shape,
                    score_memory_name=score_memory.name,
                    index_memory_name=index_memory.name,
                    query_batch_rows=plan.query_batch_rows,
                    local_k=local_k,
                )
                _merge_shared_results(
                    result_heap,
                    query_ids,
                    score_memory,
                    index_memory,
                    shape=output_shape,
                    corpus_start=corpus_start,
                )
                progress.advance(n_queries * corpus_shape[0])
            finally:
                for memory in reversed(block_memories):
                    _dispose_shared_memory(memory)
    finally:
        _dispose_shared_memory(query_memory)

    return result_heap


def _search_in_process(
    queries: np.ndarray,
    corpus: np.ndarray,
    *,
    search_k: int,
    normalized: bool,
    backend: SearchBackend,
    plan: FaissSearchPlan,
    progress: ProgressReporter,
) -> faiss.ResultHeap:
    n_queries, dim = queries.shape
    n_corpus = corpus.shape[0]
    q = np.array(queries, dtype=np.float32, order="C", copy=True)
    if normalized:
        _validate_finite(q)
    else:
        _normalize_rows_in_place(q)

    index_context = _create_index(dim, backend)
    index = index_context[0]
    result_heap = faiss.ResultHeap(n_queries, search_k, keep_max=True)
    query_ids = np.arange(n_queries, dtype=np.int64)

    for corpus_start in range(0, n_corpus, plan.corpus_batch_rows):
        corpus_stop = min(corpus_start + plan.corpus_batch_rows, n_corpus)
        rows = np.array(
            corpus[corpus_start:corpus_stop],
            dtype=np.float32,
            order="C",
            copy=True,
        )
        if normalized:
            _validate_finite(rows)
        else:
            _normalize_rows_in_place(rows)

        index.reset()
        index.add(rows)
        local_k = min(search_k, len(rows))

        for query_start in range(0, n_queries, plan.query_batch_rows):
            query_stop = min(query_start + plan.query_batch_rows, n_queries)
            local_scores, local_indices = index.search(q[query_start:query_stop], local_k)
            local_indices = np.asarray(local_indices, dtype=np.int64) + corpus_start
            result_heap.add_result_subset(
                query_ids[query_start:query_stop],
                np.asarray(local_scores, dtype=np.float32),
                local_indices,
            )
            progress.advance((query_stop - query_start) * len(rows))

    return result_heap


def _canonical_results(
    raw_scores: np.ndarray,
    raw_indices: np.ndarray,
    *,
    k: int,
    exclude: np.ndarray | None,
) -> tuple[np.ndarray, np.ndarray]:
    n_queries = raw_indices.shape[0]
    indices = np.empty((n_queries, k), dtype=np.int64)
    scores = np.empty((n_queries, k), dtype=np.float32)

    for query in range(n_queries):
        row_indices = raw_indices[query]
        row_scores = raw_scores[query]
        valid = row_indices >= 0
        if exclude is not None:
            valid &= row_indices != exclude[query]
        row_indices = row_indices[valid]
        row_scores = row_scores[valid]
        order = np.lexsort((row_indices, -row_scores))
        if len(order) < k:
            raise RuntimeError("FAISS returned too few neighbors after self-exclusion")
        selected = order[:k]
        indices[query] = row_indices[selected]
        scores[query] = row_scores[selected]

    return indices, scores


def exact_cosine_knn(
    queries: np.ndarray,
    corpus: np.ndarray,
    k: int,
    *,
    query_rows_in_corpus: np.ndarray | None = None,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    normalized: bool = False,
    backend: RequestedSearchBackend = "cpu",
    progress: ProgressReporter = NO_PROGRESS,
    phase: str = "exact cosine kNN",
) -> tuple[np.ndarray, np.ndarray]:
    """Compute exact cosine top-``k`` with deterministic lower-index tie-breaking.

    The corpus may be a memmap or a lazy column slice. Each corpus block is copied,
    normalized, added to a reusable exact FAISS flat index, and searched in bounded query
    batches. When ``query_rows_in_corpus`` is provided, each query's own row is excluded.
    ``backend="auto"`` uses Metal/CUDA/ROCm when available and otherwise CPU. Metal corpus
    blocks run in bounded spawned workers so retained backend allocations are reclaimed at
    worker exit.

    ``normalized=True`` skips normalization but still validates finiteness. The memory cap is
    an estimate over function-owned arrays and backend workspaces, not a hard RSS limit.
    """
    if k <= 0:
        raise ValueError("k must be positive")

    queries_array, corpus_array = _search_arrays(queries, corpus)
    n_queries, dim = queries_array.shape
    n_corpus = corpus_array.shape[0]
    exclude = None
    if query_rows_in_corpus is not None:
        exclude = np.asarray(query_rows_in_corpus, dtype=np.int64)
        if exclude.shape != (n_queries,):
            raise ValueError("query_rows_in_corpus must have shape (n_queries,)")
        if np.any((exclude < 0) | (exclude >= n_corpus)):
            raise ValueError("query_rows_in_corpus contains an out-of-range row")

    available_neighbors = n_corpus - int(exclude is not None)
    if k > available_neighbors:
        raise ValueError(f"k={k} exceeds the {available_neighbors} available corpus neighbors")

    resolved_backend = resolve_search_backend(backend)
    isolated_metal = resolved_backend == "gpu" and metal_search_available()
    search_k = k + int(exclude is not None)

    if n_queries == 0:
        return (
            np.empty((0, k), dtype=np.int64),
            np.empty((0, k), dtype=np.float32),
        )

    plan = _search_plan(
        n_queries=n_queries,
        n_corpus=n_corpus,
        dim=dim,
        search_k=search_k,
        has_exclusions=exclude is not None,
        memory_cap_bytes=memory_cap_bytes,
        isolated_metal=isolated_metal,
    )
    isolation_note = ", isolated Metal workers" if isolated_metal else ""
    progress.note(
        f"{phase}: FAISS {resolved_backend}{isolation_note}, corpus batches "
        f"{plan.corpus_batch_rows:,}, query batches {plan.query_batch_rows:,}, "
        f"estimated workspace {plan.estimated_peak_bytes / (1 << 30):.2f} GiB"
    )
    progress.phase(f"{phase}: exact FAISS {resolved_backend}", total=n_queries * n_corpus)

    if isolated_metal:
        result_heap = _search_isolated_metal(
            queries_array,
            corpus_array,
            search_k=search_k,
            normalized=normalized,
            plan=plan,
            progress=progress,
        )
    else:
        result_heap = _search_in_process(
            queries_array,
            corpus_array,
            search_k=search_k,
            normalized=normalized,
            backend=resolved_backend,
            plan=plan,
            progress=progress,
        )

    result_heap.finalize()
    return _canonical_results(
        result_heap.D,
        result_heap.I,
        k=k,
        exclude=exclude,
    )
