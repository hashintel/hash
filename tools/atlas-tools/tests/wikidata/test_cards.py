"""Golden card tests (pinned hashes) plus card format v5 unit tests.

Covers phrases, sentence splitters, truncation passes, and untitled
records, all offline against committed fixtures. The sentence splitter
under test is always ``naive`` except one guarded punkt test that skips
when the punkt_tab data is missing.
"""

import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.relation_cards.common.card import IdentifierLeakError, Phrase, slugify
from atlas_tools.relation_cards.common.model import PhraseInput
from atlas_tools.relation_cards.common.sentence import (
    NaiveSentenceSplitter,
    PunktSentenceSplitter,
    make_sentence_splitter,
)
from atlas_tools.relation_cards.common.tokens import HeuristicTokenCounter, make_token_counter
from atlas_tools.relation_cards.wikidata.card import (
    Card,
    build_card,
)
from atlas_tools.relation_cards.wikidata.cards import (
    ProseSanitizationBudgetError,
    emit_cards,
    render_cards,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import (
    Constraints,
    EntityId,
    EntityLabel,
    Example,
    Pid,
    PropertyRecord,
    Qid,
)
from atlas_tools.wikidata.properties import ExtractionResult, extract_properties
from atlas_tools.wikidata.records import load_records
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import FixtureTransport
from tests.wikidata.conftest import CONFIG_PATH, RESPONSES, TAXONOMY_PATH

# Pinned golden digests: sha256 of the UTF-8 card text bytes, generated once
# from the committed fixtures. Any change to the card format, the fixtures,
# or the truncation/sampling logic must be a conscious re-pin.
# P50 re-pinned for the deterministic scale-diverse selection (weight
# order replaced the seeded draws, so its book examples now come
# recognizability-descending). P361 was unchanged by that switch: its
# picks and order survive both selection schemes.
P361_CARD_HASH = "648c35614c1c463295a25c5ab2ec54514236d881138d2c9221ce3e4aa1c57bfa"
P50_CARD_HASH = "dd11d49c6803928e46d8db14d6dc3c5015000aefa27d48d269726a213e2eb0ab"

FIXTURE_DATE = "2025-06-01T00:00:00+00:00"

EN = LanguageAlpha2("en")


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory: pytest.TempPathFactory) -> SimpleNamespace:
    config = Config.load(CONFIG_PATH)
    result = extract_properties(
        config,
        FixtureTransport(RESPONSES),
        taxonomy=Taxonomy.load(TAXONOMY_PATH),
    )
    out_dir = tmp_path_factory.mktemp("cards_out")
    paths = emit_cards(result, config, out_dir)
    rows = {}
    with paths.cards.cards_jsonl.open(encoding="utf-8") as cards_file:
        for line in cards_file:
            row = json.loads(line)
            rows[row["pid"]] = row
    with paths.cards.manifest.open(encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    with paths.records.inventory.open(encoding="utf-8") as inventory_file:
        inventory = json.load(inventory_file)
    return SimpleNamespace(
        config=config,
        result=result,
        paths=paths,
        rows=rows,
        manifest=manifest,
        inventory=inventory,
    )


class TestGoldenCards:
    def test_p361_and_p50_cards_are_byte_stable(self, pipeline: SimpleNamespace) -> None:
        assert pipeline.rows["P361"]["card_hash"] == P361_CARD_HASH
        assert pipeline.rows["P50"]["card_hash"] == P50_CARD_HASH
        for pid in ("P361", "P50"):
            row = pipeline.rows[pid]
            digest = hashlib.sha256(row["card_text"].encode("utf-8")).hexdigest()
            assert digest == row["card_hash"]

    def test_rerun_is_byte_identical(self, pipeline: SimpleNamespace, tmp_path: Path) -> None:
        config = Config.load(CONFIG_PATH)
        result = extract_properties(
            config,
            FixtureTransport(RESPONSES),
            taxonomy=Taxonomy.load(TAXONOMY_PATH),
        )
        paths = emit_cards(result, config, tmp_path)
        assert paths.cards.cards_jsonl.read_bytes() == pipeline.paths.cards.cards_jsonl.read_bytes()

    def test_cards_are_text_not_json(self, pipeline: SimpleNamespace) -> None:
        for row in pipeline.rows.values():
            assert row["card_text"].startswith("Relation: ")
            with pytest.raises(json.JSONDecodeError):
                json.loads(row["card_text"])

    def test_v5_block_structure(self, pipeline: SimpleNamespace) -> None:
        text = pipeline.rows["P361"]["card_text"]
        assert text.endswith("\n")
        assert not text.endswith("\n\n")
        assert "\n\nConstraints:\n  - symmetric? no\n" in text
        assert "Aliases:\n  - contained within\n  - component of" in text
        assert "\n\nExamples:\n  - human settlement: Left Bank -> Paris\n" in text
        assert "Target types:" in text
        assert "Destination types:" not in text
        assert text.rstrip().endswith("Slug: part-of")

    def test_examples_grouped_by_stratum_with_label_prefixes(
        self, pipeline: SimpleNamespace
    ) -> None:
        # P361 declares two subject-type constraint classes; the card
        # covers both strata, grouped and prefixed with the class labels.
        examples = _card_examples(pipeline.rows["P361"]["card_text"])
        assert examples == [
            "human settlement: Left Bank -> Paris",
            "human settlement: Old Town -> Prague",
            "written work: Chapter One -> Synthetic Novel",
            "written work: Appendix -> Field Guide",
        ]

    def test_endpoint_dedup_one_paris_per_card(self, pipeline: SimpleNamespace) -> None:
        # P527's pool holds two Paris-subject pairs; endpoint dedup keeps
        # exactly one (and P361's second Paris pair loses to the first).
        for pid in ("P361", "P527"):
            text = pipeline.rows[pid]["card_text"]
            assert text.count("Paris") == 1, pid
        assert "Montmartre" not in pipeline.rows["P527"]["card_text"]

    def test_unstratified_cards_render_bare_examples(self, pipeline: SimpleNamespace) -> None:
        # P527 has no subject-type constraints: no stratum prefixes.
        for example in _card_examples(pipeline.rows["P527"]["card_text"]):
            assert ": " not in example, example

    def test_token_budget_respected_with_heuristic_counter(self, pipeline: SimpleNamespace) -> None:
        counter = make_token_counter(pipeline.config.cards.tokenizer)
        assert counter.name == "heuristic"
        for row in pipeline.rows.values():
            assert row["token_count"] <= pipeline.config.cards.token_budget
            assert counter.count(row["card_text"]) == row["token_count"]
            assert row["truncations"] == []  # fixture cards fit comfortably

    def test_inverse_linkage_names_both_directions(self, pipeline: SimpleNamespace) -> None:
        assert (
            "Inverse Name: has part (this item has the listed part)"
            in pipeline.rows["P361"]["card_text"]
        )
        assert (
            "Inverse Name: part of (this item is a part of that item)"
            in pipeline.rows["P527"]["card_text"]
        )

    def test_missing_inverse_renders_explicit_fallback(self, pipeline: SimpleNamespace) -> None:
        # Inverse-less relations say so explicitly rather than omitting the
        # line: absence is signal, not ambiguity (P50 author has no inverse
        # in the fixtures).
        assert "Inverse Name: none recorded" in pipeline.rows["P50"]["card_text"]

    def test_no_wikidata_identifiers_in_any_card_text(self, pipeline: SimpleNamespace) -> None:
        # PIDs/QIDs are a non-transferable lexical feature; the pid lives
        # only in JSONL/manifest metadata.
        identifier = re.compile(r"(?<![A-Za-z0-9])[PQ][0-9]+")
        for pid, row in pipeline.rows.items():
            assert pid not in row["card_text"], pid
            match = identifier.search(row["card_text"])
            assert match is None, f"{pid}: identifier {match.group() if match else ''}"

    def test_retrieved_at_comes_from_response_metadata(self, pipeline: SimpleNamespace) -> None:
        # The fixture Date header, not the wall clock at emit time.
        assert pipeline.rows["P361"]["retrieved_at"] == FIXTURE_DATE

    def test_rows_record_main_value_scope_filter(self, pipeline: SimpleNamespace) -> None:
        assert {row["scope_filter"] for row in pipeline.rows.values()} == {"main-value-only"}

    def test_manifest_hashes_match_rows(self, pipeline: SimpleNamespace) -> None:
        details = pipeline.manifest["details"]
        assert details["card_format_version"] == 6
        assert details["scope_filter"] == "main-value-only"
        assert details["sentence_splitter"] == "naive"
        assert details["untitled"] == []
        assert details["counts"]["untitled"] == 0
        for pid, row in pipeline.rows.items():
            assert details["cards"][pid]["card_hash"] == row["card_hash"]


class TestExclusions:
    def test_p212_excluded_from_inventory_by_datatype(self, pipeline: SimpleNamespace) -> None:
        details = pipeline.inventory["details"]
        assert details["excluded"]["P212"] == "datatype:ExternalId"
        assert "P212" not in details["retained"]
        assert "P212" not in pipeline.rows

    def test_maintenance_and_deprecated_properties_excluded(
        self, pipeline: SimpleNamespace
    ) -> None:
        details = pipeline.inventory["details"]
        assert details["excluded"]["P9003"] == "deprecated"
        assert details["excluded"]["P9004"] == "maintenance"
        assert "P9003" not in pipeline.rows
        assert "P9004" not in pipeline.rows

    def test_qualifier_scoped_property_excluded(self, pipeline: SimpleNamespace) -> None:
        # P9007's property-scope constraint omits "as main value": it is
        # statement metadata, so it never becomes a card (its example
        # pairs would be property-misuse noise). No example-ladder fixture
        # exists for it, so a regression here fails loudly on the probe.
        details = pipeline.inventory["details"]
        assert details["excluded"]["P9007"] == "qualifier-scoped"
        assert "P9007" not in details["retained"]
        assert "P9007" not in pipeline.rows

    def test_usage_count_never_appears_in_card_text(self, pipeline: SimpleNamespace) -> None:
        # Usage is diagnostic metadata only (P361 fixture usage = 500000).
        assert "500000" not in pipeline.rows["P361"]["card_text"]


class TestClosedAncestors:
    """Cards carry the full subproperty closure, not just direct parents.

    A card states every generalization of its relation. P50's fixture
    chain is P50 -P1647-> P9005 -P1647-> P9006.
    """

    def test_p50_records_carry_the_closed_set(self, pipeline: SimpleNamespace) -> None:
        p50 = next(r for r in pipeline.result.records if r.pid == "P50")
        # Direct parent (document order) first, closure member after.
        assert p50.ancestors == ("P9005", "P9006")

    def test_p50_card_prints_the_grandparent(self, pipeline: SimpleNamespace) -> None:
        text = pipeline.rows["P50"]["card_text"]
        assert (
            "creative contributor (synthetic ancestor property for creative"
            " contribution relations)" in text
        )
        assert (
            "abstract involvement (synthetic grandparent property for"
            " involvement relations)" in text
        )
        assert text.index("creative contributor") < text.index("abstract involvement")

    def test_non_retained_ancestor_label_resolved(self, pipeline: SimpleNamespace) -> None:
        # P9006 is not in the inventory; its label rides the wbgetentities
        # label batch and still renders identifier-free.
        assert "P9006" not in pipeline.rows["P50"]["card_text"]
        assert "abstract involvement" in pipeline.rows["P9005"]["card_text"]


class TestSubjectTypeStratification:
    """Untyped candidates drop; unmatched typed ones land in `other`.

    Reversed statements live in the long tail (live-verified: Q100151929,
    a person with an empty P31, appears as the subject of P6, which is
    semantically inverted). Under stratification, untyped candidates are
    dropped and typed candidates outside every constraint class land in
    the diagnostic `other` bucket; see test_properties for the selection
    unit tests.
    """

    def test_filtered_and_other_counts_recorded_in_manifest_flags(
        self, pipeline: SimpleNamespace
    ) -> None:
        flags = pipeline.manifest["details"]["flags"]
        # Untyped candidates dropped: P361 (Engine, Wheel), P50 (Anonymous
        # Manuscript).
        assert flags["example_rows_filtered"] == {"P361": 2, "P50": 1}
        # Typed candidates outside every constraint class: P361 (2 film
        # pairs), P50 (2 film pairs + 1 human subject).
        assert flags["example_other_candidates"] == {"P361": 2, "P50": 3}
        assert flags["example_other_fallbacks"] == []

    def test_p50_examples_are_all_book_subjects(self, pipeline: SimpleNamespace) -> None:
        text = pipeline.rows["P50"]["card_text"]
        for dropped_subject in (
            "Synthetic Film ->",
            "Concert Film ->",
            "Anonymous Manuscript ->",
            "Some Human ->",
        ):
            assert dropped_subject not in text

    def test_unconstrained_property_keeps_untyped_rows(self, pipeline: SimpleNamespace) -> None:
        # P527 has no subject-type constraints: its untyped rows survive.
        assert "Car -> Engine" in pipeline.rows["P527"]["card_text"]


class TestExampleLadder:
    def test_qlever_timeout_falls_back_to_wdqs(self, pipeline: SimpleNamespace) -> None:
        flags = pipeline.manifest["details"]["flags"]
        assert flags["example_ladder_fallbacks"] == {"P9001": "wdqs"}
        assert "Examples:" in pipeline.rows["P9001"]["card_text"]

    def test_both_endpoints_failing_records_skip_flag(self, pipeline: SimpleNamespace) -> None:
        details = pipeline.manifest["details"]
        assert details["flags"]["example_ladder_skips"] == ["P9002"]
        assert details["counts"]["example_skips"] == 1
        assert "Examples:" not in pipeline.rows["P9002"]["card_text"]


class TestUntitledRecords:
    def test_build_card_returns_none_without_primary_language_title(self) -> None:
        record = PropertyRecord(
            pid=Pid("P9998"),
            datatype="wikibase-item",
            labels={LanguageAlpha2("de"): "nur Deutsch"},  # no en title
        )
        card = build_card(
            record=record,
            labels={},
            config=_config(BIG, BIG),
            counter=HeuristicTokenCounter(),
            splitter=NaiveSentenceSplitter(),
        )
        assert card is None

    def test_untitled_records_skipped_and_counted_in_manifest(
        self, pipeline: SimpleNamespace, tmp_path: Path
    ) -> None:
        record_set = load_records(pipeline.paths.records.records_jsonl.parent)
        record_set.records.append(
            PropertyRecord(
                pid=Pid("P9998"),
                datatype="wikibase-item",
                labels={LanguageAlpha2("de"): "nur Deutsch"},
            )
        )
        paths = render_cards(record_set, pipeline.config, tmp_path)
        manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
        assert manifest["details"]["untitled"] == ["P9998"]
        assert manifest["details"]["counts"]["untitled"] == 1
        pids = [
            json.loads(line)["pid"]
            for line in paths.cards_jsonl.read_text(encoding="utf-8").splitlines()
        ]
        assert "P9998" not in pids
        assert len(pids) == manifest["details"]["counts"]["cards"]


class TestProseSanitizationDiagnostics:
    """Sentence drops are measured in the manifest and gated by config.

    P212 sits in the fixture exclusion table (external-ID), so a prose
    mention of it is membership-confirmed as an identifier even though it
    has no label to substitute: its sentence drops and the manifest says
    exactly what happened.
    """

    @staticmethod
    def _extraction_with_description(description: str) -> tuple[Config, ExtractionResult]:
        config = Config.load(CONFIG_PATH)
        result = extract_properties(
            config,
            FixtureTransport(RESPONSES),
            taxonomy=Taxonomy.load(TAXONOMY_PATH),
        )
        record = next(record for record in result.records if record.pid == "P361")
        record.descriptions[EN] = description
        return config, result

    def test_clean_fixtures_report_zero_sanitization_activity(
        self, pipeline: SimpleNamespace
    ) -> None:
        totals = pipeline.manifest["details"]["prose_sanitization"]
        assert totals["fields_sanitized"] > 0
        assert totals["fields_emptied"] == 0
        assert totals["substitutions"] == 0
        assert totals["dropped_sentences"] == 0
        assert totals["dropped_tokens"] == {}
        assert totals["substituted_tokens"] == {}
        assert totals["removed_urls"] == {}
        assert totals["unknown_tokens"] == {}
        assert totals["known_tokens_retained"] == {}

    def test_dropped_sentences_are_counted_per_card_and_per_corpus(self, tmp_path: Path) -> None:
        def test_dropped_sentences_are_counted_per_card_and_per_corpus(
            self, tmp_path: Path
        ) -> None:
            config, result = self._extraction_with_description(
                "this item is a part of that item. Use P212 instead."
            )
            paths = emit_cards(result, config, tmp_path)
            manifest = json.loads(paths.cards.manifest.read_text(encoding="utf-8"))
            totals = manifest["details"]["prose_sanitization"]
            assert totals["dropped_sentences"] == 1
            assert totals["dropped_tokens"] == {"P212": 1}
            assert totals["fields_emptied"] == 0
            per_card = manifest["details"]["cards"]["P361"]["sanitization"]
            assert per_card["dropped_sentences"] == 1
            assert per_card["dropped_tokens"] == {"P212": 1}

        def test_urls_are_stripped_from_prose_and_counted(self, tmp_path: Path) -> None:
            # P1060's shape: a trailing link-out to a source ontology. The URL
            # goes; the gloss before it stays; the linter's URL backstop stays
            # quiet.
            url = "http://purl.obolibrary.org/obo/RO_0002451"
            config, result = self._extraction_with_description(
                f'this item is a part of that item, equivalent to "part of" in the ontology {url}'
            )
            paths = emit_cards(result, config, tmp_path)
            rows = {
                json.loads(line)["pid"]: json.loads(line)
                for line in paths.cards.cards_jsonl.read_text(encoding="utf-8").splitlines()
            }
            text = rows["P361"]["card_text"]
            assert "http" not in text
            assert 'equivalent to "part of" in the ontology' in text
            totals = json.loads(paths.cards.manifest.read_text(encoding="utf-8"))["details"][
                "prose_sanitization"
            ]
            assert totals["removed_urls"] == {url: 1}
            assert totals["fields_emptied"] == 0

    def test_emptied_field_over_budget_fails_the_run(self, tmp_path: Path) -> None:
        # The whole description is one confirmed-identifier sentence, so
        # sanitization empties the field; a zero budget must refuse it.
        config, result = self._extraction_with_description("Use P212 instead.")
        config.cards.max_prose_field_empty_fraction = 0.0
        with pytest.raises(ProseSanitizationBudgetError, match="P212"):
            emit_cards(result, config, tmp_path)

    def test_lint_failures_name_the_failing_card(self, tmp_path: Path) -> None:
        # Titles are never rewritten, so a known id there reaches the
        # linter; a corpus-stopping error must say which card died (a
        # bare "forbidden source identifier" cost a live run its triage).
        config = Config.load(CONFIG_PATH)
        result = extract_properties(
            config,
            FixtureTransport(RESPONSES),
            taxonomy=Taxonomy.load(TAXONOMY_PATH),
        )
        record = next(record for record in result.records if record.pid == "P361")
        record.labels[EN] = "part of (see P361)"

        with pytest.raises(IdentifierLeakError, match="^P361: "):
            emit_cards(result, config, tmp_path)


# --- crafted records for truncation tests -------------------------------------

LABELS: dict[EntityId, EntityLabel] = {
    Pid("P527"): EntityLabel(label="has part", description="this item has the listed part"),
    Pid("P1000"): EntityLabel(
        label="umbrella relation",
        description="Lead sentence of the ancestor description."
        " Expendable ancestor detail sentence.",
    ),
    Qid("Q1"): EntityLabel(
        label="alpha type",
        description="Lead alpha sentence. Expendable alpha detail.",
    ),
    Qid("Q2"): EntityLabel(
        label="beta type",
        description="Lead beta sentence. Expendable beta detail.",
    ),
}

BIG = 10_000_000


def _crafted_record(n_examples: int) -> PropertyRecord:
    return PropertyRecord(
        pid=Pid("P9999"),
        datatype="wikibase-item",
        labels={EN: "test relation"},
        descriptions={EN: "a synthetic relation used to exercise truncation"},
        aliases={EN: ["test rel"]},
        ancestors=(Pid("P1000"),),
        inverse_pid=Pid("P527"),
        constraints=Constraints(subject_types=(Qid("Q1"),), value_types=(Qid("Q2"),)),
        examples=[
            Example(
                subject_label=f"Subject Item Number {i:02d} With A Long Label",
                object_label=f"Object Item Number {i:02d} With A Long Label",
                subject_type=f"Q{100 + i}",
            )
            for i in range(n_examples)
        ],
    )


def _config(token_budget: int, hard_token_budget: int) -> Config:
    return Config.model_validate(
        {
            "extraction": {"languages": ["en"]},
            "cards": {
                "tokenizer": "heuristic",
                "sentence_splitter": "naive",
                "token_budget": token_budget,
                "hard_token_budget": hard_token_budget,
            },
        }
    )


def _build(record: PropertyRecord, config: Config) -> Card:
    card = build_card(
        record=record,
        labels=LABELS,
        config=config,
        counter=HeuristicTokenCounter(),
        splitter=NaiveSentenceSplitter(),
    )
    assert card is not None
    return card


def _card_examples(card_text: str) -> list[str]:
    """Extract the bullet contents of the Examples block only."""
    examples: list[str] = []
    in_examples = False
    for line in card_text.splitlines():
        if line == "Examples:":
            in_examples = True
        elif in_examples and line.startswith("  - "):
            examples.append(line[4:])
        elif in_examples and not line.strip():
            break
    return examples


class TestTruncation:
    def test_examples_dropped_from_end_and_recorded(self) -> None:
        record = _crafted_record(10)
        full = _build(record, _config(BIG, BIG))
        assert full.truncations == []

        budget = full.token_count - 25  # forces at least one example drop
        card = _build(record, _config(budget, BIG))
        assert card.token_count <= budget

        dropped = [label for label in card.truncations if label.startswith("example[")]
        assert dropped, "expected at least one dropped example"
        kept = 10 - len(dropped)
        # Dropped from the end: rank 9 first, then 8, ...
        assert dropped == [f"example[{i}]" for i in range(9, kept - 1, -1)]
        # Survivors are exactly the highest-diversity-rank prefix, in order.
        expected = [f"{ex.subject_label} -> {ex.object_label}" for ex in record.examples[:kept]]
        assert _card_examples(card.card_text) == expected
        assert not card.severely_truncated  # only a few examples lost

    def test_soft_passes_strip_details_and_keep_one_example(self) -> None:
        # An impossible soft budget: every soft pass runs to exhaustion, but
        # the ancestors section survives (it is dropped only above the hard
        # budget) and at least one example is always preserved.
        record = _crafted_record(10)
        card = _build(record, _config(1, BIG))
        assert len(_card_examples(card.card_text)) == 1
        assert "ancestor_details" in card.truncations
        assert "source_type_details" in card.truncations
        assert "target_type_details" in card.truncations
        assert "ancestors_section" not in card.truncations
        # Leads survive detail stripping; details are gone.
        assert "Lead sentence of the ancestor description." in card.card_text
        assert "Expendable ancestor detail" not in card.card_text
        assert "Lead alpha sentence." in card.card_text
        assert "Expendable alpha detail" not in card.card_text
        assert "Lead beta sentence." in card.card_text
        assert "Expendable beta detail" not in card.card_text
        # 9 of 10 examples dropped -> severe by the >50% rule.
        assert card.severely_truncated

    def test_ancestors_section_dropped_only_above_hard_budget(self) -> None:
        record = _crafted_record(10)
        card = _build(record, _config(1, 1))
        assert "example_section" in card.truncations
        assert "ancestors_section" in card.truncations
        assert "Ancestors:" not in card.card_text
        assert "Examples:" not in card.card_text
        # Title, description, inverse, and endpoint-type summaries survive.
        assert "Relation: test relation" in card.card_text
        assert "Description: " in card.card_text
        assert "Inverse Name: has part (this item has the listed part)" in card.card_text
        assert "Source types:\n  - alpha type" in card.card_text
        assert "Target types:\n  - beta type" in card.card_text
        assert "Slug: test-relation" in card.card_text
        # Still above the hard budget -> severely truncated.
        assert card.severely_truncated

    def test_severe_flag_when_more_than_half_of_examples_dropped(self) -> None:
        record = _crafted_record(10)
        # Budget sized to the 3-example rendering of the same record: the
        # sampler order is stable, so truncation stops at 3 examples.
        three = _build(_crafted_record(3), _config(BIG, BIG))
        card = _build(record, _config(three.token_count, BIG))
        kept = len(_card_examples(card.card_text))
        assert kept <= 3
        assert card.severely_truncated

    def test_same_record_same_hash(self) -> None:
        record = _crafted_record(5)
        first = _build(record, _config(BIG, BIG))
        second = _build(record, _config(BIG, BIG))
        assert first.card_hash == second.card_hash
        assert first.card_text == second.card_text


def _stratified_record(alpha_examples: int, beta_examples: int) -> PropertyRecord:
    """Craft a two-strata record.

    Its `alpha type` (Q1) and `beta type` (Q2) examples arrive grouped the
    way the selector emits them.
    """

    def example(stratum: str, i: int) -> Example:
        return Example(
            subject_qid=f"Q{stratum}{i:02d}1",
            object_qid=f"Q{stratum}{i:02d}2",
            subject_label=f"Subject Item Number {i:02d} With A Long Label",
            object_label=f"Object Item Number {i:02d} With A Long Label",
            subject_type=f"Q10{i}",
            stratum=Qid(f"Q{stratum}"),
        )

    return PropertyRecord(
        pid=Pid("P9999"),
        datatype="wikibase-item",
        labels={EN: "test relation"},
        descriptions={EN: "a synthetic relation used to exercise truncation"},
        constraints=Constraints(subject_types=(Qid("Q1"), Qid("Q2"))),
        examples=[example("1", i) for i in range(alpha_examples)]
        + [example("2", i) for i in range(beta_examples)],
    )


class TestStratifiedTruncation:
    def test_slot_drops_come_from_the_largest_stratum_first(self) -> None:
        record = _stratified_record(3, 2)
        full = _build(record, _config(BIG, BIG))
        assert full.truncations == []

        card = _build(record, _config(full.token_count - 25, BIG))
        dropped = [label for label in card.truncations if label.startswith("example[")]
        assert dropped, "expected at least one dropped example slot"
        # The largest stratum (alpha, 3 examples at indices 0-2) loses its
        # lowest draw rank first.
        assert dropped[0] == "example[2]"
        assert not any(label.startswith("example_stratum") for label in card.truncations)

    def test_strata_survive_slot_loss(self) -> None:
        record = _stratified_record(3, 2)
        full = _build(record, _config(BIG, BIG))
        card = _build(record, _config(full.token_count - 25, BIG))
        examples = _card_examples(card.card_text)
        assert len(examples) < 5
        # Both strata still land examples: slots are dropped round-robin
        # from the largest strata, never a whole stratum while any stratum
        # holds two or more.
        assert any(example.startswith("alpha type: ") for example in examples)
        assert any(example.startswith("beta type: ") for example in examples)

    def test_whole_strata_drop_only_after_detail_stripping(self) -> None:
        record = _stratified_record(3, 2)
        card = _build(record, _config(1, BIG))  # impossible soft budget
        # The last stratum (beta) was dropped whole, after the detail
        # passes ran; one alpha example survives (the one-example floor).
        assert "example_stratum[beta type]" in card.truncations
        assert card.truncations.index("source_type_details") < card.truncations.index(
            "example_stratum[beta type]"
        )
        assert _card_examples(card.card_text) == [
            "alpha type: Subject Item Number 00 With A Long Label"
            " -> Object Item Number 00 With A Long Label"
        ]


# --- Phrase + sentence splitters ----------------------------------------------


class TestPhrase:
    def test_lead_detail_split(self) -> None:
        entry = LABELS[Qid("Q1")]
        phrase = Phrase.make(
            PhraseInput(label=entry.label, description=entry.description),
            language=EN,
            splitter=NaiveSentenceSplitter(),
        )
        assert phrase is not None
        assert phrase.label == "alpha type"
        assert phrase.lead == "Lead alpha sentence."
        assert phrase.detail == "Expendable alpha detail."
        assert phrase.render() == ("alpha type (Lead alpha sentence. Expendable alpha detail.)")

    def test_whitespace_collapsed(self) -> None:
        phrase = Phrase.make(
            PhraseInput(
                label="  spaced\t label ",
                description="One   sentence.\n\nTwo  here.",
            ),
            language=EN,
            splitter=NaiveSentenceSplitter(),
        )
        assert phrase is not None
        assert phrase.label == "spaced label"
        assert phrase.lead == "One sentence."
        assert phrase.detail == "Two here."

    def test_unlabeled_reference_is_none(self) -> None:
        assert (
            Phrase.make(
                PhraseInput(label=""),
                language=EN,
                splitter=NaiveSentenceSplitter(),
            )
            is None
        )

    def test_label_only_render(self) -> None:
        phrase = Phrase.make(
            PhraseInput(label="plain"),
            language=EN,
            splitter=NaiveSentenceSplitter(),
        )
        assert phrase is not None
        assert phrase.lead is None
        assert phrase.detail is None
        assert phrase.render() == "plain"


ABBREVIATION_TEXT = "Dr. Smith went to Washington. He arrived at 5 p.m. sharp."


class TestSentenceSplitters:
    def test_naive_splits_after_terminal_punctuation(self) -> None:
        splitter = NaiveSentenceSplitter()
        assert splitter.split("One. Two! Three?", language=EN) == [
            "One.",
            "Two!",
            "Three?",
        ]
        assert splitter.split("No boundary here", language=EN) == ["No boundary here"]

    def test_naive_is_blind_to_abbreviations(self) -> None:
        # Documents the naive splitter's known weakness (and why punkt is
        # the production default): it cuts at "Dr." and "p.m.".
        parts = NaiveSentenceSplitter().split(ABBREVIATION_TEXT, language=EN)
        assert len(parts) == 4

    def test_punkt_handles_abbreviations(self) -> None:
        # The one allowed punkt test: it skips (and never downloads) when
        # the punkt_tab data is not installed on this machine.
        try:
            splitter = PunktSentenceSplitter()
        except RuntimeError:
            pytest.skip("nltk punkt_tab data not installed")
        assert splitter.split(ABBREVIATION_TEXT, language=EN) == [
            "Dr. Smith went to Washington.",
            "He arrived at 5 p.m. sharp.",
        ]

    def test_make_sentence_splitter(self) -> None:
        assert make_sentence_splitter("naive").name == "naive"


# --- small pure helpers -------------------------------------------------------


def test_slugify() -> None:
    assert slugify("part of") == "part-of"
    assert slugify("A/B test!") == "a-b-test"
