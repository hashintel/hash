import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from atlas_tools.common import canonical_json_bytes, sha256_bytes
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
    export_reviewed_verdicts,
    publish_target_resolutions,
)
from atlas_tools.relation.evaluation.application.reviewed_verdicts import (
    REVIEWED_VERDICTS_SCHEMA,
    ReviewedVerdictsArtifact,
    ReviewedVerdictsDocument,
)
from atlas_tools.relation.evaluation.application.target_resolution import (
    VerifiedTargetResolutionArtifact,
)
from atlas_tools.relation.evaluation.domain.api import (
    EvaluationCard,
    TargetResolutionAction,
    TargetResolutionRow,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from tests.relation.evaluation.grid_fixtures import write_grid_concat

_REVIEWER = "Ada Reviewer"
_AMBIGUOUS_ACTIONS: tuple[TargetResolutionAction, ...] = (
    "coincident",
    "excluded",
    "proximal",
    "overlay",
)


@dataclass(frozen=True, slots=True, kw_only=True)
class _Inputs:
    deck: VerifiedDeck
    soft_labels: SoftLabelsArtifact
    resolutions: VerifiedTargetResolutionArtifact


def _label(card: EvaluationCard, *, coincident: int = 0, unclear: int = 0) -> SoftLabel:
    tally = PlacementTally(coincident=coincident)
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
        review=coincident > 0,
    )


@pytest.fixture
def inputs(tmp_path: Path) -> _Inputs:
    deck = load_deck(write_grid_concat(tmp_path / "cards"))
    cards = tuple(sorted(deck.cards, key=lambda card: card.relation_id)[:5])
    ambiguous = tuple(_label(card, unclear=3) for card in cards[:4])
    positive = _label(cards[4], coincident=3)
    soft_labels = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        (positive, *ambiguous),
        source_hashes={"cards.jsonl": deck.source_hashes["cards.jsonl"]},
    )
    resolutions = publish_target_resolutions(
        output_directory=tmp_path / "resolutions",
        resolutions=tuple(
            TargetResolutionRow(
                relation_id=label.relation_id,
                card_hash=label.card_hash,
                action=action,
            )
            for label, action in zip(ambiguous, _AMBIGUOUS_ACTIONS, strict=True)
        ),
        reviewer=_REVIEWER,
        soft_labels=soft_labels,
        deck=deck,
    )
    return _Inputs(deck=deck, soft_labels=soft_labels, resolutions=resolutions)


def _export(inputs: _Inputs, output_path: Path) -> ReviewedVerdictsArtifact:
    return export_reviewed_verdicts(
        resolutions_directory=inputs.resolutions.paths.directory,
        soft_labels_path=inputs.soft_labels.path,
        cards_directory=inputs.deck.directory,
        output_path=output_path,
    )


def test_export_emits_sorted_human_placements_without_exclusions(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    output = tmp_path / "reviewed-verdicts.json"
    artifact = _export(inputs, output)

    payload = output.read_bytes()
    assert payload.endswith(b"\n")
    assert artifact.content_hash == sha256_bytes(payload)

    document = json.loads(payload)
    placements = {
        row.relation_id: row.action for row in inputs.resolutions.rows if row.action != "excluded"
    }
    assert document == {
        "schema": REVIEWED_VERDICTS_SCHEMA,
        "type_verdicts": [
            {"class": action, "relation": relation_id, "reviewer": _REVIEWER}
            for relation_id, action in sorted(placements.items())
        ],
        "pair_verdicts": [],
        "sources": {
            **dict(inputs.resolutions.manifest.source_hashes),
            "target-resolutions/target-resolutions.jsonl": inputs.resolutions.rows_hash,
            "target-resolutions/target-resolutions.manifest.json": (
                inputs.resolutions.manifest_hash
            ),
        },
    }
    verdict_relations = [verdict["relation"] for verdict in document["type_verdicts"]]
    assert verdict_relations == sorted(verdict_relations)
    assert len(verdict_relations) == len(set(verdict_relations))

    assert artifact.coincident_count == 1
    assert artifact.proximal_count == 1
    assert artifact.overlay_count == 1
    assert artifact.excluded_count == 1


def test_export_is_deterministic_and_round_trips_strictly(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    first = _export(inputs, tmp_path / "first.json")
    second = _export(inputs, tmp_path / "second.json")
    assert first.content_hash == second.content_hash
    payload = (tmp_path / "first.json").read_bytes()
    assert payload == (tmp_path / "second.json").read_bytes()

    document = ReviewedVerdictsDocument.model_validate_json(payload, strict=True)
    assert canonical_json_bytes(document) + b"\n" == payload


def test_export_rejects_tampered_resolutions(tmp_path: Path, inputs: _Inputs) -> None:
    rows_path = inputs.resolutions.paths.rows_path
    rows_path.write_bytes(rows_path.read_bytes().replace(b'"excluded"', b'"proximal"'))

    with pytest.raises(ValueError, match="decisions hash"):
        _export(inputs, tmp_path / "reviewed-verdicts.json")


def test_document_rejects_excluded_and_unknown_fields() -> None:
    verdict = {"class": "excluded", "relation": "wikidata:P22", "reviewer": _REVIEWER}
    payload = {
        "schema": REVIEWED_VERDICTS_SCHEMA,
        "type_verdicts": [verdict],
        "pair_verdicts": [],
        "sources": {},
    }
    with pytest.raises(ValueError, match="class"):
        ReviewedVerdictsDocument.model_validate(payload, strict=True)

    with pytest.raises(ValueError, match="extra_forbidden"):
        ReviewedVerdictsDocument.model_validate(
            {**payload, "type_verdicts": [], "node_rows": []},
            strict=True,
        )
