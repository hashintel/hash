import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest

import atlas_tools.relation.evaluation.application.target_resolution as target_resolution_module
from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    PlacementTally,
    SoftLabel,
    placement_posterior,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    SoftLabelsArtifact,
    write_soft_labels,
)
from atlas_tools.relation.evaluation.application.api import (
    AmbiguousTargetReviewCancelledError,
    load_target_resolutions,
    publish_target_resolutions,
    review_ambiguous_targets,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    EvaluationCard,
    TargetResolutionRow,
    TargetResolutionSourceName,
    target_resolution_artifact_id,
    target_resolution_counts,
    target_resolution_decisions_hash,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from atlas_tools.relation.evaluation.visualization.api import (
    AmbiguousTargetDecision,
    AmbiguousTargetReviewRow,
)
from tests.relation.evaluation.grid_fixtures import write_grid_concat


@dataclass(frozen=True, slots=True, kw_only=True)
class _Inputs:
    deck: VerifiedDeck
    soft_labels: SoftLabelsArtifact
    ambiguous: tuple[SoftLabel, SoftLabel]
    positive: SoftLabel


def _label(
    card: EvaluationCard,
    *,
    coincident: int = 0,
    unclear: int = 0,
    abstentions: int = 0,
) -> SoftLabel:
    tally = PlacementTally(coincident=coincident)
    return SoftLabel(
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        producer=card.producer,
        family_id=card.family_id,
        prescreen_stratum=card.prescreen_stratum,
        tally=tally,
        unclear_votes=unclear,
        abstentions=abstentions,
        posterior=placement_posterior(tally),
        refined=False,
        review=coincident > 0,
    )


@pytest.fixture
def inputs(tmp_path: Path) -> _Inputs:
    deck = load_deck(write_grid_concat(tmp_path / "cards"))
    cards = tuple(sorted(deck.cards, key=lambda card: card.relation_id)[:3])
    first = _label(cards[0], unclear=7, abstentions=2)
    second = _label(cards[1], unclear=5, abstentions=4)
    positive = _label(cards[2], coincident=3, unclear=1)
    soft_labels = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        (positive, second, first),
        source_hashes={"cards.jsonl": deck.source_hashes["cards.jsonl"]},
    )
    return _Inputs(
        deck=deck,
        soft_labels=soft_labels,
        ambiguous=(first, second),
        positive=positive,
    )


def _decisions(inputs: _Inputs) -> tuple[TargetResolutionRow, TargetResolutionRow]:
    first, second = inputs.ambiguous
    return (
        TargetResolutionRow(
            relation_id=second.relation_id,
            card_hash=second.card_hash,
            action="excluded",
        ),
        TargetResolutionRow(
            relation_id=first.relation_id,
            card_hash=first.card_hash,
            action="overlay",
        ),
    )


def test_publication_load_roundtrip_is_sorted_exact_and_source_bound(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    published = publish_target_resolutions(
        output_directory=tmp_path / "resolutions",
        resolutions=_decisions(inputs),
        reviewer="Ada Reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    loaded = load_target_resolutions(
        published.paths.directory,
        soft_labels=inputs.soft_labels,
        expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
    )
    first, second = sorted(inputs.ambiguous, key=lambda label: label.relation_id)

    assert loaded == published
    assert loaded.rows == (
        TargetResolutionRow(
            relation_id=first.relation_id,
            card_hash=first.card_hash,
            action="overlay",
        ),
        TargetResolutionRow(
            relation_id=second.relation_id,
            card_hash=second.card_hash,
            action="excluded",
        ),
    )
    assert loaded.by_relation_id[first.relation_id] == loaded.rows[0]
    assert loaded.manifest.counts.rows == 2
    assert loaded.manifest.counts.placement == 1
    assert loaded.manifest.counts.excluded == 1
    assert set(loaded.manifest.source_hashes) == {
        "soft-labels.parquet",
        "soft-labels.parquet.meta.json",
        "cards.jsonl",
        "cards.manifest.json",
    }
    documents = [json.loads(line) for line in loaded.paths.rows_path.read_text().splitlines()]
    assert [document["relation_id"] for document in documents] == [
        first.relation_id,
        second.relation_id,
    ]


def test_source_metadata_changes_artifact_id(tmp_path: Path, inputs: _Inputs) -> None:
    first = publish_target_resolutions(
        output_directory=tmp_path / "first",
        resolutions=_decisions(inputs),
        reviewer="Ada Reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    rebound = write_soft_labels(
        tmp_path / "rebound.parquet",
        inputs.soft_labels.rows,
        source_hashes={
            "cards.jsonl": inputs.deck.source_hashes["cards.jsonl"],
            "evidence": "e" * 64,
        },
    )
    second = publish_target_resolutions(
        output_directory=tmp_path / "second",
        resolutions=_decisions(inputs),
        reviewer="Ada Reviewer",
        soft_labels=rebound,
        deck=inputs.deck,
    )

    assert first.manifest.decisions_hash == second.manifest.decisions_hash
    assert (
        first.manifest.source_hashes["soft-labels.parquet"]
        == second.manifest.source_hashes["soft-labels.parquet"]
    )
    assert (
        first.manifest.source_hashes["soft-labels.parquet.meta.json"]
        != (second.manifest.source_hashes["soft-labels.parquet.meta.json"])
    )
    assert first.manifest.artifact_id != second.manifest.artifact_id


def test_rejects_source_card_and_decision_drift(tmp_path: Path, inputs: _Inputs) -> None:
    wrong_source = write_soft_labels(
        tmp_path / "wrong-source.parquet",
        inputs.soft_labels.rows,
        source_hashes={"cards.jsonl": "f" * 64},
    )
    with pytest.raises(ValueError, match=r"different cards\.jsonl"):
        publish_target_resolutions(
            output_directory=tmp_path / "wrong-source-output",
            resolutions=_decisions(inputs),
            reviewer="reviewer",
            soft_labels=wrong_source,
            deck=inputs.deck,
        )

    drifted_label = inputs.ambiguous[0].model_copy(update={"card_hash": CardHash("f" * 64)})
    card_drift = write_soft_labels(
        tmp_path / "card-drift.parquet",
        (drifted_label, inputs.ambiguous[1], inputs.positive),
        source_hashes={"cards.jsonl": inputs.deck.source_hashes["cards.jsonl"]},
    )
    drifted_decisions = (
        TargetResolutionRow(
            relation_id=drifted_label.relation_id,
            card_hash=drifted_label.card_hash,
            action="coincident",
        ),
        _decisions(inputs)[0],
    )
    with pytest.raises(ValueError, match="drifted card hash"):
        publish_target_resolutions(
            output_directory=tmp_path / "card-drift-output",
            resolutions=drifted_decisions,
            reviewer="reviewer",
            soft_labels=card_drift,
            deck=inputs.deck,
        )

    wrong_decision = _decisions(inputs)[0].model_copy(update={"card_hash": CardHash("f" * 64)})
    with pytest.raises(ValueError, match="card hash differs"):
        publish_target_resolutions(
            output_directory=tmp_path / "decision-drift-output",
            resolutions=(wrong_decision, _decisions(inputs)[1]),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )


def test_rejects_incomplete_extra_duplicate_and_positive_label_override(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    decisions = _decisions(inputs)
    with pytest.raises(ValueError, match="do not cover"):
        publish_target_resolutions(
            output_directory=tmp_path / "incomplete",
            resolutions=decisions[:1],
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    extra = TargetResolutionRow(
        relation_id="test:extra",
        card_hash=CardHash("f" * 64),
        action="excluded",
    )
    with pytest.raises(ValueError, match="extra relation"):
        publish_target_resolutions(
            output_directory=tmp_path / "extra",
            resolutions=(*decisions, extra),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    with pytest.raises(ValueError, match="repeat relation"):
        publish_target_resolutions(
            output_directory=tmp_path / "duplicate",
            resolutions=(decisions[0], decisions[0], decisions[1]),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    positive_override = TargetResolutionRow(
        relation_id=inputs.positive.relation_id,
        card_hash=inputs.positive.card_hash,
        action="proximal",
    )
    with pytest.raises(ValueError, match="positive-weight"):
        publish_target_resolutions(
            output_directory=tmp_path / "positive",
            resolutions=(*decisions, positive_override),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )


def test_destination_is_immutable(tmp_path: Path, inputs: _Inputs) -> None:
    output = tmp_path / "resolutions"
    published = publish_target_resolutions(
        output_directory=output,
        resolutions=_decisions(inputs),
        reviewer="first reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    before = {
        path.name: path.read_bytes()
        for path in (published.paths.rows_path, published.paths.manifest_path)
    }

    with pytest.raises(FileExistsError, match="already exists"):
        publish_target_resolutions(
            output_directory=output,
            resolutions=_decisions(inputs),
            reviewer="second reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    assert {path.name: path.read_bytes() for path in output.iterdir()} == before
    assert not tuple(tmp_path.glob(".resolutions.staging-*"))


def test_cancel_publishes_nothing_and_review_rows_include_full_cards(
    tmp_path: Path,
    inputs: _Inputs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: list[tuple[AmbiguousTargetReviewRow, ...]] = []

    def cancel(
        rows: Iterable[AmbiguousTargetReviewRow],
    ) -> tuple[AmbiguousTargetDecision, ...] | None:
        observed.append(tuple(rows))
        return None

    monkeypatch.setattr(target_resolution_module, "run_ambiguous_target_review", cancel)
    output = tmp_path / "cancelled"
    with pytest.raises(AmbiguousTargetReviewCancelledError, match="no artifact"):
        review_ambiguous_targets(
            soft_labels=inputs.soft_labels.path,
            deck=inputs.deck.directory,
            reviewer="reviewer",
            output_directory=output,
        )

    assert not output.exists()
    assert tuple(row.relation_id for row in observed[0]) == tuple(
        sorted(label.relation_id for label in inputs.ambiguous)
    )
    for row in observed[0]:
        card = inputs.deck.by_relation_id[row.relation_id]
        label = next(label for label in inputs.ambiguous if label.relation_id == row.relation_id)
        assert row.card_text == card.card_text
        assert row.unclear_votes == label.unclear_votes
        assert row.abstentions == label.abstentions


def test_loader_rejects_row_and_manifest_hash_tampering(tmp_path: Path, inputs: _Inputs) -> None:
    row_artifact = publish_target_resolutions(
        output_directory=tmp_path / "row-tamper",
        resolutions=_decisions(inputs),
        reviewer="reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    payload = row_artifact.paths.rows_path.read_bytes().replace(b'"excluded"', b'"proximal"')
    row_artifact.paths.rows_path.write_bytes(payload)
    with pytest.raises(ValueError, match="decisions hash"):
        load_target_resolutions(
            row_artifact.paths.directory,
            soft_labels=inputs.soft_labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
        )

    manifest_artifact = publish_target_resolutions(
        output_directory=tmp_path / "manifest-tamper",
        resolutions=_decisions(inputs),
        reviewer="reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    document = json.loads(manifest_artifact.paths.manifest_path.read_bytes())
    document["artifact_id"] = "0" * 64
    manifest_artifact.paths.manifest_path.write_bytes(canonical_json_bytes(document) + b"\n")
    with pytest.raises(ValueError, match="artifact_id"):
        load_target_resolutions(
            manifest_artifact.paths.directory,
            soft_labels=inputs.soft_labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
        )


@pytest.mark.parametrize(
    ("source_name", "message"),
    [
        ("cards.jsonl", "different cards.jsonl"),
        ("cards.manifest.json", "different cards manifest"),
    ],
)
def test_loader_rejects_self_consistent_card_source_rebinding(
    tmp_path: Path,
    inputs: _Inputs,
    source_name: TargetResolutionSourceName,
    message: str,
) -> None:
    artifact = publish_target_resolutions(
        output_directory=tmp_path / "card-source-rebinding",
        resolutions=_decisions(inputs),
        reviewer="reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    source_hashes = dict(artifact.manifest.source_hashes)
    source_hashes[source_name] = "f" * 64
    artifact_id = target_resolution_artifact_id(
        reviewer=artifact.manifest.reviewer,
        source_hashes=source_hashes,
        decisions_hash=artifact.manifest.decisions_hash,
        counts=artifact.manifest.counts,
    )
    manifest = artifact.manifest.model_copy(
        update={"source_hashes": source_hashes, "artifact_id": artifact_id}
    )
    artifact.paths.manifest_path.write_bytes(canonical_json_bytes(manifest) + b"\n")

    with pytest.raises(ValueError, match=message):
        load_target_resolutions(
            artifact.paths.directory,
            soft_labels=inputs.soft_labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
        )


def test_loader_rejects_self_consistent_but_incomplete_coverage(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    artifact = publish_target_resolutions(
        output_directory=tmp_path / "incomplete-load",
        resolutions=_decisions(inputs),
        reviewer="reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    rows = artifact.rows[:1]
    decisions_hash = target_resolution_decisions_hash(rows)
    counts = target_resolution_counts(rows)
    artifact_id = target_resolution_artifact_id(
        reviewer=artifact.manifest.reviewer,
        source_hashes=artifact.manifest.source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
    )
    manifest = artifact.manifest.model_copy(
        update={
            "decisions_hash": decisions_hash,
            "counts": counts,
            "artifact_id": artifact_id,
        }
    )
    artifact.paths.rows_path.write_bytes(
        b"".join(canonical_json_bytes(row) + b"\n" for row in rows)
    )
    artifact.paths.manifest_path.write_bytes(canonical_json_bytes(manifest) + b"\n")

    with pytest.raises(ValueError, match="do not cover"):
        load_target_resolutions(
            artifact.paths.directory,
            soft_labels=inputs.soft_labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
        )
