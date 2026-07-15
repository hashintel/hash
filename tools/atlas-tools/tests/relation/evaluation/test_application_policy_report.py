from dataclasses import dataclass
from pathlib import Path

import pytest

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    CardAnalysis,
    EmbeddingRow,
    GoldLabel,
    PlacementTally,
    PolicyReport,
    PolicyReportWithoutGold,
    placement_posterior,
    soft_labels,
)
from atlas_tools.relation.evaluation.application import policy_report as report_application
from atlas_tools.relation.evaluation.application._policy_report_metadata import (
    LEGACY_POLICY_REPORT_ALGORITHMS,
    LegacyPolicyReportMetadata,
    legacy_policy_report_schema_hashes,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import hash_mapping
from atlas_tools.relation.evaluation.application.analysis_codec import (
    EmbeddingProducerIdentity,
    write_embeddings,
    write_soft_labels,
)
from atlas_tools.relation.evaluation.application.classifier import fit_classifier
from atlas_tools.relation.evaluation.application.completed import (
    CompletedGrid,
    load_completed_grid,
)
from atlas_tools.relation.evaluation.application.policy_report import (
    REPORT_JSON_FILENAME,
    REPORT_MARKDOWN_FILENAME,
    REPORT_METADATA_FILENAME,
    load_gold,
    load_policy_report_artifact,
    write_policy_report,
    write_policy_report_from_grid,
)
from atlas_tools.relation.evaluation.application.run import run_evaluation
from atlas_tools.relation.evaluation.application.target_resolution import (
    publish_target_resolutions,
)
from atlas_tools.relation.evaluation.domain.api import PlacementClass, TargetResolutionRow
from atlas_tools.relation.evaluation.storage.api import load_deck
from tests.relation.evaluation.classifier_fixtures import write_verified_family_closure
from tests.relation.evaluation.grid_fixtures import (
    grid_config,
    write_grid_concat,
    write_grid_config,
)
from tests.relation.evaluation.test_application_run import (
    AsyncMappingTransport,
    _write_empty_pilot,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class _CompletedFixture:
    root: Path
    cards_directory: Path
    config_path: Path
    run_directory: Path
    completed: CompletedGrid


@pytest.fixture(scope="module")
def completed_fixture(tmp_path_factory: pytest.TempPathFactory) -> _CompletedFixture:
    root = tmp_path_factory.mktemp("policy-report")
    cards_directory = write_grid_concat(root / "cards")
    config_path = write_grid_config(root / "grid.yaml", grid_config())
    pilot_directory = _write_empty_pilot(
        root / "pilot",
        config_path=config_path,
        cards_directory=cards_directory,
    )
    run_directory = root / "run"
    run_evaluation(
        cards_directory=cards_directory,
        config_path=config_path,
        output_directory=run_directory,
        pilot_directory=pilot_directory,
        transport=AsyncMappingTransport(),
    )
    completed = load_completed_grid(
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
    )
    return _CompletedFixture(
        root=root,
        cards_directory=cards_directory,
        config_path=config_path,
        run_directory=run_directory,
        completed=completed,
    )


def _panel_label(card: CardAnalysis) -> PlacementClass:
    posterior = card.posterior
    values = (posterior.coincident, posterior.proximal, posterior.overlay)
    labels: tuple[PlacementClass, PlacementClass, PlacementClass] = (
        "coincident",
        "proximal",
        "overlay",
    )
    return labels[max(range(3), key=lambda index: (values[index], -index))]


def _gold(card: CardAnalysis, *, post_exposure: bool = False) -> GoldLabel:
    return GoldLabel(
        relation_id=card.card.relation_id,
        verdict=_panel_label(card),
        pass_count=3,
        entropy=0.0,
        post_exposure=post_exposure,
    )


def _write_gold(path: Path, rows: tuple[GoldLabel, ...]) -> Path:
    path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))
    return path


def _assert_classifier_without_gold(
    report: PolicyReportWithoutGold,
    *,
    eligible_cards: int,
) -> None:
    assert report.classifier is not None
    assert report.classifier.predictions == eligible_cards
    assert report.classifier.gold is None
    assert report.classifier.calibration is None


def test_report_composition_loads_grid_once_and_publishes_reproducible_ascii(
    completed_fixture: _CompletedFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = completed_fixture
    gold_path = _write_gold(
        fixture.root / "gold.jsonl",
        (
            _gold(fixture.completed.analysis.cards[0]),
            _gold(fixture.completed.analysis.cards[1], post_exposure=True),
        ),
    )
    original_loader = report_application.load_completed_grid_async
    load_calls = 0

    async def counted_loader(
        *,
        run_directory: Path,
        cards_directory: Path,
        config_path: Path,
    ) -> CompletedGrid:
        nonlocal load_calls
        load_calls += 1
        return await original_loader(
            run_directory=run_directory,
            cards_directory=cards_directory,
            config_path=config_path,
        )

    monkeypatch.setattr(report_application, "load_completed_grid_async", counted_loader)
    first = write_policy_report(
        run_directory=fixture.run_directory,
        cards_directory=fixture.cards_directory,
        config_path=fixture.config_path,
        gold_path=gold_path,
        output_directory=fixture.root / "report-first",
    )
    second = write_policy_report_from_grid(
        completed=fixture.completed,
        gold_path=gold_path,
        output_directory=fixture.root / "report-second",
    )

    assert load_calls == 1
    assert isinstance(first.report, PolicyReport)
    assert first.report.panel_gold.agreement.value == 1.0
    assert first.report.gold_post_exposure == 1
    assert first.report.panel_gold.independent_gold_cards == 1
    assert first.report.coincident_gate.verdict == "insufficient-sample"
    assert first.metadata.source_hashes["gold.jsonl"] == sha256_bytes(gold_path.read_bytes())
    assert (
        first.metadata.source_hashes["grid/cards.jsonl"]
        == (fixture.completed.manifest.source_hashes["cards.jsonl"])
    )
    assert "classifier/metadata" not in first.metadata.source_hashes
    for filename in (
        REPORT_JSON_FILENAME,
        REPORT_MARKDOWN_FILENAME,
        REPORT_METADATA_FILENAME,
    ):
        first_bytes = (first.directory / filename).read_bytes()
        assert first_bytes == (second.directory / filename).read_bytes()
        first_bytes.decode("ascii")

    loaded = load_policy_report_artifact(first.directory)
    assert loaded.report == first.report
    assert loaded.metadata == first.metadata
    first.report_markdown_path.write_bytes(first.report_markdown_path.read_bytes() + b"damage")
    with pytest.raises(ValueError, match="content hashes do not match"):
        load_policy_report_artifact(first.directory)


def test_report_loader_accepts_immutable_legacy_metadata(
    completed_fixture: _CompletedFixture,
) -> None:
    fixture = completed_fixture
    gold_path = _write_gold(
        fixture.root / "legacy-gold.jsonl",
        (_gold(fixture.completed.analysis.cards[0]),),
    )
    artifact = write_policy_report_from_grid(
        completed=fixture.completed,
        gold_path=gold_path,
        output_directory=fixture.root / "legacy-report",
    )
    assert isinstance(artifact.report, PolicyReport)
    legacy_metadata = LegacyPolicyReportMetadata(
        schema_hashes=legacy_policy_report_schema_hashes(),
        algorithms=LEGACY_POLICY_REPORT_ALGORITHMS,
        algorithm_hash=hash_mapping(LEGACY_POLICY_REPORT_ALGORITHMS),
        source_hashes=artifact.metadata.source_hashes,
        content_hashes=artifact.metadata.content_hashes,
        gold_rows=artifact.report.gold_cards,
        classifier_state=artifact.report.classifier_state,
    )
    artifact.metadata_path.write_bytes(canonical_json_bytes(legacy_metadata) + b"\n")

    loaded = load_policy_report_artifact(artifact.directory)

    assert isinstance(loaded.metadata, LegacyPolicyReportMetadata)
    assert loaded.metadata.gold_state == "evaluated"
    assert loaded.report == artifact.report


def test_report_without_gold_omits_source_and_leaves_metrics_undefined(
    completed_fixture: _CompletedFixture,
) -> None:
    fixture = completed_fixture
    artifact = write_policy_report_from_grid(
        completed=fixture.completed,
        output_directory=fixture.root / "report-without-gold",
    )

    report = artifact.report
    assert isinstance(report, PolicyReportWithoutGold)
    assert report.gold_state == "not-provided"
    assert report.gold_cards is None
    assert report.gold_post_exposure is None
    assert report.panel_gold is None
    assert report.coincident_gate is None
    assert all(judge.gold_votes is None for judge in report.judges)
    assert all(judge.gold_agreement is None for judge in report.judges)
    assert report.economics.pool_cards == len(fixture.completed.analysis.cards)
    assert artifact.metadata.gold_state == "not-provided"
    assert artifact.metadata.gold_rows is None
    assert "gold.jsonl" not in artifact.metadata.source_hashes
    markdown = artifact.report_markdown_path.read_text(encoding="ascii")
    assert "Gold: not provided" in markdown
    assert "Gold cards: 0" not in markdown
    assert load_policy_report_artifact(artifact.directory) == artifact

    empty_gold_path = _write_gold(fixture.root / "empty-gold.jsonl", ())
    empty_artifact = write_policy_report_from_grid(
        completed=fixture.completed,
        gold_path=empty_gold_path,
        output_directory=fixture.root / "report-with-empty-gold",
    )
    assert isinstance(empty_artifact.report, PolicyReport)
    assert empty_artifact.report.gold_cards == 0
    assert empty_artifact.metadata.gold_state == "evaluated"
    assert empty_artifact.metadata.gold_rows == 0
    assert empty_artifact.metadata.source_hashes["gold.jsonl"] == sha256_bytes(b"")


def test_report_classifier_closure_is_required_revalidated_and_transitive(
    completed_fixture: _CompletedFixture,
) -> None:
    fixture = completed_fixture
    completed = fixture.completed
    source_hashes = {
        name: completed.manifest.source_hashes[name]
        for name in (
            "cards.jsonl",
            "imported-votes.jsonl",
            "judges-panel",
            "votes.jsonl",
        )
    }
    training_labels = []
    coordinates = ((-2.0, 0.0), (2.0, 0.0), (0.0, 2.0))
    for index, label in enumerate(soft_labels(completed.analysis)):
        placement_class = index % 3
        tally = PlacementTally(
            coincident=9 if index > 0 and placement_class == 0 else 0,
            proximal=9 if index > 0 and placement_class == 1 else 0,
            overlay=9 if index > 0 and placement_class == 2 else 0,
        )
        training_labels.append(
            label.model_copy(
                update={
                    "tally": tally,
                    "unclear_votes": 9 if index == 0 else 0,
                    "abstentions": 0,
                    "posterior": placement_posterior(tally),
                    "review": index > 0 and placement_class == 0,
                }
            )
        )
    training_rows = tuple(training_labels)
    labels = write_soft_labels(
        fixture.root / "classifier-soft-labels.parquet",
        training_rows,
        source_hashes=source_hashes,
    )
    deck = load_deck(fixture.cards_directory)
    closure = write_verified_family_closure(
        fixture.root / "classifier-closure",
        training_rows,
        cards_hash=deck.source_hashes["cards.jsonl"],
        cards_manifest_hash=deck.source_hashes["cards.manifest.json"],
    )
    resolutions = publish_target_resolutions(
        output_directory=fixture.root / "classifier-target-resolutions",
        resolutions=(
            TargetResolutionRow(
                relation_id=training_rows[0].relation_id,
                card_hash=training_rows[0].card_hash,
                action="coincident",
            ),
        ),
        reviewer="report integration reviewer",
        soft_labels=labels,
        deck=deck,
    )
    embedding_rows = tuple(
        EmbeddingRow.from_values(
            relation_id=card.card.relation_id,
            card_hash=card.card.card_hash,
            values=(
                coordinates[index % 3][0],
                coordinates[index % 3][1],
                float(index % 5) / 10.0,
            ),
        )
        for index, card in enumerate(completed.analysis.cards)
    )
    embeddings = write_embeddings(
        fixture.root / "embeddings.parquet",
        embedding_rows,
        producer=EmbeddingProducerIdentity.verified(
            endpoint_url="https://embedding.test/v1/embeddings",
            model="fixture-embedding",
            dimension=embedding_rows[0].dimension,
        ),
        source_hashes={
            "cards.jsonl": completed.manifest.source_hashes["cards.jsonl"],
            "cards.manifest.json": deck.source_hashes["cards.manifest.json"],
            "grid-config": completed.prepared.loaded_config.content_hash,
        },
    )
    classifier_directory = fixture.root / "classifier"
    classifier = fit_classifier(
        soft_labels_path=labels.path,
        embeddings_path=embeddings.path,
        closure_directory=closure.directory,
        config_path=fixture.config_path,
        output_directory=classifier_directory,
        resolutions_directory=resolutions.paths.directory,
    )
    assert classifier.metadata.closure.artifact_id == closure.manifest.details.artifact_id
    assert (
        classifier.metadata.source_hashes["family-closure/families.jsonl"] == closure.families_hash
    )
    assert (
        classifier.metadata.source_hashes["family-closure/families.manifest.json"]
        == closure.manifest_hash
    )
    gold_path = _write_gold(
        fixture.root / "lineage-gold.jsonl",
        (_gold(completed.analysis.cards[0]),),
    )
    missing_output = fixture.root / "missing-closure-report"
    with pytest.raises(ValueError, match="classifier and family closure must be provided together"):
        write_policy_report_from_grid(
            completed=completed,
            gold_path=gold_path,
            classifier_directory=classifier_directory,
            output_directory=missing_output,
        )
    assert not (missing_output / REPORT_METADATA_FILENAME).exists()

    mismatched_closure = write_verified_family_closure(
        fixture.root / "mismatched-classifier-closure",
        training_rows,
        provenance_seed="mismatched",
    )
    mismatched_output = fixture.root / "mismatched-closure-report"
    with pytest.RaisesGroup(pytest.RaisesExc(ValueError, match="different family closure")):
        write_policy_report_from_grid(
            completed=completed,
            gold_path=gold_path,
            classifier_directory=classifier_directory,
            closure_directory=mismatched_closure.directory,
            output_directory=mismatched_output,
        )
    assert not (mismatched_output / REPORT_METADATA_FILENAME).exists()

    missing_resolutions_output = fixture.root / "missing-resolutions-report"
    with pytest.RaisesGroup(pytest.RaisesExc(ValueError, match="different target resolutions")):
        write_policy_report_from_grid(
            completed=completed,
            gold_path=gold_path,
            classifier_directory=classifier_directory,
            closure_directory=closure.directory,
            output_directory=missing_resolutions_output,
        )
    assert not (missing_resolutions_output / REPORT_METADATA_FILENAME).exists()

    report = write_policy_report_from_grid(
        completed=completed,
        gold_path=gold_path,
        classifier_directory=classifier_directory,
        closure_directory=closure.directory,
        soft_labels_path=labels.path,
        resolutions_directory=resolutions.paths.directory,
        output_directory=fixture.root / "classifier-report",
    )
    assert report.metadata.source_hashes["classifier/metadata"] == classifier.metadata.metadata_hash
    assert report.report.classifier_state == "evaluated"

    report_without_gold = write_policy_report_from_grid(
        completed=completed,
        classifier_directory=classifier_directory,
        closure_directory=closure.directory,
        soft_labels_path=labels.path,
        resolutions_directory=resolutions.paths.directory,
        output_directory=fixture.root / "classifier-report-without-gold",
    )
    assert isinstance(report_without_gold.report, PolicyReportWithoutGold)
    _assert_classifier_without_gold(
        report_without_gold.report,
        eligible_cards=len(completed.analysis.cards),
    )
    assert report_without_gold.metadata.gold_state == "not-provided"
    assert "gold.jsonl" not in report_without_gold.metadata.source_hashes

    drifted_sources = dict(classifier.metadata.source_hashes)
    drifted_sources["grid/imported-votes.jsonl"] = "f" * 64
    drifted_metadata = classifier.metadata.model_copy(update={"source_hashes": drifted_sources})
    classifier.metadata_path.write_bytes(canonical_json_bytes(drifted_metadata) + b"\n")
    output_directory = fixture.root / "lineage-report"
    with pytest.raises(
        ValueError,
        match=r"does not bind completed grid source imported-votes\.jsonl",
    ):
        write_policy_report_from_grid(
            completed=completed,
            gold_path=gold_path,
            classifier_directory=classifier_directory,
            closure_directory=closure.directory,
            soft_labels_path=labels.path,
            resolutions_directory=resolutions.paths.directory,
            output_directory=output_directory,
        )
    assert not (output_directory / REPORT_METADATA_FILENAME).exists()


def test_gold_loader_rejects_coercion_and_duplicate_relations(tmp_path: Path) -> None:
    coercing = tmp_path / "coercing.jsonl"
    coercing.write_text(
        '{"relation_id":"test:a","verdict":"coincident","pass_count":"3",'
        '"entropy":0.0,"post_exposure":false}\n',
        encoding="ascii",
    )
    with pytest.raises(ValueError, match="invalid gold JSONL line 1"):
        load_gold(coercing)

    row = GoldLabel(
        relation_id="test:a",
        verdict="coincident",
        pass_count=3,
        entropy=0.0,
    )
    duplicate = tmp_path / "duplicate.jsonl"
    duplicate.write_bytes(canonical_json_bytes(row) + b"\n" + canonical_json_bytes(row) + b"\n")
    with pytest.raises(ValueError, match="repeats relation test:a"):
        load_gold(duplicate)
