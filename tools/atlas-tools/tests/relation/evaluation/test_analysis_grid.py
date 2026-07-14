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
    AttemptId,
    CardHash,
    EvaluationCard,
    JudgeFamilyId,
    JudgeRequestSpec,
    ModelId,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    RelationFamilyId,
    RelationId,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VoteProvenance,
    VoteRequest,
    VoteTiming,
    VoteVerdict,
)

_NOW = datetime(2026, 1, 2, tzinfo=UTC)
_PROMPT_PACK_HASH = PromptPackHash(sha256_bytes(b"analysis prompt pack"))
_FAMILY_A = JudgeFamilyId("judge/a")
_FAMILY_B = JudgeFamilyId("judge/b")
_FAMILIES = (_FAMILY_A, _FAMILY_B)


def _card(relation_id: RelationId) -> EvaluationCard:
    text = f"Evaluation card for {relation_id}"
    return EvaluationCard(
        relation_id=relation_id,
        producer="test",
        card_text=text,
        card_hash=CardHash(sha256_bytes(text.encode())),
        token_count=4,
        prescreen_stratum="ordinary",
        family_id=RelationFamilyId("test-family"),
    )


def _vote(
    card: EvaluationCard,
    family_id: JudgeFamilyId,
    repeat_index: int,
    verdict: VoteVerdict,
    *,
    cost: float = 0.1,
    cost_complete: bool = True,
) -> Vote:
    model = ModelId(family_id)
    vote_id = VoteId(
        sha256_bytes(f"{card.relation_id}|{family_id}|{repeat_index}".encode()),
    )
    return Vote(
        identity=VoteIdentity(vote_id=vote_id, relation_id=card.relation_id),
        provenance=VoteProvenance(
            card_hash=card.card_hash,
            rubric_version="rubric-v1",
            prompt_pack_hash=_PROMPT_PACK_HASH,
        ),
        request=VoteRequest(
            judge=JudgeRequestSpec(
                provider_name=ProviderName("test-provider"),
                provider_slug=ProviderSlug("test-provider"),
                model=model,
            ),
            bundle_id="S1xF1",
            effort="minimal",
            temperature=0.0,
            seed=7,
            repeat_index=repeat_index,
        ),
        decision=VoteDecision(
            verdict=verdict,
            reason="fixture evidence",
            raw_completion=f'{{"verdict":"{verdict}"}}',
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=(
                AttemptId(sha256_bytes(f"attempt:{vote_id}".encode())),
            ),
            model_returned=model,
        ),
        accounting=VoteAccounting(
            tokens_in=3,
            tokens_out=2,
            tokens_cached=0,
            known_cost_usd=cost,
            cost_complete=cost_complete,
        ),
        timing=VoteTiming(
            request_at=_NOW,
            response_at=_NOW,
            latency=timedelta(),
        ),
    )


def _analysis(*, incomplete_fresh_cost: bool = False) -> GridAnalysis:
    stable = _card("test:A-stable")
    refined = _card("test:B-refined")
    imported = (
        _vote(refined, _FAMILY_A, 0, "coincident", cost=9.0),
        _vote(stable, _FAMILY_A, 0, "proximal", cost=9.0),
    )
    fresh = (
        _vote(
            refined,
            _FAMILY_B,
            2,
            "unclear",
            cost_complete=not incomplete_fresh_cost,
        ),
        _vote(stable, _FAMILY_B, 0, "proximal"),
        _vote(refined, _FAMILY_A, 2, "coincident"),
        _vote(refined, _FAMILY_B, 0, "proximal"),
        _vote(refined, _FAMILY_A, 1, "coincident"),
        _vote(refined, _FAMILY_B, 1, "proximal"),
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
    assert economics.cost_complete
    assert economics.refined_cards == 1
    assert economics.realized_trigger_rate == pytest.approx(0.5)
    assert economics.review_queue_cards == 1


def test_vote_economics_preserves_incomplete_fresh_billing_by_family() -> None:
    economics = vote_economics(_analysis(incomplete_fresh_cost=True))

    family_a, family_b = economics.by_family
    assert family_a.cost_complete
    assert not family_b.cost_complete
    assert not economics.cost_complete
    assert economics.total_known_cost_usd == pytest.approx(0.6)


def test_placement_argmax_uses_documented_order_for_equal_probabilities() -> None:
    posterior = placement_posterior(PlacementTally())

    assert placement_argmax(posterior) == "coincident"


def test_split_baseline_requires_every_refinement_cell() -> None:
    card = _card("test:missing-refinement")
    baseline = (
        _vote(card, _FAMILY_A, 0, "proximal"),
        _vote(card, _FAMILY_B, 0, "overlay"),
    )
    refinements = (
        _vote(card, _FAMILY_A, 1, "proximal"),
        _vote(card, _FAMILY_A, 2, "proximal"),
        _vote(card, _FAMILY_B, 1, "overlay"),
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
        _vote(card, _FAMILY_A, 0, "proximal"),
        _vote(card, _FAMILY_B, 0, "proximal"),
    )

    with pytest.raises(GridAnalysisError, match=r"unrefined card .* contains repeat 1"):
        analyze_grid(
            cards=(card,),
            family_ids=_FAMILIES,
            imported_votes=(),
            fresh_votes=(*baseline, _vote(card, _FAMILY_A, 1, "proximal")),
        )


def test_import_and_fresh_streams_cannot_claim_the_same_logical_vote() -> None:
    card = _card("test:duplicate")

    with pytest.raises(GridAnalysisError, match=r"vote ID .* occurs more than once"):
        analyze_grid(
            cards=(card,),
            family_ids=_FAMILIES,
            imported_votes=(_vote(card, _FAMILY_A, 0, "proximal"),),
            fresh_votes=(
                _vote(card, _FAMILY_A, 0, "proximal"),
                _vote(card, _FAMILY_B, 0, "proximal"),
            ),
        )
