from dataclasses import dataclass
from pathlib import Path

import pytest

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    CardAnalysis,
    EmbeddingRow,
    GoldLabel,
    PlacementTally,
    placement_posterior,
    soft_labels,
)
from atlas_tools.relation.evaluation.application import policy_report as report_application
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
from atlas_tools.relation.evaluation.domain.api import PlacementClass
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
            coincident=9 if placement_class == 0 else 0,
            proximal=9 if placement_class == 1 else 0,
            overlay=9 if placement_class == 2 else 0,
        )
        training_labels.append(
            label.model_copy(
                update={
                    "tally": tally,
                    "unclear_votes": 0,
                    "abstentions": 0,
                    "posterior": placement_posterior(tally),
                    "review": placement_class == 0,
                }
            )
        )
    training_rows = tuple(training_labels)
    labels = write_soft_labels(
        fixture.root / "classifier-soft-labels.parquet",
        training_rows,
        source_hashes=source_hashes,
    )
    closure = write_verified_family_closure(
        fixture.root / "classifier-closure",
        training_rows,
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

    report = write_policy_report_from_grid(
        completed=completed,
        gold_path=gold_path,
        classifier_directory=classifier_directory,
        closure_directory=closure.directory,
        output_directory=fixture.root / "classifier-report",
    )
    assert report.metadata.source_hashes["classifier/metadata"] == classifier.metadata.metadata_hash
    assert report.report.classifier_state == "evaluated"

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
