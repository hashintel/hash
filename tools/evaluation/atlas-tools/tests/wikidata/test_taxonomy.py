"""Taxonomy artifact tests: in-memory BFS semantics on synthetic graphs
(diamond, cycle, disconnected), paged extraction with checkpoint resume,
and the committed fixture parquet."""

from __future__ import annotations

import json
from collections.abc import Mapping

import pyarrow.parquet as pq
import pytest

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Pid
from atlas_tools.wikidata.taxonomy import (
    Taxonomy,
    extract_taxonomy,
    parse_taxonomy_page,
    taxonomy_page_query,
)
from atlas_tools.wikidata.transport import Response, request_key
from tests.wikidata.conftest import CONFIG_PATH, TAXONOMY_PATH


class TestTaxonomySemantics:
    def test_diamond_closure(self):
        # 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4: both paths converge on 4.
        taxonomy = Taxonomy.from_edges([(1, 2), (1, 3), (2, 4), (3, 4)])
        assert taxonomy.closure(Pid("Q1")) == frozenset(
            {Pid("Q1"), Pid("Q2"), Pid("Q3"), Pid("Q4")}
        )
        assert taxonomy.is_subclass_of(Pid("Q1"), frozenset({Pid("Q4")}))
        assert not taxonomy.is_subclass_of(Pid("Q4"), frozenset({Pid("Q1")}))

    def test_cycle_terminates(self):
        # Wikidata P279 has real cycles; BFS must terminate.
        taxonomy = Taxonomy.from_edges([(1, 2), (2, 3), (3, 1)])
        assert taxonomy.closure(Pid("Q1")) == frozenset(
            {Pid("Q1"), Pid("Q2"), Pid("Q3")}
        )
        assert taxonomy.is_subclass_of(Pid("Q3"), frozenset({Pid("Q2")}))

    def test_disconnected_type_closure_is_itself(self):
        taxonomy = Taxonomy.from_edges([(1, 2)])
        assert taxonomy.closure(Pid("Q99")) == frozenset({Pid("Q99")})
        assert not taxonomy.is_subclass_of(Pid("Q99"), frozenset({Pid("Q2")}))

    def test_subsumption_is_reflexive(self):
        taxonomy = Taxonomy.from_edges([(1, 2)])
        assert taxonomy.is_subclass_of(Pid("Q1"), frozenset({Pid("Q1")}))

    def test_memoization_is_stable(self):
        taxonomy = Taxonomy.from_edges([(1, 2), (2, 3)])
        assert taxonomy.closure(Pid("Q1")) == taxonomy.closure(Pid("Q1"))

    def test_fixture_taxonomy_paths(self):
        taxonomy = Taxonomy.load(TAXONOMY_PATH)
        # Depth-2 chain: city -> human settlement -> entity.
        assert taxonomy.is_subclass_of(Pid("Q515"), frozenset({Pid("Q35120")}))
        # Film is NOT under book: the P50 filter relies on this.
        assert not taxonomy.is_subclass_of(Pid("Q11424"), frozenset({Pid("Q571")}))


class TestPageParsing:
    def test_query_contains_subquery_slice(self):
        query = taxonomy_page_query(limit=500_000, offset=1_000_000)
        assert "LIMIT 500000 OFFSET 1000000" in query
        assert "wdt:P279" in query
        assert "ORDER BY" not in query  # streaming-safe

    def test_parse_page_skips_non_item_rows(self):
        body = json.dumps(
            {
                "results": {
                    "bindings": [
                        {"child": {"value": "Q515"}, "parent": {"value": "Q486972"}},
                        {"child": {"value": "L1"}, "parent": {"value": "Q1"}},
                    ]
                }
            }
        ).encode("utf-8")
        page = parse_taxonomy_page(body)
        assert page.edges == ((515, 486972),)
        assert page.row_count == 2  # termination counts RAW rows


def _page_body(edges: list[tuple[int, int]]) -> bytes:
    bindings = [
        {"child": {"value": f"Q{child}"}, "parent": {"value": f"Q{parent}"}}
        for child, parent in edges
    ]
    return json.dumps({"results": {"bindings": bindings}}).encode("utf-8")


class PagedTransport:
    """Serves taxonomy pages keyed by request; counts calls; optional
    failure on a specific offset's first attempt (kill-and-resume tests)."""

    def __init__(
        self, pages: Mapping[str, Response], fail_keys: set[str] | None = None
    ):
        self._pages = dict(pages)
        self._fail_keys = set(fail_keys or ())
        self.calls = 0

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        self.calls += 1
        key = request_key(url, params)
        if key in self._fail_keys:
            self._fail_keys.discard(key)  # fail once, then recover
            return Response(status=503)
        return self._pages[key]


def _taxonomy_config(page_size: int) -> Config:
    config = Config.load(CONFIG_PATH)
    extraction = config.extraction.model_copy(update={"taxonomy_page_size": page_size})
    return config.model_copy(update={"extraction": extraction})


def _page_key(config: Config, *, page_size: int, offset: int) -> str:
    from atlas_tools.wikidata.sparql import sparql_params

    return request_key(
        config.extraction.endpoints.qlever,
        sparql_params(taxonomy_page_query(limit=page_size, offset=offset)),
    )


def _pages(config: Config, page_size: int) -> dict[str, Response]:
    # Page 0 full (3 edges), page 1 short (1 edge) -> termination.
    return {
        _page_key(config, page_size=page_size, offset=0): Response(
            status=200, body=_page_body([(1, 2), (2, 3), (3, 4)])
        ),
        _page_key(config, page_size=page_size, offset=page_size): Response(
            status=200, body=_page_body([(5, 4)])
        ),
    }


class TestExtraction:
    def test_paged_extraction_until_short_page(self, tmp_path):
        config = _taxonomy_config(page_size=3)
        transport = PagedTransport(_pages(config, 3))
        summary = extract_taxonomy(
            transport,
            config=config,
            out_path=tmp_path / "taxonomy.parquet",
            checkpoint_dir=tmp_path / "ckpt",
        )
        assert summary.edges == 4
        assert summary.pages == 2
        assert transport.calls == 2

        table = pq.read_table(tmp_path / "taxonomy.parquet")
        assert table.column("child").to_pylist() == [1, 2, 3, 5]
        assert table.column("parent").to_pylist() == [2, 3, 4, 4]

        sidecar = json.loads(
            (tmp_path / "taxonomy.parquet.meta.json").read_text(encoding="utf-8")
        )
        assert sidecar["details"]["edges"] == 4
        assert sidecar["details"]["pages"] == 2
        assert sidecar["details"]["page_size"] == 3

        taxonomy = Taxonomy.load(tmp_path / "taxonomy.parquet")
        assert taxonomy.is_subclass_of(Pid("Q1"), frozenset({Pid("Q4")}))

    def test_interrupted_extraction_resumes_identically(self, tmp_path):
        config = _taxonomy_config(page_size=3)

        baseline_dir = tmp_path / "baseline"
        extract_taxonomy(
            PagedTransport(_pages(config, 3)),
            config=config,
            out_path=baseline_dir / "taxonomy.parquet",
            checkpoint_dir=baseline_dir / "ckpt",
        )

        resumed_dir = tmp_path / "resumed"
        second_page_key = _page_key(config, page_size=3, offset=3)
        failing = PagedTransport(_pages(config, 3), fail_keys={second_page_key})
        with pytest.raises(RuntimeError, match="offset 3"):
            extract_taxonomy(
                failing,
                config=config,
                out_path=resumed_dir / "taxonomy.parquet",
                checkpoint_dir=resumed_dir / "ckpt",
            )
        assert not (resumed_dir / "taxonomy.parquet").exists()

        resume_transport = PagedTransport(_pages(config, 3))
        extract_taxonomy(
            resume_transport,
            config=config,
            out_path=resumed_dir / "taxonomy.parquet",
            checkpoint_dir=resumed_dir / "ckpt",
        )
        # Resume refetches only the missing page.
        assert resume_transport.calls == 1
        assert (resumed_dir / "taxonomy.parquet").read_bytes() == (
            baseline_dir / "taxonomy.parquet"
        ).read_bytes()

    def test_completed_run_reruns_with_zero_fetches(self, tmp_path):
        config = _taxonomy_config(page_size=3)
        extract_taxonomy(
            PagedTransport(_pages(config, 3)),
            config=config,
            out_path=tmp_path / "taxonomy.parquet",
            checkpoint_dir=tmp_path / "ckpt",
        )
        first_bytes = (tmp_path / "taxonomy.parquet").read_bytes()

        rerun_transport = PagedTransport({})
        summary = extract_taxonomy(
            rerun_transport,
            config=config,
            out_path=tmp_path / "taxonomy.parquet",
            checkpoint_dir=tmp_path / "ckpt",
        )
        assert rerun_transport.calls == 0  # complete marker: no fetches at all
        assert summary.edges == 4
        assert (tmp_path / "taxonomy.parquet").read_bytes() == first_bytes


def test_fixture_taxonomy_matches_generator_edges():
    table = pq.read_table(TAXONOMY_PATH)
    assert table.num_rows == 7
    edges = set(
        zip(
            table.column("child").to_pylist(),
            table.column("parent").to_pylist(),
            strict=True,
        )
    )
    assert (515, 486972) in edges
    assert (486972, 35120) in edges
