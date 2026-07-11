"""Cache tests: a warm cache makes ZERO calls to the inner transport and the
rerun's outputs are byte-identical except sidecar created_at."""

from __future__ import annotations

import json
from pathlib import Path

from atlas_tools.wikidata.cache import CachingTransport
from atlas_tools.wikidata.cards import emit_cards
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.properties import extract_properties
from atlas_tools.wikidata.transport import FixtureTransport

from tests.wikidata.conftest import CONFIG_PATH, RESPONSES


def _run_extract(cache_dir: Path, out_dir: Path) -> tuple[FixtureTransport, dict]:
    config = Config.load(CONFIG_PATH)
    inner = FixtureTransport(RESPONSES)
    transport = CachingTransport(inner, cache_dir, snapshot_date=config.snapshot_date)
    result = extract_properties(
        config, transport, checkpoint_path=out_dir / "checkpoint.json"
    )
    paths = emit_cards(result, config, out_dir)
    return inner, paths


def _without_created_at(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data.pop("created_at", None)
    return data


def test_warm_cache_rerun_makes_zero_transport_calls(tmp_path):
    cache_dir = tmp_path / "cache"
    inner1, paths1 = _run_extract(cache_dir, tmp_path / "run1")
    assert inner1.calls > 0

    inner2, paths2 = _run_extract(cache_dir, tmp_path / "run2")
    assert inner2.calls == 0  # every response served from disk

    # cards.jsonl is byte-identical (retrieved_at comes from cache metadata,
    # not the wall clock at emit time).
    assert paths1["cards"].read_bytes() == paths2["cards"].read_bytes()

    # Sidecars identical except the provenance created_at timestamp.
    for key in ("manifest", "inventory"):
        assert _without_created_at(paths1[key]) == _without_created_at(paths2[key])


def test_failed_responses_are_cached_too(tmp_path):
    # P9002 fails on both endpoints; those failures must be cached so the
    # rerun does not re-hit failing endpoints.
    cache_dir = tmp_path / "cache"
    _run_extract(cache_dir, tmp_path / "run1")
    inner2, _ = _run_extract(cache_dir, tmp_path / "run2")
    assert inner2.calls == 0


def test_cache_key_includes_snapshot_date(tmp_path):
    config = Config.load(CONFIG_PATH)
    cache_dir = tmp_path / "cache"

    from atlas_tools.wikidata.sparql import property_inventory_query, sparql_params

    inner1 = FixtureTransport(RESPONSES)
    t1 = CachingTransport(inner1, cache_dir, snapshot_date="2025-06-01")
    params = sparql_params(property_inventory_query())
    url = config.endpoints["wdqs"]
    t1.get(url, params)
    assert inner1.calls == 1
    t1.get(url, params)
    assert inner1.calls == 1  # warm

    # A different snapshot date must be a different cache key -> refetch.
    inner2 = FixtureTransport(RESPONSES)
    t2 = CachingTransport(inner2, cache_dir, snapshot_date="2025-07-01")
    t2.get(url, params)
    assert inner2.calls == 1
