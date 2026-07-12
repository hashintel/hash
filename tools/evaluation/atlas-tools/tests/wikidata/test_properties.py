"""Unit tests for inventory parsing, batching, exclusions, the example
ladder, diversity sampling, and the extraction checkpoint."""

from __future__ import annotations

import json

import pytest

from atlas_tools.wikidata.config import ExtractionConfig
from atlas_tools.wikidata.model import Constraints, Pid, PropertyRecord
from atlas_tools.wikidata.properties import (
    LadderSkip,
    LadderSuccess,
    PooledExampleRow,
    chunk_ids,
    exclusion_reason,
    extract_properties,
    fetch_example_rows,
    filter_example_rows,
    merge_closed_ancestors,
    sample_diverse_examples,
)
from atlas_tools.wikidata.sparql import (
    ExampleRow,
    example_pairs_query,
    parse_example_results,
    sparql_params,
)
from atlas_tools.wikidata.transport import FixtureTransport, Response, request_key
from tests.wikidata.conftest import RESPONSES


def _record(
    datatype: str = "wikibase-item", p31: tuple[str, ...] = ()
) -> PropertyRecord:
    return PropertyRecord(
        pid="P1", datatype=datatype, p31=p31, constraints=Constraints()
    )


def test_exclusion_reasons():
    extraction = ExtractionConfig()
    assert exclusion_reason(_record(), extraction) is None
    assert exclusion_reason(_record(datatype="external-id"), extraction) == (
        "datatype:external-id"
    )
    assert exclusion_reason(_record(p31=("Q18644435",)), extraction) == "maintenance"
    assert exclusion_reason(_record(p31=("Q18644427",)), extraction) == "deprecated"


def test_exclusion_class_lists_are_configurable():
    extraction = ExtractionConfig(maintenance_classes=("Q42",), deprecated_classes=())
    assert exclusion_reason(_record(p31=("Q42",)), extraction) == "maintenance"
    assert exclusion_reason(_record(p31=("Q18644435",)), extraction) is None


def test_chunk_ids_sorts_numerically_and_batches():
    ids = [f"P{i}" for i in range(1, 121)]
    chunks = chunk_ids(ids[::-1])  # shuffle-ish: reverse order in
    assert [len(chunk) for chunk in chunks] == [50, 50, 20]
    assert chunks[0][0] == "P1"
    assert chunks[0][-1] == "P50"
    assert chunks[2][-1] == "P120"
    # Numeric, not lexicographic: P9 sorts before P10.
    assert chunk_ids(["P10", "P9"])[0] == ["P9", "P10"]


def _rows(
    n_per_type: int, types: tuple[str, ...], *, stratum: int = 0
) -> list[PooledExampleRow]:
    return [
        PooledExampleRow(
            row=ExampleRow(
                subject_label=f"subject {subject_type}-{i}",
                object_label=f"object {subject_type}-{i}",
                subject_type=subject_type,
            ),
            stratum=stratum,
        )
        for subject_type in types
        for i in range(n_per_type)
    ]


def test_diverse_sampling_covers_distinct_subject_types_first():
    rows = _rows(5, ("Q1", "Q2", "Q3"))
    sampled = sample_diverse_examples(rows, count=3, seed=0, pid="P361")
    assert {example.subject_type for example in sampled} == {"Q1", "Q2", "Q3"}


def test_diverse_sampling_is_deterministic_and_dedupes():
    rows = _rows(4, ("Q1", "Q2")) * 2  # duplicates must not double-sample
    a = sample_diverse_examples(rows, count=6, seed=7, pid="P50")
    b = sample_diverse_examples(rows, count=6, seed=7, pid="P50")
    assert a == b
    assert len(a) == 6
    assert len({(e.subject_label, e.object_label) for e in a}) == 6


def test_sampling_spans_prominence_strata_before_types():
    """Seen live on P6: type-only round-robin let dozens of deep-stratum
    municipal micro-types crowd every country (one head-stratum type) out of
    the 8-example set. Strata are sampled round-robin FIRST, so every
    stratum lands examples before any stratum lands its second."""
    # Head stratum: 5 rows, ONE type (countries). Deep strata: 20 micro-types.
    head = _rows(5, ("Q6256",), stratum=0)
    deep_types_a = tuple(f"Q10{i:02d}" for i in range(10))
    deep_types_b = tuple(f"Q20{i:02d}" for i in range(10))
    pool = head + _rows(3, deep_types_a, stratum=1) + _rows(3, deep_types_b, stratum=2)

    sampled = sample_diverse_examples(pool, count=6, seed=0, pid="P6")
    assert len(sampled) == 6
    # Two full stratum rounds: each of the 3 strata contributes exactly 2.
    head_labels = {f"subject Q6256-{i}" for i in range(5)}
    from_head = sum(1 for example in sampled if example.subject_label in head_labels)
    from_a = sum(1 for example in sampled if example.subject_type in deep_types_a)
    from_b = sum(1 for example in sampled if example.subject_type in deep_types_b)
    assert (from_head, from_a, from_b) == (2, 2, 2)


def test_sampling_exhausted_stratum_yields_to_others():
    # A stratum with a single row contributes it, then the rest fill up.
    pool = _rows(1, ("Q6256",), stratum=0) + _rows(4, ("Q515",), stratum=1)
    sampled = sample_diverse_examples(pool, count=4, seed=0, pid="P6")
    assert len(sampled) == 4
    assert sum(1 for example in sampled if example.subject_type == "Q6256") == 1


def test_example_ladder_falls_back_to_wdqs(config, fixture_transport):
    # QLever is the first rung; the P9001 fixture times out there and is
    # rescued by WDQS (the ladder reversal is evidence-based, see config.py).
    outcome = fetch_example_rows("P9001", config.extraction, fixture_transport)
    assert isinstance(outcome, LadderSuccess)
    assert outcome.source == "wdqs"
    assert outcome.rows, "WDQS fixture rows expected"


def test_example_ladder_records_skip_when_both_fail(config, fixture_transport):
    outcome = fetch_example_rows("P9002", config.extraction, fixture_transport)
    assert isinstance(outcome, LadderSkip)


class RecordingTransport:
    """Scripted responses keyed by request; records request URLs in order."""

    def __init__(self, responses: dict[str, Response] | None = None):
        self._responses = responses or {}
        self.urls: list[str] = []

    def get(self, url, params=None) -> Response:
        self.urls.append(url)
        return self._responses.get(request_key(url, params), Response(status=500))


def test_ladder_order_follows_config_qlever_first(config):
    transport = RecordingTransport()  # every request fails -> full ladder walk
    outcome = fetch_example_rows("P361", config.extraction, transport)
    assert isinstance(outcome, LadderSkip)
    endpoints = config.extraction.endpoints
    assert transport.urls == [endpoints.qlever, endpoints.wdqs]


def test_ladder_order_is_configurable(config):
    extraction = config.extraction.model_copy(
        update={"example_endpoint_ladder": ("wdqs",)}
    )
    transport = RecordingTransport()
    outcome = fetch_example_rows("P361", extraction, transport)
    assert isinstance(outcome, LadderSkip)
    assert transport.urls == [extraction.endpoints.wdqs]  # qlever never probed


def _sparql_body(rows: list[tuple[str, str, str]]) -> bytes:
    bindings = []
    for subject_label, object_label, subject_type in rows:
        binding = {
            "subjectLabel": {"value": subject_label},
            "objectLabel": {"value": object_label},
        }
        if subject_type:
            binding["subjectType"] = {
                "value": f"http://www.wikidata.org/entity/{subject_type}"
            }
        bindings.append(binding)
    return json.dumps({"results": {"bindings": bindings}}).encode("utf-8")


def test_parse_of_empty_results_is_harmless():
    assert parse_example_results(b'{"results": {"bindings": []}}') == []


def test_empty_deep_offset_slices_contribute_nothing(config):
    # Geometric ladder: the deep slice is past the end of a small property
    # and returns an empty result; the pool is just the shallow slice.
    extraction = config.extraction.model_copy(update={"example_offsets": (0, 1000)})
    url = extraction.endpoints.qlever

    def key_for(offset: int) -> str:
        query = example_pairs_query(
            "P361",
            limit=extraction.example_pool_limit,
            offset=offset,
            language=extraction.primary_language,
        )
        return request_key(url, sparql_params(query))

    transport = RecordingTransport(
        {
            key_for(0): Response(
                status=200, body=_sparql_body([("Left Bank", "Paris", "Q515")])
            ),
            key_for(1000): Response(status=200, body=b'{"results":{"bindings":[]}}'),
        }
    )
    outcome = fetch_example_rows("P361", extraction, transport)
    assert isinstance(outcome, LadderSuccess)
    assert outcome.source == "qlever"
    assert len(outcome.rows) == 1
    assert transport.urls == [url, url]  # both offsets fetched, one endpoint


def test_sampler_dedupes_pairs_across_subject_types():
    # Seen live: the same (subject, object) pair arrives once per P31 type
    # of the subject; the card must not show it twice. First (highest
    # diversity rank) occurrence wins.
    rows = [
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Switzerland",
                object_label="Swiss Federal Council",
                subject_type="Q3624078",
            ),
            stratum=0,
        ),
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Switzerland",
                object_label="Swiss Federal Council",
                subject_type="Q6256",
            ),
            stratum=0,
        ),
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Uster",
                object_label="Town council",
                subject_type="Q6256",
            ),
            stratum=0,
        ),
    ]
    sampled = sample_diverse_examples(rows, count=8, seed=0, pid="P6")
    pairs = [(example.subject_label, example.object_label) for example in sampled]
    assert len(pairs) == len(set(pairs)) == 2
    assert pairs.count(("Switzerland", "Swiss Federal Council")) == 1


def test_checkpoint_replay_skips_ladder_probing(config, taxonomy, tmp_path):
    checkpoint_path = tmp_path / "checkpoint.json"

    transport1 = FixtureTransport(RESPONSES)
    result1 = extract_properties(
        config, transport1, taxonomy=taxonomy, checkpoint_path=checkpoint_path
    )
    # 1 inventory + 1 ancestors closure + 1 property batch + 1 label batch +
    # examples (qlever-first): P50/P361/P527/P9005 (1 each) + P9001 (2:
    # qlever fail + wdqs) + P9002 (2).
    assert transport1.calls == 12

    transport2 = FixtureTransport(RESPONSES)
    result2 = extract_properties(
        config, transport2, taxonomy=taxonomy, checkpoint_path=checkpoint_path
    )
    # Replay: P9001 goes straight to wdqs (1 call saved), P9002 is skipped
    # without probing either endpoint (2 calls saved).
    assert transport2.calls == 9
    assert result2.example_skips == result1.example_skips == ["P9002"]
    assert result2.example_fallbacks == result1.example_fallbacks == {"P9001": "wdqs"}
    assert (
        result2.example_filtered
        == result1.example_filtered
        == {
            "P361": 2,
            "P50": 4,
        }
    )
    assert [r.examples for r in result2.records] == [
        r.examples for r in result1.records
    ]


def test_stale_checkpoint_with_other_config_is_discarded(config, taxonomy, tmp_path):
    checkpoint_path = tmp_path / "checkpoint.json"
    extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=taxonomy,
        checkpoint_path=checkpoint_path,
    )

    other_extraction = config.extraction.model_copy(
        update={"seed": config.extraction.seed + 1}
    )
    other = config.model_copy(update={"extraction": other_extraction})
    transport = FixtureTransport(RESPONSES)
    extract_properties(
        other, transport, taxonomy=taxonomy, checkpoint_path=checkpoint_path
    )
    assert transport.calls == 12  # full probe again, checkpoint was stale


def test_filter_drops_untyped_and_violating_rows(taxonomy):
    """The P6-style reversed-statement scenario (live-verified: Q100151929,
    a person with EMPTY P31, is the SUBJECT of `P6 -> Q5114243` on live
    Wikidata — semantically inverted). Constraint filtering drops both the
    untyped subject and the wrongly-typed subject."""
    rows = (
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Cristesti", object_label="Mayor", subject_type="Q515"
            ),
            stratum=0,
        ),
        # Untyped subject (empty P31) — the reversed-statement signature.
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Pintili Vlad-Mihai",
                object_label="Cristesti",
                subject_type="",
            ),
            stratum=0,
        ),
        # A human as subject of a place-only property: wrongly typed.
        PooledExampleRow(
            row=ExampleRow(
                subject_label="Some Person",
                object_label="Somewhere",
                subject_type="Q5",
            ),
            stratum=1,
        ),
    )
    kept, dropped = filter_example_rows(
        rows, permitted=frozenset({Pid("Q486972")}), taxonomy=taxonomy
    )
    # Q515 (city) is subsumed by Q486972 (human settlement) via P279.
    assert [pooled.row.subject_label for pooled in kept] == ["Cristesti"]
    assert dropped == 2


def test_filter_is_reflexive_on_exact_type_match(taxonomy):
    rows = (
        PooledExampleRow(
            row=ExampleRow(
                subject_label="A Book", object_label="An Author", subject_type="Q571"
            ),
            stratum=0,
        ),
    )
    kept, dropped = filter_example_rows(
        rows, permitted=frozenset({Pid("Q571")}), taxonomy=taxonomy
    )
    assert len(kept) == 1 and dropped == 0


def test_unconstrained_properties_never_filter(config, taxonomy, fixture_transport):
    # End-to-end: P527 has no subject-type constraints; its untyped pool
    # rows (Car -> Engine) survive into the sampled examples.
    result = extract_properties(config, fixture_transport, taxonomy=taxonomy)
    p527 = next(record for record in result.records if record.pid == "P527")
    assert any(example.subject_label == "Car" for example in p527.examples)
    assert "P527" not in result.example_filtered


def test_fail_fast_without_taxonomy_when_filter_enabled(config, fixture_transport):
    with pytest.raises(RuntimeError, match="wikidata taxonomy"):
        extract_properties(config, fixture_transport, taxonomy=None)


def test_filter_disabled_needs_no_taxonomy(config, fixture_transport):
    extraction = config.extraction.model_copy(
        update={"filter_examples_by_subject_type": False}
    )
    relaxed = config.model_copy(update={"extraction": extraction})
    result = extract_properties(relaxed, fixture_transport, taxonomy=None)
    assert result.example_filtered == {}
    # Without the filter, P50 keeps its film-typed examples in the pool.
    p50 = next(record for record in result.records if record.pid == "P50")
    assert any(example.subject_type == "Q11424" for example in p50.examples)


def test_closed_ancestors_merge_order():
    record = PropertyRecord(
        pid=Pid("P50"),
        datatype="wikibase-item",
        ancestors=(Pid("P9005"),),  # direct parent, document order
    )
    closure = {Pid("P50"): (Pid("P9006"), Pid("P9005"), Pid("P50"))}
    # Self and duplicates dropped; closure extras follow in numeric order.
    assert merge_closed_ancestors(record, closure) == ("P9005", "P9006")


def test_closed_ancestors_cycle_safe():
    record = PropertyRecord(
        pid=Pid("P1"), datatype="wikibase-item", ancestors=(Pid("P2"),)
    )
    closure = {Pid("P1"): (Pid("P2"), Pid("P1"), Pid("P2"))}  # cycle back to self
    assert merge_closed_ancestors(record, closure) == ("P2",)
