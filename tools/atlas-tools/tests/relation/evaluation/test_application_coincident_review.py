"""Exercise immutable, source-bound Coincident review artifacts."""

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest

import atlas_tools.relation.evaluation.application.coincident_review as review_module
from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    GridGatePolicy,
    HoldoutRule,
    PlacementTally,
    analyze_grid,
    placement_posterior,
    soft_labels,
)
from atlas_tools.relation.evaluation.application.analysis_codec import write_soft_labels
from atlas_tools.relation.evaluation.application.api import (
    CoincidentReviewCancelledError,
    GridDeliverablesRun,
    classifier_coincident_review_binding,
    classifier_coincident_review_source_hashes,
    load_classifier_coincident_reviews,
    load_coincident_reviews,
    publish_coincident_reviews,
    review_coincident_queue,
)
from atlas_tools.relation.evaluation.application.grid_deliverables import (
    derive_grid_deliverables,
    publish_grid_deliverables,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    CoincidentReviewRow,
    CoincidentReviewSourceName,
    JudgeFamilyId,
    coincident_review_artifact_id,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from atlas_tools.relation.evaluation.visualization.api import (
    CoincidentReviewDecision,
    CoincidentReviewViewRow,
)
from tests.relation.evaluation.grid_fixtures import CARD_A, CARD_C, write_grid_concat
from tests.relation.evaluation.test_analysis_grid import _vote
from tests.relation.evaluation.test_application_grid_deliverables import (
    _canaries,
    _pilot_decisions,
    _sources,
    _summary,
)

_FAMILY_A = JudgeFamilyId("judge/a")
_FAMILY_B = JudgeFamilyId("judge/b")


@dataclass(frozen=True, slots=True, kw_only=True)
class _Inputs:
    deck: VerifiedDeck
    deliverables: GridDeliverablesRun
    analysis: GridAnalysis


@pytest.fixture
def inputs(tmp_path: Path) -> _Inputs:
    deck = load_deck(write_grid_concat(tmp_path / "cards"))
    cards = (
        deck.by_relation_id[f"wikidata:{CARD_A}"],
        deck.by_relation_id[f"wikidata:{CARD_C}"],
    )
    votes = tuple(
        _vote(
            card,
            family_id,
            repeat_index,
            "coincident" if family_id == _FAMILY_A else "proximal",
        )
        for card in cards
        for family_id in (_FAMILY_A, _FAMILY_B)
        for repeat_index in (0, 1, 2)
    )
    analysis = analyze_grid(
        cards=tuple(reversed(cards)),
        family_ids=(_FAMILY_B, _FAMILY_A),
        imported_votes=(),
        fresh_votes=tuple(reversed(votes)),
    )
    canaries = _canaries(analysis)
    gate_policy = GridGatePolicy(
        holdouts=tuple(
            HoldoutRule(
                relation_id=card.relation_id,
                accepted_verdicts=frozenset({"coincident", "proximal"}),
            )
            for card in cards
        ),
        holdout_minimum_correct=2,
        abstention_ceiling=0.05,
        cost_ceiling_usd=2.0,
    )
    products = derive_grid_deliverables(
        analysis,
        canary_votes=canaries,
        pilot_decisions=_pilot_decisions(),
        gate_policy=gate_policy,
        routing_violations=0,
    )
    sources = _sources()
    sources.update(deck.source_hashes)
    deliverables = publish_grid_deliverables(
        products,
        summary=_summary(analysis, canaries),
        gate_policy=gate_policy,
        source_hashes=sources,
        output_directory=tmp_path / "deliverables",
    )
    assert len(deliverables.products.coincident) == 2
    return _Inputs(deck=deck, deliverables=deliverables, analysis=analysis)


def _reviews(inputs: _Inputs) -> tuple[CoincidentReviewRow, CoincidentReviewRow]:
    first, second = inputs.deliverables.products.coincident
    return (
        CoincidentReviewRow(
            relation_id=second.relation_id,
            card_hash=second.card_hash,
            action="excluded",
        ),
        CoincidentReviewRow(
            relation_id=first.relation_id,
            card_hash=first.card_hash,
            action="rejected",
        ),
    )


def test_publication_load_roundtrip_is_sorted_exact_and_source_bound(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    published = publish_coincident_reviews(
        output_directory=tmp_path / "reviews",
        reviews=_reviews(inputs),
        reviewer="Ada Reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    loaded = load_coincident_reviews(
        published.paths.directory,
        deliverables=inputs.deliverables.directory,
        deck=inputs.deck.directory,
    )
    queue = inputs.deliverables.products.coincident

    assert loaded == published
    assert tuple(row.relation_id for row in loaded.rows) == tuple(row.relation_id for row in queue)
    assert loaded.by_relation_id[queue[0].relation_id] == loaded.rows[0]
    assert loaded.manifest.counts.rows == 2
    assert loaded.manifest.counts.rejected == 1
    assert loaded.manifest.counts.excluded == 1
    assert loaded.manifest.counts.confirmed == 0
    assert set(loaded.manifest.source_hashes) == {
        "grid-deliverables/gates.json",
        "grid-deliverables/coincident-queue.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
    }
    documents = [json.loads(line) for line in loaded.paths.rows_path.read_text().splitlines()]
    assert all(document["schema_version"] == 2 for document in documents)
    assert loaded.manifest.schema_version == 2
    assert loaded.manifest.policy_id == "coincident-evidence-confirm-reject-or-exclude-v2"
    assert [document["relation_id"] for document in documents] == [row.relation_id for row in queue]


def test_classifier_loader_binds_reviews_to_soft_labels_and_grid(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    reviews = publish_coincident_reviews(
        output_directory=tmp_path / "reviews-for-classifier",
        reviews=_reviews(inputs),
        reviewer="Ada Reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    labels = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        soft_labels(inputs.analysis),
        source_hashes=dict(inputs.deliverables.artifact.source_hashes),
    )
    loaded = load_classifier_coincident_reviews(
        reviews.paths.directory,
        deliverables=inputs.deliverables.directory,
        soft_labels=labels,
        expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
        expected_config_hash=inputs.deliverables.artifact.source_hashes["grid-config.yaml"],
    )
    binding = classifier_coincident_review_binding(loaded)

    assert loaded.rows == reviews.rows
    assert binding.artifact_id == reviews.manifest.artifact_id
    assert binding.counts == reviews.manifest.counts
    assert classifier_coincident_review_source_hashes(loaded) == {
        "coincident-reviews/coincident-reviews.jsonl": reviews.rows_hash,
        "coincident-reviews/coincident-reviews.manifest.json": reviews.manifest_hash,
    }

    with pytest.raises(ValueError, match="different grid configuration"):
        load_classifier_coincident_reviews(
            reviews.paths.directory,
            deliverables=inputs.deliverables,
            soft_labels=labels,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
            expected_config_hash="f" * 64,
        )

    first = labels.rows[0]
    drifted_tally = PlacementTally(
        coincident=first.tally.coincident,
        proximal=first.tally.proximal - 1,
        overlay=first.tally.overlay,
    )
    drifted_labels = (
        first.model_copy(
            update={
                "tally": drifted_tally,
                "posterior": placement_posterior(drifted_tally),
            }
        ),
        *labels.rows[1:],
    )
    drifted_artifact = write_soft_labels(
        tmp_path / "drifted-soft-labels.parquet",
        drifted_labels,
        source_hashes=dict(inputs.deliverables.artifact.source_hashes),
    )
    with pytest.raises(ValueError, match="queue tally differs from soft label"):
        load_classifier_coincident_reviews(
            reviews.paths.directory,
            deliverables=inputs.deliverables,
            soft_labels=drifted_artifact,
            expected_cards_hash=inputs.deck.source_hashes["cards.jsonl"],
        )


def test_rejects_incomplete_extra_duplicate_and_card_hash_drift(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    reviews = _reviews(inputs)
    with pytest.raises(ValueError, match="do not cover"):
        publish_coincident_reviews(
            output_directory=tmp_path / "incomplete",
            reviews=reviews[:1],
            reviewer="reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    extra = CoincidentReviewRow(
        relation_id="test:extra",
        card_hash=CardHash("f" * 64),
        action="confirmed",
    )
    with pytest.raises(ValueError, match="extra relation"):
        publish_coincident_reviews(
            output_directory=tmp_path / "extra",
            reviews=(*reviews, extra),
            reviewer="reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    with pytest.raises(ValueError, match="repeat relation"):
        publish_coincident_reviews(
            output_directory=tmp_path / "duplicate",
            reviews=(reviews[0], reviews[0], reviews[1]),
            reviewer="reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    drifted = reviews[0].model_copy(update={"card_hash": CardHash("f" * 64)})
    with pytest.raises(ValueError, match="card hash differs"):
        publish_coincident_reviews(
            output_directory=tmp_path / "drifted",
            reviews=(drifted, reviews[1]),
            reviewer="reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )


def test_destination_is_immutable(tmp_path: Path, inputs: _Inputs) -> None:
    output = tmp_path / "reviews"
    published = publish_coincident_reviews(
        output_directory=output,
        reviews=_reviews(inputs),
        reviewer="first reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    before = {
        path.name: path.read_bytes()
        for path in (published.paths.rows_path, published.paths.manifest_path)
    }

    with pytest.raises(FileExistsError, match="already exists"):
        publish_coincident_reviews(
            output_directory=output,
            reviews=_reviews(inputs),
            reviewer="second reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    assert {path.name: path.read_bytes() for path in output.iterdir()} == before
    assert not (tmp_path / ".reviews.staging").exists()


def test_existing_publication_claim_is_preserved(
    tmp_path: Path,
    inputs: _Inputs,
) -> None:
    output = tmp_path / "reviews"
    staging = tmp_path / ".reviews.staging"
    staging.mkdir()
    marker = staging / "publisher-marker"
    marker.write_text("owned by another publisher")

    with pytest.raises(FileExistsError, match="publication already in progress"):
        publish_coincident_reviews(
            output_directory=output,
            reviews=_reviews(inputs),
            reviewer="reviewer",
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    assert not output.exists()
    assert marker.read_text() == "owned by another publisher"
    assert tuple(staging.iterdir()) == (marker,)


def test_cancel_publishes_nothing_and_view_rows_include_complete_evidence(
    tmp_path: Path,
    inputs: _Inputs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: list[tuple[CoincidentReviewViewRow, ...]] = []

    def cancel(
        rows: Iterable[CoincidentReviewViewRow],
    ) -> tuple[CoincidentReviewDecision, ...] | None:
        observed.append(tuple(rows))
        return None

    monkeypatch.setattr(review_module, "run_coincident_review", cancel)
    output = tmp_path / "cancelled"
    with pytest.raises(CoincidentReviewCancelledError, match="no artifact"):
        review_coincident_queue(
            deliverables=inputs.deliverables.directory,
            deck=inputs.deck.directory,
            reviewer="reviewer",
            output_directory=output,
        )

    assert not output.exists()
    assert tuple(row.relation_id for row in observed[0]) == tuple(
        row.relation_id for row in inputs.deliverables.products.coincident
    )
    for view, queued in zip(observed[0], inputs.deliverables.products.coincident, strict=True):
        assert view.card_text == inputs.deck.by_relation_id[view.relation_id].card_text
        assert view.card_hash == queued.card_hash
        assert view.coincident_families == queued.coincident_families
        assert len(view.votes) == len(queued.votes)
        assert tuple(
            (vote.family_id, vote.verdict, vote.repeat_index, vote.reason) for vote in view.votes
        ) == tuple(
            (vote.family_id, vote.verdict, vote.repeat_index, vote.reason) for vote in queued.votes
        )


def test_loader_rejects_row_and_manifest_tampering(tmp_path: Path, inputs: _Inputs) -> None:
    row_artifact = publish_coincident_reviews(
        output_directory=tmp_path / "row-tamper",
        reviews=_reviews(inputs),
        reviewer="reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    row_artifact.paths.rows_path.write_bytes(
        row_artifact.paths.rows_path.read_bytes().replace(b'"excluded"', b'"confirmed"')
    )
    with pytest.raises(ValueError, match="decisions hash"):
        load_coincident_reviews(
            row_artifact.paths.directory,
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )

    manifest_artifact = publish_coincident_reviews(
        output_directory=tmp_path / "manifest-tamper",
        reviews=_reviews(inputs),
        reviewer="reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    document = json.loads(manifest_artifact.paths.manifest_path.read_bytes())
    document["artifact_id"] = "0" * 64
    manifest_artifact.paths.manifest_path.write_bytes(canonical_json_bytes(document) + b"\n")
    with pytest.raises(ValueError, match="artifact_id"):
        load_coincident_reviews(
            manifest_artifact.paths.directory,
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )


@pytest.mark.parametrize(
    "source_name",
    [
        "grid-deliverables/gates.json",
        "grid-deliverables/coincident-queue.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
    ],
)
def test_loader_rejects_self_consistent_source_rebinding(
    tmp_path: Path,
    inputs: _Inputs,
    source_name: CoincidentReviewSourceName,
) -> None:
    artifact = publish_coincident_reviews(
        output_directory=tmp_path / f"rebinding-{source_name.replace('/', '-')}",
        reviews=_reviews(inputs),
        reviewer="reviewer",
        deliverables=inputs.deliverables,
        deck=inputs.deck,
    )
    source_hashes = dict(artifact.manifest.source_hashes)
    source_hashes[source_name] = "f" * 64
    artifact_id = coincident_review_artifact_id(
        reviewer=artifact.manifest.reviewer,
        source_hashes=source_hashes,
        decisions_hash=artifact.manifest.decisions_hash,
        counts=artifact.manifest.counts,
    )
    manifest = artifact.manifest.model_copy(
        update={"source_hashes": source_hashes, "artifact_id": artifact_id}
    )
    artifact.paths.manifest_path.write_bytes(canonical_json_bytes(manifest) + b"\n")

    with pytest.raises(ValueError, match="source hashes do not match"):
        load_coincident_reviews(
            artifact.paths.directory,
            deliverables=inputs.deliverables,
            deck=inputs.deck,
        )
