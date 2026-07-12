"""Cache tests: a warm cache makes ZERO calls to the inner transport and the
rerun's outputs are byte-identical except sidecar created_at."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path

from atlas_tools.wikidata.cache import CacheEntryMetadata, CachingTransport, cache_key
from atlas_tools.wikidata.cards import ExtractPaths, emit_cards
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.properties import extract_properties
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport, Response
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES, TAXONOMY_PATH


def _run_extract(
    cache_dir: Path, out_dir: Path
) -> tuple[FixtureTransport, ExtractPaths]:
    config = Config.load(CONFIG_PATH)
    inner = FixtureTransport(RESPONSES)
    transport = CachingTransport(
        inner, cache_dir, snapshot_date=config.extraction.snapshot_date
    )
    result = extract_properties(
        config,
        transport,
        taxonomy=Taxonomy.load(TAXONOMY_PATH),
        checkpoint_path=out_dir / "checkpoint.json",
    )
    paths = emit_cards(result, config, out_dir)
    return inner, paths


def _without_created_at(path: Path) -> dict[str, object]:
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
    assert (
        paths1.cards.cards_jsonl.read_bytes() == paths2.cards.cards_jsonl.read_bytes()
    )

    # Sidecars identical except the provenance created_at timestamp.
    assert _without_created_at(paths1.cards.manifest) == _without_created_at(
        paths2.cards.manifest
    )
    assert _without_created_at(paths1.records.inventory) == _without_created_at(
        paths2.records.inventory
    )


def test_failed_responses_are_cached_too(tmp_path):
    # P9002 fails on both endpoints; those failures must be cached so the
    # rerun does not re-hit failing endpoints.
    cache_dir = tmp_path / "cache"
    _run_extract(cache_dir, tmp_path / "run1")
    inner2, _ = _run_extract(cache_dir, tmp_path / "run2")
    assert inner2.calls == 0


class ScriptedTransport:
    """Returns scripted responses in order; counts calls."""

    def __init__(self, responses: list[Response]):
        self._responses = list(responses)
        self.calls = 0

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        self.calls += 1
        return self._responses.pop(0)


def test_transient_failures_are_never_cached(tmp_path):
    # A 429 must not be written to the cache: the next call goes back to the
    # inner transport and its success IS cached.
    inner = ScriptedTransport([Response(status=429), Response(status=200, body=b"ok")])
    transport = CachingTransport(inner, tmp_path / "cache", snapshot_date="d")

    assert transport.get("http://example.test").status == 429
    assert transport.get("http://example.test").status == 200
    assert inner.calls == 2
    # Warm now: the cached 200 is served without touching the inner transport.
    assert transport.get("http://example.test").status == 200
    assert inner.calls == 2


def test_poisoned_transient_cache_entry_is_evicted_and_refetched(tmp_path):
    # Entries cached by versions that stored 429s must self-heal on read.
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    key = cache_key("http://example.test", None, "d")
    (cache_dir / f"{key}.body").write_bytes(b"rate limited")
    (cache_dir / f"{key}.meta.json").write_text(
        CacheEntryMetadata(
            status=429,
            retrieved_at="2026-07-11T00:00:00+00:00",
            url="http://example.test",
            snapshot_date="d",
        ).model_dump_json()
    )

    inner = ScriptedTransport([Response(status=200, body=b"healed")])
    transport = CachingTransport(inner, cache_dir, snapshot_date="d")
    response = transport.get("http://example.test")
    assert response.status == 200
    assert response.body == b"healed"
    assert inner.calls == 1
    # The healed entry is cached; deterministic failures (500) stay cached
    # (test_failed_responses_are_cached_too covers that path).
    assert transport.get("http://example.test").status == 200
    assert inner.calls == 1


def test_cache_key_includes_snapshot_date(tmp_path):
    from atlas_tools.wikidata.sparql import property_inventory_query, sparql_params

    config = Config.load(CONFIG_PATH)
    cache_dir = tmp_path / "cache"

    inner1 = FixtureTransport(RESPONSES)
    transport1 = CachingTransport(inner1, cache_dir, snapshot_date="2025-06-01")
    params = sparql_params(property_inventory_query())
    url = config.extraction.endpoints.wdqs
    transport1.get(url, params)
    assert inner1.calls == 1
    transport1.get(url, params)
    assert inner1.calls == 1  # warm

    # A different snapshot date must be a different cache key -> refetch.
    inner2 = FixtureTransport(RESPONSES)
    transport2 = CachingTransport(inner2, cache_dir, snapshot_date="2025-07-01")
    transport2.get(url, params)
    assert inner2.calls == 1
