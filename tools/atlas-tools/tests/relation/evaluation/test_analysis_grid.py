import math
from datetime import UTC, datetime, timedelta

import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    GridAnalysisError,
    PlacementTally,
    analyze_grid,
    coincident_queue,
    nomination_queue,
    placement_argmax,
    placement_posterior,
    soft_labels,
    vote_economics,
)
from atlas_tools.relation.evaluation.domain.api import (
    EvaluationCard,
    ProviderResult,
    RelationId,
    Vote,
    VoteVerdict,
)

_NOW = datetime(2026, 1, 2, tzinfo=UTC)
_PROMPT_PACK_HASH = sha256_bytes(b"analysis prompt pack")
_FAMILIES = ("judge/a", "judge/b")


def _card(relation_id: RelationId) -> EvaluationCard:
    text = f"Evaluation card for {relation_id}"
    return EvaluationCard(
        relation_id=relation_id,
        producer="test",
        card_text=text,
        card_hash=sha256_bytes(text.encode()),
        token_count=4,
        prescreen_stratum="ordinary",
        family_id="test-family",
    )


def _vote(
    card: EvaluationCard,
    family_id: str,
    repeat_index: int,
    verdict: VoteVerdict,
    *,
    cost: float = 0.1,
) -> Vote:
    model = f"test/{family_id}"
    result = ProviderResult.model_validate(
        {
            "id": f"result-{family_id}-{repeat_index}",
            "model": model,
            "choices": [{"message": {"content": f'{{"verdict":"{verdict}"}}'}}],
            "usage": {
                "prompt_tokens": 3,
                "completion_tokens": 2,
                "cost": cost,
            },
        },
        strict=True,
    )
    vote_id = sha256_bytes(
        f"{card.relation_id}|{family_id}|{repeat_index}".encode(),
    )
    return Vote(
        vote_id=vote_id,
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        family_id=family_id,
        provider="test-provider",
        model_returned=model,
        shell_id="S1",
        framing_id="F1",
        bundle_id="S1xF1",
        rubric_version="rubric-v1",
        prompt_pack_hash=_PROMPT_PACK_HASH,
        verdict=verdict,
        reason="fixture evidence",
        raw_completion=f'{{"verdict":"{verdict}"}}',
        parse_retries=0,
        abstained=verdict == "ABSTAIN",
        attempt_results=(result,),
        effort="minimal",
        temperature=0.0,
        seed=7,
        repeat_index=repeat_index,
        tokens_in=3,
        tokens_out=2,
        tokens_cached=0,
        known_cost_usd=cost,
        cost_complete=True,
        cost_usd=cost,
        ts_request=_NOW,
        ts_response=_NOW,
        latency=timedelta(),
    )


def _analysis() -> GridAnalysis:
    stable = _card("test:A-stable")
    refined = _card("test:B-refined")
    imported = (
        _vote(refined, "judge/a", 0, "coincident", cost=9.0),
        _vote(stable, "judge/a", 0, "proximal", cost=9.0),
    )
    fresh = (
        _vote(refined, "judge/b", 2, "unclear"),
        _vote(stable, "judge/b", 0, "proximal"),
        _vote(refined, "judge/a", 2, "coincident"),
        _vote(refined, "judge/b", 0, "proximal"),
        _vote(refined, "judge/a", 1, "coincident"),
        _vote(refined, "judge/b", 1, "proximal"),
    )
    return analyze_grid(
        cards=(refined, stable),
        family_ids=tuple(reversed(_FAMILIES)),
        imported_votes=imported,
        fresh_votes=fresh,
    )


def test_grid_reconciliation_drives_posteriors_queues_labels_and_economics() -> None:
    analysis = _analysis()
    stable, refined = analysis.cards

    assert analysis.family_ids == _FAMILIES
    assert (stable.card.relation_id, refined.card.relation_id) == (
        "test:A-stable",
        "test:B-refined",
    )
    assert not stable.refined
    assert refined.refined
    assert tuple(family.baseline.source for family in stable.families) == (
        "imported",
        "fresh",
    )
    assert stable.tally.model_dump(exclude={"n_votes", "total_responses"}) == {
        "coincident": 0,
        "proximal": 2,
        "overlay": 0,
        "unclear": 0,
        "abstentions": 0,
    }
    assert (
        stable.posterior.coincident,
        stable.posterior.proximal,
        stable.posterior.overlay,
        stable.posterior.unclear,
    ) == pytest.approx((1 / 6, 3 / 6, 1 / 6, 1 / 6))
    assert refined.tally.model_dump(exclude={"n_votes", "total_responses"}) == {
        "coincident": 3,
        "proximal": 2,
        "overlay": 0,
        "unclear": 1,
        "abstentions": 0,
    }
    assert (
        refined.posterior.coincident,
        refined.posterior.proximal,
        refined.posterior.overlay,
        refined.posterior.unclear,
    ) == pytest.approx((0.4, 0.3, 0.1, 0.2))
    expected_entropy = -math.fsum(
        probability * math.log(probability) for probability in (0.4, 0.3, 0.1, 0.2)
    ) / math.log(4)
    assert refined.posterior.normalized_entropy == pytest.approx(expected_entropy)

    [coincident] = coincident_queue(analysis)
    assert coincident.relation_id == refined.card.relation_id
    assert coincident.coincident_families == ("judge/a",)
    assert tuple(vote.verdict for vote in coincident.votes) == (
        "coincident",
        "coincident",
        "coincident",
        "proximal",
        "proximal",
        "unclear",
    )
    [nomination] = nomination_queue(analysis, fraction=0.5)
    assert nomination.relation_id == refined.card.relation_id

    stable_label, refined_label = soft_labels(analysis)
    assert stable_label.n_votes == 2
    assert (
        stable_label.posterior.coincident,
        stable_label.posterior.proximal,
        stable_label.posterior.overlay,
    ) == pytest.approx((0.2, 0.6, 0.2))
    assert refined_label.n_votes == 5
    assert refined_label.unclear_votes == 1
    assert refined_label.abstentions == 0
    assert refined_label.review
    assert (
        refined_label.posterior.coincident,
        refined_label.posterior.proximal,
        refined_label.posterior.overlay,
    ) == pytest.approx((0.5, 0.375, 0.125))

    economics = vote_economics(analysis)
    family_a, family_b = economics.by_family
    assert (
        family_a.imported_votes,
        family_a.fresh_baseline_votes,
        family_a.refinement_votes,
        family_a.known_cost_usd,
    ) == pytest.approx((2, 0, 2, 0.2))
    assert (
        family_b.imported_votes,
        family_b.fresh_baseline_votes,
        family_b.refinement_votes,
        family_b.known_cost_usd,
    ) == pytest.approx((0, 2, 2, 0.4))
    assert economics.total_votes == 8
    assert economics.total_known_cost_usd == pytest.approx(0.6)
    assert economics.refined_cards == 1
    assert economics.realized_trigger_rate == pytest.approx(0.5)
    assert economics.review_queue_cards == 1


def test_placement_argmax_uses_documented_order_for_equal_probabilities() -> None:
    posterior = placement_posterior(PlacementTally())

    assert placement_argmax(posterior) == "coincident"


def test_split_baseline_requires_every_refinement_cell() -> None:
    card = _card("test:missing-refinement")
    baseline = (
        _vote(card, "judge/a", 0, "proximal"),
        _vote(card, "judge/b", 0, "overlay"),
    )
    refinements = (
        _vote(card, "judge/a", 1, "proximal"),
        _vote(card, "judge/a", 2, "proximal"),
        _vote(card, "judge/b", 1, "overlay"),
    )

    with pytest.raises(GridAnalysisError, match=r"refined card .* lacks repeat 2 for judge/b"):
        analyze_grid(
            cards=(card,),
            family_ids=_FAMILIES,
            imported_votes=(),
            fresh_votes=(*baseline, *refinements),
        )


def test_unanimous_baseline_rejects_unplanned_refinement_cells() -> None:
    card = _card("test:unexpected-refinement")
    baseline = (
        _vote(card, "judge/a", 0, "proximal"),
        _vote(card, "judge/b", 0, "proximal"),
    )

    with pytest.raises(GridAnalysisError, match=r"unrefined card .* contains repeat 1"):
        analyze_grid(
            cards=(card,),
            family_ids=_FAMILIES,
            imported_votes=(),
            fresh_votes=(*baseline, _vote(card, "judge/a", 1, "proximal")),
        )


def test_import_and_fresh_streams_cannot_claim_the_same_logical_vote() -> None:
    card = _card("test:duplicate")

    with pytest.raises(GridAnalysisError, match=r"vote ID .* occurs more than once"):
        analyze_grid(
            cards=(card,),
            family_ids=_FAMILIES,
            imported_votes=(_vote(card, "judge/a", 0, "proximal"),),
            fresh_votes=(
                _vote(card, "judge/a", 0, "proximal"),
                _vote(card, "judge/b", 0, "proximal"),
            ),
        )
