"""Property-extraction unit tests.

Inventory parsing, batching, exclusions, the example ladder, stratified
example selection, and the extraction checkpoint.
"""

import json
from collections.abc import Mapping
from pathlib import Path

import pytest

from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.examples import (
    ExampleSelection,
    assign_stratum,
    collect_candidates,
    select_examples,
)
from atlas_tools.wikidata.model import Constraints, Pid, PropertyRecord, Qid
from atlas_tools.wikidata.properties import (
    LadderSkip,
    LadderSuccess,
    chunk_ids,
    exclusion_reason,
    extract_properties,
    fetch_example_rows,
    merge_closed_ancestors,
)
from atlas_tools.wikidata.sparql import (
    ExampleRow,
    example_pairs_query,
    parse_example_results,
    sparql_params,
)
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport, Response, request_key
from tests.wikidata.conftest import RESPONSES


def _record(datatype: str = "wikibase-item", p31: tuple[str, ...] = ()) -> PropertyRecord:
    return PropertyRecord(pid="P1", datatype=datatype, p31=p31, constraints=Constraints())


def test_exclusion_reasons() -> None:
    extraction = ExtractionConfig()
    assert exclusion_reason(_record(), extraction) is None
    assert exclusion_reason(_record(datatype="external-id"), extraction) == ("datatype:external-id")
    assert exclusion_reason(_record(p31=("Q18644435",)), extraction) == "maintenance"
    assert exclusion_reason(_record(p31=("Q18644427",)), extraction) == "deprecated"


def test_exclusion_class_lists_are_configurable() -> None:
    extraction = ExtractionConfig(maintenance_classes=("Q42",), deprecated_classes=())
    assert exclusion_reason(_record(p31=("Q42",)), extraction) == "maintenance"
    assert exclusion_reason(_record(p31=("Q18644435",)), extraction) is None


def test_chunk_ids_sorts_numerically_and_batches() -> None:
    ids = [f"P{i}" for i in range(1, 121)]
    chunks = chunk_ids(ids[::-1])  # shuffle-ish: reverse order in
    assert [len(chunk) for chunk in chunks] == [50, 50, 20]
    assert chunks[0][0] == "P1"
    assert chunks[0][-1] == "P50"
    assert chunks[2][-1] == "P120"
    # Numeric, not lexicographic: P9 sorts before P10.
    assert chunk_ids(["P10", "P9"])[0] == ["P9", "P10"]


# --- stratified example selection ---------------------------------------------

# city -> human settlement -> entity; book -> written work -> entity;
# film and human attach directly under entity (mirrors the fixture taxonomy).
_TAXONOMY = Taxonomy.from_edges(
    [
        (515, 486972),  # city -> human settlement
        (486972, 35120),
        (571, 47461344),  # book -> written work
        (47461344, 35120),
        (11424, 35120),  # film -> entity
        (5, 35120),  # human -> entity
    ]
)

SETTLEMENT = Qid("Q486972")
WRITTEN_WORK = Qid("Q47461344")


def _row(
    subject_qid: str,
    subject_label: str,
    object_qid: str,
    object_label: str,
    *,
    subject_type: str = "",
    subject_sitelinks: int = 0,
    object_sitelinks: int = 0,
) -> ExampleRow:
    return ExampleRow(
        subject_qid=subject_qid,
        object_qid=object_qid,
        subject_label=subject_label,
        object_label=object_label,
        subject_type=subject_type,
        subject_sitelinks=subject_sitelinks,
        object_sitelinks=object_sitelinks,
    )


def test_candidates_collapse_multiplied_rows() -> None:
    # Seen live: the same (subject, object) pair arrives once per P31 type
    # of the subject (Switzerland -> Swiss Federal Council under two
    # types); the candidate unions the types instead of duplicating.
    rows = [
        _row("Q39", "Switzerland", "Q30977", "Council", subject_type="Q3624078"),
        _row("Q39", "Switzerland", "Q30977", "Council", subject_type="Q6256"),
        _row("Q70", "Uster", "Q100", "Town council", subject_type="Q6256"),
    ]
    candidates = collect_candidates(rows)
    assert len(candidates) == 2
    assert candidates[0].subject_types == ("Q3624078", "Q6256")


def test_stratum_assignment_uses_subclass_closure() -> None:
    # The Mariupol scenario: the subject's P31 is a subclass (city), not
    # the constraint class itself (human settlement); without the closure
    # it would land in `other`.
    [candidate] = collect_candidates([_row("Q1", "Mariupol", "Q2", "Mayor", subject_type="Q515")])
    assert assign_stratum(candidate, (SETTLEMENT, WRITTEN_WORK), _TAXONOMY) == (SETTLEMENT)
    # Reflexive: a subject typed exactly as the constraint class matches.
    assert assign_stratum(candidate, (Qid("Q515"),), _TAXONOMY) == Qid("Q515")


def test_stratum_assignment_prefers_the_most_specific_class() -> None:
    # Constraint lists overlap at wildly different granularity (seen live
    # on P6: "political territorial entity" and "administrative
    # territorial entity" both subsume municipalities, and the broad class
    # absorbed everything). Among equally near classes the smallest
    # downward closure wins regardless of declaration order; the root
    # class stops stealing members.
    #
    # Depth tweak: Q515 sits two hops from both SETTLEMENT-PARENT and the
    # root in this fixture, so give it a direct edge to a broad and a
    # narrow class at the SAME depth.
    taxonomy = Taxonomy.from_edges(
        [
            (515, 486972),  # city -> human settlement (narrow)
            (515, 35120),  # city -> entity (broad), same hop distance
            (486972, 35120),
            (571, 35120),
        ]
    )
    [candidate] = collect_candidates([_row("Q1", "Mariupol", "Q2", "Mayor", subject_type="Q515")])
    root = Qid("Q35120")
    assert assign_stratum(candidate, (root, SETTLEMENT), taxonomy) == SETTLEMENT
    assert assign_stratum(candidate, (SETTLEMENT, root), taxonomy) == SETTLEMENT
    # Exact specificity ties fall back to declaration order.
    assert assign_stratum(candidate, (root, root), taxonomy) == root


def test_stratum_assignment_prefers_the_nearest_class() -> None:
    # The live P6 tangle: municipality chains upward into BOTH the
    # territorial-entity branch (2 hops) and, through local-government
    # classes, a "government" branch (3 hops) whose downward closure is
    # SMALLER. Closure size alone mis-files Boston under "government";
    # hop distance routes it to the territorial branch. Numeric cast:
    # 100=municipality, 200=territorial entity (big closure: many
    # children), 300=local government, 400=government (small closure).
    taxonomy = Taxonomy.from_edges(
        [
            (100, 200),  # municipality -> territorial entity
            (100, 300),  # municipality -> local government
            (300, 400),  # local government -> government
            # Fatten the territorial-entity closure so descendant_count
            # alone would pick "government".
            (201, 200),
            (202, 200),
            (203, 200),
            (204, 200),
        ]
    )
    territorial = Qid("Q200")
    government = Qid("Q400")
    assert taxonomy.descendant_count(government) < taxonomy.descendant_count(territorial)
    [candidate] = collect_candidates([_row("Q1", "Boston", "Q2", "Mayor", subject_type="Q100")])
    # Nearest wins in both declaration orders.
    assert assign_stratum(candidate, (government, territorial), taxonomy) == territorial
    assert assign_stratum(candidate, (territorial, government), taxonomy) == territorial


def test_taxonomy_hop_distance() -> None:
    assert _TAXONOMY.hop_distance(Qid("Q515"), Qid("Q515")) == 0  # reflexive
    assert _TAXONOMY.hop_distance(Qid("Q515"), SETTLEMENT) == 1
    assert _TAXONOMY.hop_distance(Qid("Q515"), Qid("Q35120")) == 2
    assert _TAXONOMY.hop_distance(Qid("Q515"), WRITTEN_WORK) is None  # other branch
    # Cycle-safe and shortest-path: a diamond with a long and a short arm.
    diamond = Taxonomy.from_edges([(1, 2), (2, 3), (3, 4), (1, 5), (5, 4), (4, 1)])
    assert diamond.hop_distance(Qid("Q1"), Qid("Q4")) == 2  # via Q5, not Q2-Q3


def test_tangled_strata_diagnostic() -> None:
    # Every candidate is subsumed by both classes: the co-match fraction
    # crosses the warning threshold and names the pair.
    taxonomy = Taxonomy.from_edges(
        [
            (100, 200),
            (100, 300),
            (300, 400),
            (201, 200),
        ]
    )
    territorial = Qid("Q200")
    government = Qid("Q400")
    rows = [
        _row(
            f"Q9{i}",
            f"Town {i}",
            f"Q8{i}",
            f"Mayor {i}",
            subject_type="Q100",
            subject_sitelinks=i,
        )
        for i in range(4)
    ]
    selection = select_examples(
        rows,
        constraint_classes=(territorial, government),
        taxonomy=taxonomy,
        count=2,
    )
    tangle = selection.tangled_strata
    assert tangle is not None
    first, second, fraction = tangle
    assert (first, second) == (territorial, government)
    assert fraction == 1.0

    # Disjoint branches never co-match: no tangle reported.
    clean = select_examples(
        _mixed_pool(),
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=4,
    )
    assert clean.tangled_strata is None


def _mixed_pool() -> list[ExampleRow]:
    return [
        _row(
            "Q11",
            "Left Bank",
            "Q12",
            "Paris",
            subject_type="Q515",
            subject_sitelinks=40,
            object_sitelinks=300,
        ),
        _row(
            "Q13",
            "Old Town",
            "Q14",
            "Prague",
            subject_type="Q515",
            subject_sitelinks=15,
            object_sitelinks=250,
        ),
        _row(
            "Q21",
            "Chapter One",
            "Q22",
            "Novel",
            subject_type="Q571",
            subject_sitelinks=2,
            object_sitelinks=8,
        ),
        # Typed outside both constraint classes -> `other`.
        _row(
            "Q31",
            "Opening Scene",
            "Q32",
            "Film",
            subject_type="Q11424",
            subject_sitelinks=3,
            object_sitelinks=12,
        ),
        # Untyped -> dropped (the reversed-statement signature).
        _row("Q41", "Some Person", "Q42", "Somewhere"),
    ]


def test_stratified_selection_covers_all_nonempty_strata() -> None:
    selection = select_examples(
        _mixed_pool(),
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=2,
    )
    # One slot per non-empty stratum before any stratum gets its second.
    assert [example.stratum for example in selection.examples] == [
        SETTLEMENT,
        WRITTEN_WORK,
    ]


def test_other_bucket_is_counted_but_never_selected() -> None:
    selection = select_examples(
        _mixed_pool(),
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=8,
    )
    labels = {example.subject_label for example in selection.examples}
    assert "Opening Scene" not in labels  # `other` while strata are non-empty
    assert "Some Person" not in labels  # untyped, dropped
    assert selection.other_candidates == 1
    assert selection.untyped_dropped == 1
    assert not selection.other_used
    assert selection.candidates == 5


def test_other_fallback_when_every_stratum_is_empty() -> None:
    rows = [
        _row(
            "Q31",
            "Opening Scene",
            "Q32",
            "Film",
            subject_type="Q11424",
            subject_sitelinks=3,
            object_sitelinks=12,
        ),
        _row("Q41", "Some Person", "Q42", "Somewhere"),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=4,
    )
    # A stale constraint list must not produce an example-less card, but
    # the fallback stays unstratified (no stratum prefix) and is flagged.
    assert [example.subject_label for example in selection.examples] == ["Opening Scene"]
    assert selection.examples[0].stratum is None
    assert selection.other_used
    assert selection.untyped_dropped == 1  # untyped stays dropped even here


def test_weighted_head_is_the_most_recognizable_pair() -> None:
    selection = select_examples(
        _mixed_pool(),
        constraint_classes=(SETTLEMENT,),
        taxonomy=_TAXONOMY,
        count=1,
    )
    # log1p(40)+log1p(300) > log1p(15)+log1p(250): Left Bank -> Paris wins.
    assert [example.subject_label for example in selection.examples] == ["Left Bank"]


def test_endpoint_dedup_across_the_whole_card() -> None:
    # A shared endpoint QID appears at most once on a card, even across
    # strata: each entity appears at most once per card.
    rows = [
        _row(
            "Q11",
            "Slovakia",
            "Q99",
            "Shared Object",
            subject_type="Q515",
            subject_sitelinks=50,
            object_sitelinks=90,
        ),
        _row(
            "Q21",
            "Chapter One",
            "Q99",
            "Shared Object",
            subject_type="Q571",
            subject_sitelinks=40,
            object_sitelinks=90,
        ),
        _row(
            "Q23",
            "Appendix",
            "Q24",
            "Field Guide",
            subject_type="Q571",
            subject_sitelinks=1,
            object_sitelinks=5,
        ),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=4,
    )
    object_qids = [example.object_qid for example in selection.examples]
    assert object_qids.count("Q99") == 1
    # The written-work stratum still lands an example via redistribution.
    assert [example.subject_label for example in selection.examples] == [
        "Slovakia",
        "Appendix",
    ]


def _settlement_rows(count: int) -> list[ExampleRow]:
    """Build ``count`` distinct settlement-stratum rows with tiny sitelinks."""
    return [
        _row(
            f"Q5{i:02d}1",
            f"Village {i:02d}",
            f"Q5{i:02d}2",
            f"Mayor {i:02d}",
            subject_type="Q515",
            subject_sitelinks=1,
            object_sitelinks=1,
        )
        for i in range(count)
    ]


def test_remainder_slots_are_dealt_round_robin() -> None:
    rows = [
        *_settlement_rows(3),
        _row(
            "Q21",
            "Chapter One",
            "Q22",
            "Novel",
            subject_type="Q571",
            subject_sitelinks=2,
            object_sitelinks=8,
        ),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=3,
    )
    strata = [example.stratum for example in selection.examples]
    # Guaranteed slot each; the leftover goes to the stratum that can
    # still take it (written work is exhausted at one candidate).
    assert strata.count(SETTLEMENT) == 2
    assert strata.count(WRITTEN_WORK) == 1


def test_dominant_stratum_is_capped_while_others_hold_candidates() -> None:
    # The P6 shape: one stratum holds nearly the whole extension. The
    # per-stratum cap keeps it from claiming the card; the small stratum
    # keeps its members instead of being crowded out.
    rows = [
        *_settlement_rows(20),
        _row(
            "Q21",
            "Chapter One",
            "Q22",
            "Novel",
            subject_type="Q571",
            subject_sitelinks=2,
            object_sitelinks=8,
        ),
        _row(
            "Q23",
            "Appendix",
            "Q24",
            "Field Guide",
            subject_type="Q571",
            subject_sitelinks=1,
            object_sitelinks=5,
        ),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=8,
    )
    strata = [example.stratum for example in selection.examples]
    # Written work is exhausted at 2; the cap holds settlement at 3, and
    # the relaxation phase spends the rest of the budget (8 = 5 + 3 is
    # unreachable with written work exhausted, so settlement relaxes past
    # the cap only after both were offered their capped share).
    assert strata.count(WRITTEN_WORK) == 2
    assert strata.count(SETTLEMENT) == 6


def test_single_stratum_relaxes_past_the_cap_to_fill_the_card() -> None:
    # The cap is fairness, not a ceiling: with nothing to be fair to, a
    # lone stratum fills the whole card.
    selection = select_examples(
        _settlement_rows(10),
        constraint_classes=(SETTLEMENT,),
        taxonomy=_TAXONOMY,
        count=8,
    )
    assert len(selection.examples) == 8


def test_extra_slots_spread_across_distinct_subject_classes() -> None:
    # Scale diversity inside one stratum: countries and villages are both
    # subsumed by the same constraint class, and log-weighting alone would
    # spend every slot on the heavier sub-population. The interleave
    # guarantees distinct direct P31 classes before repeats.
    country_edge = Taxonomy.from_edges(
        [
            (515, 486972),  # city -> human settlement
            (6256, 486972),  # country -> human settlement (fixture shorthand)
            (486972, 35120),
        ]
    )
    rows = [
        _row(
            "Q901",
            "Gabon",
            "Q902",
            "Prime Minister",
            subject_type="Q6256",
            subject_sitelinks=294,
            object_sitelinks=25,
        ),
        _row(
            "Q903",
            "France",
            "Q904",
            "Another Prime Minister",
            subject_type="Q6256",
            subject_sitelinks=300,
            object_sitelinks=40,
        ),
        _row(
            "Q907",
            "Spain",
            "Q908",
            "Third Prime Minister",
            subject_type="Q6256",
            subject_sitelinks=280,
            object_sitelinks=30,
        ),
        _row(
            "Q905",
            "Casefabre",
            "Q906",
            "Village Mayor",
            subject_type="Q515",
            subject_sitelinks=2,
            object_sitelinks=1,
        ),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT,),
        taxonomy=country_edge,
        count=3,
    )
    labels = [example.subject_label for example in selection.examples]
    # Head is the heaviest pair (France); the interleave then visits every
    # other P31 class before any class repeats, so the near-weightless
    # village claims slot two ahead of the second country. Under pure
    # weight ordering the card would be all countries.
    assert labels == ["France", "Casefabre", "Spain"]


def test_dominant_stratum_diagnostic() -> None:
    rows = [
        *_settlement_rows(9),
        _row(
            "Q21",
            "Chapter One",
            "Q22",
            "Novel",
            subject_type="Q571",
            subject_sitelinks=2,
            object_sitelinks=8,
        ),
    ]
    selection = select_examples(
        rows,
        constraint_classes=(SETTLEMENT, WRITTEN_WORK),
        taxonomy=_TAXONOMY,
        count=4,
    )
    dominant = selection.dominant_stratum
    assert dominant is not None
    stratum, fraction = dominant
    assert stratum == SETTLEMENT
    assert fraction == 0.9

    # A single-constraint property trivially holds everything: no signal.
    single = select_examples(
        _settlement_rows(9),
        constraint_classes=(SETTLEMENT,),
        taxonomy=_TAXONOMY,
        count=4,
    )
    assert single.dominant_stratum is None


def test_selection_is_deterministic() -> None:
    def run() -> ExampleSelection:
        return select_examples(
            _mixed_pool(),
            constraint_classes=(SETTLEMENT, WRITTEN_WORK),
            taxonomy=_TAXONOMY,
            count=3,
        )

    assert run() == run()


def test_unconstrained_selection_keeps_untyped_and_sets_no_stratum() -> None:
    selection = select_examples(
        _mixed_pool(),
        constraint_classes=(),
        taxonomy=_TAXONOMY,
        count=8,
    )
    assert selection.untyped_dropped == 0
    assert selection.other_candidates == 0
    labels = {example.subject_label for example in selection.examples}
    assert "Some Person" in labels  # untyped rows survive without constraints
    assert all(example.stratum is None for example in selection.examples)


def test_selection_without_taxonomy_is_unstratified() -> None:
    selection = select_examples(
        _mixed_pool(),
        constraint_classes=(SETTLEMENT,),
        taxonomy=None,  # filter_examples_by_subject_type: false
        count=8,
    )
    assert selection.untyped_dropped == 0
    assert all(example.stratum is None for example in selection.examples)


# --- example ladder ------------------------------------------------------------


def test_example_ladder_falls_back_to_wdqs(
    config: Config, fixture_transport: FixtureTransport
) -> None:
    # QLever is the first rung; the P9001 fixture times out there and is
    # rescued by WDQS (the ladder reversal is evidence-based, see config.py).
    outcome = fetch_example_rows("P9001", config.extraction, fixture_transport)
    assert isinstance(outcome, LadderSuccess)
    assert outcome.source == "wdqs"
    assert outcome.rows, "WDQS fixture rows expected"


def test_example_ladder_records_skip_when_both_fail(
    config: Config, fixture_transport: FixtureTransport
) -> None:
    outcome = fetch_example_rows("P9002", config.extraction, fixture_transport)
    assert isinstance(outcome, LadderSkip)


class RecordingTransport:
    """Scripted responses keyed by request; records request URLs in order."""

    def __init__(self, responses: dict[str, Response] | None = None) -> None:
        self._responses = responses or {}
        self.urls: list[str] = []

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        self.urls.append(url)
        return self._responses.get(request_key(url, params), Response(status=500))


def test_ladder_order_follows_config_qlever_first(config: Config) -> None:
    transport = RecordingTransport()  # every request fails -> full ladder walk
    outcome = fetch_example_rows("P361", config.extraction, transport)
    assert isinstance(outcome, LadderSkip)
    endpoints = config.extraction.endpoints
    assert transport.urls == [endpoints.qlever, endpoints.wdqs]


def test_ladder_order_is_configurable(config: Config) -> None:
    extraction = config.extraction.model_copy(update={"example_endpoint_ladder": ("wdqs",)})
    transport = RecordingTransport()
    outcome = fetch_example_rows("P361", extraction, transport)
    assert isinstance(outcome, LadderSkip)
    assert transport.urls == [extraction.endpoints.wdqs]  # qlever never probed


def _sparql_body(rows: list[tuple[str, str, str]]) -> bytes:
    """Build label-only bindings (no QIDs/sitelinks).

    This is the pre-v4 response shape, which the parser still accepts
    with defaults.
    """
    bindings = []
    for subject_label, object_label, subject_type in rows:
        binding = {
            "subjectLabel": {"value": subject_label},
            "objectLabel": {"value": object_label},
        }
        if subject_type:
            binding["subjectType"] = {"value": f"http://www.wikidata.org/entity/{subject_type}"}
        bindings.append(binding)
    return json.dumps({"results": {"bindings": bindings}}).encode("utf-8")


def test_parse_of_empty_results_is_harmless() -> None:
    assert parse_example_results(b'{"results": {"bindings": []}}') == []


def _full_binding(subject_uri: str, object_uri: str) -> dict:
    return {
        "subject": {"value": subject_uri},
        "object": {"value": object_uri},
        "subjectLabel": {"value": "subject label"},
        "objectLabel": {"value": "object label"},
    }


def test_parse_drops_non_item_endpoints_defensively() -> None:
    # Property pages carry truthy statements of their own (an external-ID
    # property stating its database's country). The query excludes them,
    # but the parser re-filters like parse_inventory_results does.
    entity = "http://www.wikidata.org/entity/"
    body = json.dumps(
        {
            "results": {
                "bindings": [
                    _full_binding(f"{entity}P8919", f"{entity}Q30"),  # property subject
                    _full_binding(f"{entity}L301", f"{entity}Q30"),  # lexeme subject
                    _full_binding(f"{entity}Q42", f"{entity}P8919"),  # property object
                    _full_binding(f"{entity}Q42", f"{entity}Q30"),  # item pair survives
                ]
            }
        }
    ).encode("utf-8")

    [row] = parse_example_results(body)
    assert row.subject_qid == "Q42"
    assert row.object_qid == "Q30"


def test_example_query_restricts_subjects_to_the_item_namespace() -> None:
    query = example_pairs_query("P17", limit=10, offset=0)
    # The filter must sit inside the inner subquery so the LIMIT/OFFSET
    # slice is taken over item-subject statements only.
    inner = query.split("SELECT ?subject ?object WHERE", 1)[1]
    inner = inner.split("LIMIT", 1)[0]
    assert 'FILTER(STRSTARTS(STR(?subject), "http://www.wikidata.org/entity/Q"))' in inner


def test_parse_of_label_only_bindings_defaults_ids_and_sitelinks() -> None:
    [row] = parse_example_results(_sparql_body([("Left Bank", "Paris", "Q515")]))
    assert row.subject_qid == ""
    assert row.object_qid == ""
    assert row.subject_sitelinks == 0
    assert row.object_sitelinks == 0
    assert row.subject_type == "Q515"


def test_empty_deep_offset_slices_contribute_nothing(config: Config) -> None:
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
            key_for(0): Response(status=200, body=_sparql_body([("Left Bank", "Paris", "Q515")])),
            key_for(1000): Response(status=200, body=b'{"results":{"bindings":[]}}'),
        }
    )
    outcome = fetch_example_rows("P361", extraction, transport)
    assert isinstance(outcome, LadderSuccess)
    assert outcome.source == "qlever"
    assert len(outcome.rows) == 1
    assert transport.urls == [url, url]  # both offsets fetched, one endpoint


# --- extraction checkpoint ------------------------------------------------------


def test_checkpoint_replay_skips_ladder_probing(
    config: Config, taxonomy: Taxonomy, tmp_path: Path
) -> None:
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
    # Untyped candidates dropped: P361 (Engine/Wheel), P50 (Anonymous
    # Manuscript). Typed-but-unmatched candidates land in `other` instead:
    # P361 (2 film pairs), P50 (2 film pairs + 1 human subject).
    assert result2.example_filtered == result1.example_filtered == {"P361": 2, "P50": 1}
    assert result2.example_other == result1.example_other == {"P361": 2, "P50": 3}
    assert result2.example_other_fallbacks == result1.example_other_fallbacks == []
    assert [r.examples for r in result2.records] == [r.examples for r in result1.records]


def test_stale_checkpoint_with_other_config_is_discarded(
    config: Config, taxonomy: Taxonomy, tmp_path: Path
) -> None:
    checkpoint_path = tmp_path / "checkpoint.json"
    extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=taxonomy,
        checkpoint_path=checkpoint_path,
    )

    other_extraction = config.extraction.model_copy(update={"seed": config.extraction.seed + 1})
    other = config.model_copy(update={"extraction": other_extraction})
    transport = FixtureTransport(RESPONSES)
    extract_properties(other, transport, taxonomy=taxonomy, checkpoint_path=checkpoint_path)
    assert transport.calls == 12  # full probe again, checkpoint was stale


def test_unconstrained_properties_never_filter(
    config: Config, taxonomy: Taxonomy, fixture_transport: FixtureTransport
) -> None:
    # End-to-end: P527 has no subject-type constraints; its untyped pool
    # rows (Car -> Engine) survive into the selected examples.
    result = extract_properties(config, fixture_transport, taxonomy=taxonomy)
    p527 = next(record for record in result.records if record.pid == "P527")
    assert any(example.subject_label == "Car" for example in p527.examples)
    assert "P527" not in result.example_filtered
    assert "P527" not in result.example_other


def test_fail_fast_without_taxonomy_when_filter_enabled(
    config: Config, fixture_transport: FixtureTransport
) -> None:
    with pytest.raises(RuntimeError, match="wikidata taxonomy"):
        extract_properties(config, fixture_transport, taxonomy=None)


def test_filter_disabled_needs_no_taxonomy(
    config: Config, fixture_transport: FixtureTransport
) -> None:
    extraction = config.extraction.model_copy(update={"filter_examples_by_subject_type": False})
    relaxed = config.model_copy(update={"extraction": extraction})
    result = extract_properties(relaxed, fixture_transport, taxonomy=None)
    assert result.example_filtered == {}
    assert result.example_other == {}
    # Without stratification, P50's film-typed candidates stay in the pool
    # (Synthetic Film -> Person 003 is its heaviest pair, so it is selected).
    p50 = next(record for record in result.records if record.pid == "P50")
    assert any(example.subject_type == "Q11424" for example in p50.examples)
    assert all(example.stratum is None for example in p50.examples)


# --- closed ancestors -----------------------------------------------------------


def test_closed_ancestors_merge_order() -> None:
    record = PropertyRecord(
        pid=Pid("P50"),
        datatype="wikibase-item",
        ancestors=(Pid("P9005"),),  # direct parent, document order
    )
    closure = {Pid("P50"): (Pid("P9006"), Pid("P9005"), Pid("P50"))}
    # Self and duplicates dropped; closure extras follow in numeric order.
    assert merge_closed_ancestors(record, closure) == ("P9005", "P9006")


def test_closed_ancestors_cycle_safe() -> None:
    record = PropertyRecord(pid=Pid("P1"), datatype="wikibase-item", ancestors=(Pid("P2"),))
    closure = {Pid("P1"): (Pid("P2"), Pid("P1"), Pid("P2"))}  # cycle back to self
    assert merge_closed_ancestors(record, closure) == ("P2",)
