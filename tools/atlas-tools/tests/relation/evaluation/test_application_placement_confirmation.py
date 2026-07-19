from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest

import atlas_tools.relation.evaluation.application.placement_confirmation as confirmation_module
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
    PlacementConfirmationCancelledError,
    confirm_placements,
    load_placement_confirmations,
    publish_placement_confirmations,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    EvaluationCard,
    PlacementConfirmationAction,
    PlacementConfirmationRow,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from atlas_tools.relation.evaluation.visualization.api import (
    PlacementConfirmationDecision,
    PlacementConfirmationReviewRow,
)
from tests.relation.evaluation.grid_fixtures import write_grid_concat


@dataclass(frozen=True, slots=True, kw_only=True)
class _Inputs:
    deck: VerifiedDeck
    soft_labels: SoftLabelsArtifact
    positive: tuple[SoftLabel, SoftLabel]
    ambiguous: SoftLabel


def _label(
    card: EvaluationCard,
    *,
    proximal: int = 0,
    overlay: int = 0,
    unclear: int = 0,
) -> SoftLabel:
    tally = PlacementTally(proximal=proximal, overlay=overlay)
    return SoftLabel(
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        producer=card.producer,
        family_id=card.family_id,
        prescreen_stratum=card.prescreen_stratum,
        tally=tally,
        unclear_votes=unclear,
        abstentions=0,
        posterior=placement_posterior(tally),
        refined=False,
        review=False,
    )


@pytest.fixture
def inputs(tmp_path: Path) -> _Inputs:
    deck = load_deck(write_grid_concat(tmp_path / "cards"))
    cards = tuple(sorted(deck.cards, key=lambda card: card.relation_id)[:3])
    positive = (_label(cards[0], proximal=4), _label(cards[1], overlay=2, proximal=1))
    ambiguous = _label(cards[2], unclear=5)
    soft_labels = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        (ambiguous, *positive),
        source_hashes={"cards.jsonl": deck.source_hashes["cards.jsonl"]},
    )
    return _Inputs(deck=deck, soft_labels=soft_labels, positive=positive, ambiguous=ambiguous)


def _row(
    label: SoftLabel,
    action: PlacementConfirmationAction = "proximal",
) -> PlacementConfirmationRow:
    return PlacementConfirmationRow(
        relation_id=label.relation_id,
        card_hash=label.card_hash,
        action=action,
    )


def test_publication_load_roundtrip_accepts_a_voluntary_subset(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    first, _second = inputs.positive
    published = publish_placement_confirmations(
        output_directory=tmp_path / "confirmations",
        confirmations=(_row(first),),
        reviewer="Grace Confirmer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    assert published.manifest.counts.rows == 1
    assert published.manifest.counts.placement == 1
    assert published.manifest.counts.excluded == 0

    loaded = load_placement_confirmations(
        published.paths.directory,
        soft_labels=inputs.soft_labels,
        expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
    )
    assert loaded.rows == published.rows
    assert loaded.manifest == published.manifest
    assert loaded.by_relation_id[first.relation_id].action == "proximal"


def test_publication_rejects_ambiguous_unlabeled_duplicate_and_drifted_rows(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    first, _second = inputs.positive

    with pytest.raises(ValueError, match="belongs to target resolutions"):
        publish_placement_confirmations(
            output_directory=tmp_path / "ambiguous",
            confirmations=(_row(inputs.ambiguous),),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    unlabeled = PlacementConfirmationRow(
        relation_id="wikidata:P9999999",
        card_hash=first.card_hash,
        action="proximal",
    )
    with pytest.raises(ValueError, match="unlabeled relation"):
        publish_placement_confirmations(
            output_directory=tmp_path / "unlabeled",
            confirmations=(unlabeled,),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    with pytest.raises(ValueError, match="repeat relation"):
        publish_placement_confirmations(
            output_directory=tmp_path / "duplicate",
            confirmations=(_row(first), _row(first, action="overlay")),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    drifted = PlacementConfirmationRow(
        relation_id=first.relation_id,
        card_hash=CardHash("0" * 64),
        action="proximal",
    )
    with pytest.raises(ValueError, match="card hash differs"):
        publish_placement_confirmations(
            output_directory=tmp_path / "drifted",
            confirmations=(drifted,),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )

    with pytest.raises(ValueError, match="nothing to publish"):
        publish_placement_confirmations(
            output_directory=tmp_path / "empty",
            confirmations=(),
            reviewer="reviewer",
            soft_labels=inputs.soft_labels,
            deck=inputs.deck,
        )


def test_loader_rejects_tampering(tmp_path: Path, inputs: _Inputs) -> None:
    first, _second = inputs.positive
    published = publish_placement_confirmations(
        output_directory=tmp_path / "confirmations",
        confirmations=(_row(first),),
        reviewer="reviewer",
        soft_labels=inputs.soft_labels,
        deck=inputs.deck,
    )
    payload = published.paths.rows_path.read_bytes().replace(b'"proximal"', b'"overlay"')
    published.paths.rows_path.write_bytes(payload)

    with pytest.raises(ValueError, match="decisions hash"):
        load_placement_confirmations(
            published.paths.directory,
            soft_labels=inputs.soft_labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_cards_manifest_hash=inputs.deck.source_hashes["cards.manifest.json"],
        )


def test_review_publishes_confirmed_subset_and_cancel_publishes_nothing(
    tmp_path: Path,
    inputs: _Inputs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: list[tuple[PlacementConfirmationReviewRow, ...]] = []
    first, second = inputs.positive

    def confirm(
        rows: Iterable[PlacementConfirmationReviewRow],
    ) -> tuple[PlacementConfirmationDecision, ...]:
        offered = tuple(rows)
        observed.append(offered)
        return (
            PlacementConfirmationDecision(
                relation_id=first.relation_id,
                card_hash=first.card_hash,
                action="proximal",
            ),
        )

    monkeypatch.setattr(confirmation_module, "run_placement_confirmation", confirm)
    published = confirm_placements(
        soft_labels=inputs.soft_labels.path,
        deck=inputs.deck.directory,
        reviewer="Grace Confirmer",
        output_directory=tmp_path / "confirmed",
    )
    [offered] = observed
    assert tuple(row.relation_id for row in offered) == tuple(
        sorted((first.relation_id, second.relation_id))
    )
    offered_by_relation = {row.relation_id: row for row in offered}
    assert offered_by_relation[first.relation_id].proximal_votes == 4
    assert offered_by_relation[second.relation_id].overlay_votes == 2
    assert inputs.ambiguous.relation_id not in offered_by_relation
    assert tuple(row.relation_id for row in published.rows) == (first.relation_id,)

    monkeypatch.setattr(
        confirmation_module,
        "run_placement_confirmation",
        lambda _rows: None,
    )
    cancelled = tmp_path / "cancelled"
    with pytest.raises(PlacementConfirmationCancelledError, match="no artifact"):
        confirm_placements(
            soft_labels=inputs.soft_labels.path,
            deck=inputs.deck.directory,
            reviewer="reviewer",
            output_directory=cancelled,
        )
    assert not cancelled.exists()
