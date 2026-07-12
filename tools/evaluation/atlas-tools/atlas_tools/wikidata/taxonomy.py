"""P279 (subclass-of) taxonomy artifact: paged extraction + in-memory API.

Wikidata's full P279 edge list is ~5.2M edges (measured live on QLever).
In-query subsumption filtering (FILTER EXISTS + P279* inside the example
pool query) times out on both public endpoints (~80 s on QLever), so
subsumption is done locally: pull the whole edge list once into
``taxonomy.parquet`` and answer subclass queries in memory.

Extraction (:func:`extract_taxonomy`):

- pages the edge list from QLever with a deterministic OFFSET ladder
  (``LIMIT <page_size> OFFSET k*page_size``; measured ~1.0 s / ~48 MB JSON
  per 500k-row page, ~11 pages total) until a short page signals the end;
- follows the dump extractor's checkpoint pattern: each page becomes an
  atomic part file, ``checkpoint.json`` advances only after the part is
  durable, the final parquet is a single ``write_table`` over the
  concatenated parts, and a completed run is marked ``complete`` so a
  rerun rebuilds identical outputs with no further fetches;
- deliberately bypasses ``CachingTransport``: each page body is ~48 MB of
  JSON and caching them would roughly double local storage for no
  benefit, because the parquet plus checkpoint parts already provide the
  persistence. Pass the plain transport.

Artifact schema: two int64 columns ``child``, ``parent`` (numeric QIDs;
``Qid`` branding happens at the API boundary). Sidecar: a typed provenance
envelope with snapshot date, page size, page/edge counts, and the parquet
content hash.

In-memory API (:class:`Taxonomy`): loads the parquet once into two sorted
numpy int64 arrays; ``closure`` / ``is_subclass_of`` do upward BFS with
per-type memoization. Cycle-safe (Wikidata P279 has cycles) and reflexive
(a type subsumes itself).
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Self

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt

from atlas_tools.common.data import Sha256Hex
from atlas_tools.common.provenance import Provenance, sha256_file
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Qid, entity_number
from atlas_tools.wikidata.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.wikidata.sparql import SparqlResponse, sparql_params
from atlas_tools.wikidata.transport import Transport

TAXONOMY_SCHEMA = pa.schema(
    [
        pa.field("child", pa.int64()),
        pa.field("parent", pa.int64()),
    ]
)


def taxonomy_page_query(*, limit: int, offset: int) -> str:
    """Build the query for one page of the full P279 edge list.

    Verified live on QLever: 200 in ~1.0 s per 500k page. The inner
    subquery slices the raw edge stream; ``BIND(STRAFTER(...))`` projects
    bare QID strings to shrink the JSON.
    """
    return (
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n"
        "SELECT ?child ?parent WHERE {\n"
        "  {\n"
        "    SELECT ?childEntity ?parentEntity WHERE {\n"
        "      ?childEntity wdt:P279 ?parentEntity .\n"
        "    }\n"
        f"    LIMIT {limit} OFFSET {offset}\n"
        "  }\n"
        '  BIND(STRAFTER(STR(?childEntity), "entity/") AS ?child)\n'
        '  BIND(STRAFTER(STR(?parentEntity), "entity/") AS ?parent)\n'
        "}"
    )


@dataclass(frozen=True)
class TaxonomyPage:
    """One parsed page: numeric edges plus the raw binding count.

    The raw count drives short-page termination even if non-item rows
    were skipped.
    """

    edges: tuple[tuple[int, int], ...]
    row_count: int


def parse_taxonomy_page(body: bytes) -> TaxonomyPage:
    response = SparqlResponse.model_validate_json(body)
    edges: list[tuple[int, int]] = []
    for binding in response.results.bindings:
        child = binding["child"].value
        parent = binding["parent"].value
        if child.startswith("Q") and parent.startswith("Q"):
            edges.append((int(child[1:]), int(parent[1:])))
    return TaxonomyPage(edges=tuple(edges), row_count=len(response.results.bindings))


class TaxonomyCheckpoint(BaseModel):
    """On-disk shape of the taxonomy extraction checkpoint."""

    next_offset: NonNegativeInt
    edges: NonNegativeInt
    parts: list[str] = Field(default_factory=list)
    next_part_index: NonNegativeInt = 0
    complete: bool = False


class TaxonomyDetails(BaseModel):
    """Sidecar details for the taxonomy parquet."""

    edges: NonNegativeInt
    pages: NonNegativeInt
    page_size: PositiveInt
    snapshot_date: str
    endpoint: str
    parquet_sha256: Sha256Hex


TaxonomyProvenance = Provenance[TaxonomyDetails, Config]


@dataclass(frozen=True)
class TaxonomySummary:
    edges: int
    pages: int


def _edges_table(edges: tuple[tuple[int, int], ...]) -> pa.Table:
    children = pa.array([edge[0] for edge in edges], type=pa.int64())
    parents = pa.array([edge[1] for edge in edges], type=pa.int64())
    return pa.Table.from_arrays([children, parents], schema=TAXONOMY_SCHEMA)


def _atomic_write_checkpoint(path: Path, checkpoint: TaxonomyCheckpoint) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(checkpoint.model_dump_json(indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def write_taxonomy_parquet(edges: tuple[tuple[int, int], ...], out_path: Path | str) -> None:
    """Write a taxonomy parquet directly (fixtures/tests)."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(_edges_table(edges), out_path)


def extract_taxonomy(
    transport: Transport,
    *,
    config: Config,
    out_path: Path | str,
    checkpoint_dir: Path | str,
    progress: ProgressReporter = NO_PROGRESS,
) -> TaxonomySummary:
    """Page the full P279 edge list into ``out_path`` (see module docstring).

    ``transport`` must be the plain transport (no ``CachingTransport``):
    page bodies are ~48 MB each and the parquet plus checkpoint parts are
    the persistence layer; caching the JSON would double storage.
    """
    out_path = Path(out_path)
    checkpoint_dir = Path(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / "checkpoint.json"

    extraction = config.extraction
    page_size = extraction.taxonomy_page_size
    checkpoint = TaxonomyCheckpoint(next_offset=0, edges=0)
    if checkpoint_path.exists():
        checkpoint = TaxonomyCheckpoint.model_validate_json(checkpoint_path.read_bytes())

    progress.phase("taxonomy pages (QLever)")
    if checkpoint.complete:
        progress.note("checkpoint marked complete: rebuilding from parts only")
    elif checkpoint.next_offset:
        progress.note(
            f"resuming at offset {checkpoint.next_offset} ({checkpoint.edges} edges so far)"
        )

    while not checkpoint.complete:
        query = taxonomy_page_query(limit=page_size, offset=checkpoint.next_offset)
        response = transport.get(extraction.endpoints.qlever, sparql_params(query))
        if not response.ok:
            raise RuntimeError(
                f"taxonomy page at offset {checkpoint.next_offset} failed"
                f" with status {response.status}"
            )
        page = parse_taxonomy_page(response.body)

        part_name = f"part-{checkpoint.next_part_index:05d}.parquet"
        part_path = checkpoint_dir / part_name
        tmp = part_path.with_name(part_path.name + ".tmp")
        pq.write_table(_edges_table(page.edges), tmp)
        tmp.replace(part_path)

        parts = list(checkpoint.parts)
        if part_name not in parts:
            parts.append(part_name)
        checkpoint = TaxonomyCheckpoint(
            next_offset=checkpoint.next_offset + page_size,
            edges=checkpoint.edges + len(page.edges),
            parts=parts,
            next_part_index=checkpoint.next_part_index + 1,
            # A short page is the end of the edge stream.
            complete=page.row_count < page_size,
        )
        _atomic_write_checkpoint(checkpoint_path, checkpoint)
        progress.advance()
        progress.note(
            f"page {checkpoint.next_part_index}: +{len(page.edges)} edges"
            f" ({checkpoint.edges} total)"
        )

    if checkpoint.parts:
        table = pa.concat_tables(
            [pq.read_table(checkpoint_dir / name) for name in checkpoint.parts]
        )
    else:
        table = TAXONOMY_SCHEMA.empty_table()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_name(out_path.name + ".tmp")
    pq.write_table(table, tmp)
    tmp.replace(out_path)

    TaxonomyProvenance.make(
        producer="wikidata.taxonomy",
        config=config,
        details=TaxonomyDetails(
            edges=table.num_rows,
            pages=len(checkpoint.parts),
            page_size=page_size,
            snapshot_date=extraction.snapshot_date,
            endpoint=extraction.endpoints.qlever,
            parquet_sha256=sha256_file(out_path),
        ),
    ).write(out_path.with_name(out_path.name + ".meta.json"))
    return TaxonomySummary(edges=table.num_rows, pages=len(checkpoint.parts))


class Taxonomy:
    """In-memory P279 reachability over the taxonomy parquet.

    Edges are held as two int64 arrays sorted by child; ``_parents_of`` is a
    binary-search slice. ``closure``/``is_subclass_of`` run upward BFS with
    per-type memoization; cycles terminate via the visited set. The closure
    is reflexive: every type subsumes itself, so a subject typed exactly as
    a permitted class passes the filter.
    """

    def __init__(self, children: np.ndarray, parents: np.ndarray) -> None:
        order = np.argsort(children, kind="stable")
        self._children = np.ascontiguousarray(children[order], dtype=np.int64)
        self._parents = np.ascontiguousarray(parents[order], dtype=np.int64)
        # Reverse index (sorted by parent) for downward reachability.
        reverse_order = np.argsort(parents, kind="stable")
        self._parents_sorted = np.ascontiguousarray(parents[reverse_order], dtype=np.int64)
        self._children_by_parent = np.ascontiguousarray(children[reverse_order], dtype=np.int64)
        self._closure_cache: dict[int, frozenset[int]] = {}
        self._descendant_count_cache: dict[int, int] = {}

    @classmethod
    def load(cls, path: Path | str) -> Self:
        table = pq.read_table(path)
        return cls(
            children=table.column("child").to_numpy(),
            parents=table.column("parent").to_numpy(),
        )

    @classmethod
    def from_edges(cls, edges: list[tuple[int, int]]) -> Self:
        """Build from (child, parent) numeric pairs (tests/fixtures)."""
        children = np.array([edge[0] for edge in edges], dtype=np.int64)
        parents = np.array([edge[1] for edge in edges], dtype=np.int64)
        return cls(children=children, parents=parents)

    @property
    def edge_count(self) -> int:
        return len(self._children)

    def _parents_of(self, type_number: int) -> np.ndarray:
        low = int(np.searchsorted(self._children, type_number, side="left"))
        high = int(np.searchsorted(self._children, type_number, side="right"))
        return self._parents[low:high]

    def _closure_numbers(self, start: int) -> frozenset[int]:
        cached = self._closure_cache.get(start)
        if cached is not None:
            return cached
        visited: set[int] = {start}
        frontier: list[int] = [start]
        while frontier:
            node = frontier.pop()
            for parent in self._parents_of(node):
                parent_number = int(parent)
                if parent_number not in visited:
                    visited.add(parent_number)
                    frontier.append(parent_number)
        closure = frozenset(visited)
        self._closure_cache[start] = closure
        return closure

    def closure(self, type_qid: Qid) -> frozenset[Qid]:
        """All classes reachable upward from ``type_qid``, itself included."""
        return frozenset(
            Qid(f"Q{number}") for number in self._closure_numbers(entity_number(type_qid))
        )

    def is_subclass_of(self, type_qid: Qid, permitted: frozenset[Qid]) -> bool:
        """Report whether ``type_qid`` is (a subclass of) any permitted class."""
        if type_qid in permitted:
            return True
        permitted_numbers = {entity_number(entity_id) for entity_id in permitted}
        return not permitted_numbers.isdisjoint(self._closure_numbers(entity_number(type_qid)))

    def _children_of(self, type_number: int) -> np.ndarray:
        low = int(np.searchsorted(self._parents_sorted, type_number, side="left"))
        high = int(np.searchsorted(self._parents_sorted, type_number, side="right"))
        return self._children_by_parent[low:high]

    def descendant_count(self, type_qid: Qid) -> int:
        """Count the classes reachable downward from ``type_qid``, itself included.

        The size of a class's reflexive subclass closure is its specificity
        measure: a smaller count means a more specific class. Counts are
        memoized per class; the count for a near-root class touches most of
        the taxonomy once (a few seconds) and is then cached. Cycles
        terminate through the visited set, mirroring the upward closure.
        """
        start = entity_number(type_qid)
        cached = self._descendant_count_cache.get(start)
        if cached is not None:
            return cached
        visited: set[int] = {start}
        frontier: list[int] = [start]
        while frontier:
            node = frontier.pop()
            for child in self._children_of(node):
                child_number = int(child)
                if child_number not in visited:
                    visited.add(child_number)
                    frontier.append(child_number)
        count = len(visited)
        self._descendant_count_cache[start] = count
        return count
