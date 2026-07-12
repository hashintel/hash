"""Unit tests for inventory parsing, batching, exclusions, the example
ladder, diversity sampling, and the extraction checkpoint."""

from __future__ import annotations

import json

from atlas_tools.wikidata.config import ExtractionConfig
from atlas_tools.wikidata.model import Constraints, PropertyRecord
from atlas_tools.wikidata.properties import (
    LadderSkip,
    LadderSuccess,
    chunk_ids,
    exclusion_reason,
    extract_properties,
    fetch_example_rows,
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


def _rows(n_per_type: int, types: tuple[str, ...]) -> list[ExampleRow]:
    return [
        ExampleRow(
            subject_label=f"subject {subject_type}-{i}",
            object_label=f"object {subject_type}-{i}",
            subject_type=subject_type,
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
        ExampleRow(
            subject_label="Switzerland",
            object_label="Swiss Federal Council",
            subject_type="Q3624078",
        ),
        ExampleRow(
            subject_label="Switzerland",
            object_label="Swiss Federal Council",
            subject_type="Q6256",
        ),
        ExampleRow(
            subject_label="Uster", object_label="Town council", subject_type="Q6256"
        ),
    ]
    sampled = sample_diverse_examples(rows, count=8, seed=0, pid="P6")
    pairs = [(example.subject_label, example.object_label) for example in sampled]
    assert len(pairs) == len(set(pairs)) == 2
    assert pairs.count(("Switzerland", "Swiss Federal Council")) == 1


def test_checkpoint_replay_skips_ladder_probing(config, tmp_path):
    checkpoint_path = tmp_path / "checkpoint.json"

    transport1 = FixtureTransport(RESPONSES)
    result1 = extract_properties(config, transport1, checkpoint_path=checkpoint_path)
    # 1 inventory + 1 property batch + 1 item batch + examples (qlever-first):
    # P50/P361/P527/P9005 (1 each) + P9001 (2: qlever fail + wdqs) + P9002 (2).
    assert transport1.calls == 11

    transport2 = FixtureTransport(RESPONSES)
    result2 = extract_properties(config, transport2, checkpoint_path=checkpoint_path)
    # Replay: P9001 goes straight to wdqs (1 call saved), P9002 is skipped
    # without probing either endpoint (2 calls saved).
    assert transport2.calls == 8
    assert result2.example_skips == result1.example_skips == ["P9002"]
    assert result2.example_fallbacks == result1.example_fallbacks == {"P9001": "wdqs"}
    assert [r.examples for r in result2.records] == [
        r.examples for r in result1.records
    ]


def test_stale_checkpoint_with_other_config_is_discarded(config, tmp_path):
    checkpoint_path = tmp_path / "checkpoint.json"
    extract_properties(
        config, FixtureTransport(RESPONSES), checkpoint_path=checkpoint_path
    )

    other_extraction = config.extraction.model_copy(
        update={"seed": config.extraction.seed + 1}
    )
    other = config.model_copy(update={"extraction": other_extraction})
    transport = FixtureTransport(RESPONSES)
    extract_properties(other, transport, checkpoint_path=checkpoint_path)
    assert transport.calls == 11  # full probe again, checkpoint was stale
