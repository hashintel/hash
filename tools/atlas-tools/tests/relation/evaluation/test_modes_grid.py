import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    GridJudge,
    GridRunConfig,
    ModelId,
    PanelConfig,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    ReasoningEffort,
    VoteId,
    VoteTask,
    VoteVerdict,
)
from atlas_tools.relation.evaluation.modes.api import (
    GridCanaryPlan,
    GridCard,
    GridPhaseAPlan,
    GridPhaseBPlan,
    GridPlan,
    IncompleteBaselineError,
)

PROMPT_PACK_HASH = PromptPackHash(sha256_bytes(b"prompt pack"))


def _card(relation_id: str) -> GridCard:
    return GridCard(
        relation_id=relation_id,
        card_hash=CardHash(sha256_bytes(relation_id.encode())),
    )


def _judge(model: str, *, effort: ReasoningEffort = "minimal") -> GridJudge:
    return GridJudge(
        provider_slug=ProviderSlug(f"provider-{model}"),
        provider_name=ProviderName(f"Provider {model}"),
        model=ModelId(model),
        temperature=0.0,
        seed=7,
        effort=effort,
        pilot_cost_per_vote_usd=0.01,
    )


def _config() -> GridRunConfig:
    return GridRunConfig(
        panel=PanelConfig(version=1, frozen=True, pruning_floor="fixture floor"),
        judges=(_judge("model-a", effort="high"), _judge("model-b")),
    )


def _baseline_id(judge: GridJudge, card: GridCard) -> VoteId:
    return VoteTask(
        judge=judge,
        bundle_id="S1xF1",
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        effort=judge.effort,
        repeat_index=0,
        prompt_pack_hash=PROMPT_PACK_HASH,
        rubric_version="rubric-v1",
    ).vote_id


def test_grid_phase_a_skips_exact_imports_and_interleaves_remaining_cells() -> None:
    config = _config()
    card_a = _card("test:A")
    card_b = _card("test:B")
    card_c = _card("test:C")
    judge_a, judge_b = config.judges
    imported = frozenset(
        {
            _baseline_id(judge_a, card_a),
            _baseline_id(judge_b, card_b),
        }
    )
    plan = GridPhaseAPlan(
        config=config,
        cards=(card_c, card_a, card_b),
        prompt_pack_hash=PROMPT_PACK_HASH,
        imported_vote_ids=imported,
    )

    tasks = tuple(plan.tasks())

    assert plan.expected_votes == 4
    assert tuple((task.judge.family_id, task.relation_id) for task in tasks) == (
        ("model-a", "test:B"),
        ("model-b", "test:A"),
        ("model-a", "test:C"),
        ("model-b", "test:C"),
    )
    assert tuple(task.effort for task in tasks) == ("high", "minimal", "high", "minimal")
    assert tuple(task.vote_id for task in tasks) == tuple(task.vote_id for task in plan.tasks())


def test_grid_phase_a_rejects_imports_from_another_baseline() -> None:
    with pytest.raises(ValueError, match="outside the grid baseline"):
        GridPhaseAPlan(
            config=_config(),
            cards=(_card("test:A"),),
            prompt_pack_hash=PROMPT_PACK_HASH,
            imported_vote_ids=frozenset({VoteId(sha256_bytes(b"unrelated vote"))}),
        )


def test_grid_phase_b_selects_each_trigger_and_preserves_repeat_order() -> None:
    config = _config()
    cards = (
        _card("test:split"),
        _card("test:stable"),
        _card("test:coincident"),
        _card("test:abstain"),
    )
    judge_a, judge_b = config.judges
    baseline: dict[VoteId, VoteVerdict] = {}
    verdict_rows: dict[str, tuple[VoteVerdict, VoteVerdict]] = {
        "test:stable": ("proximal", "proximal"),
        "test:coincident": ("coincident", "coincident"),
        "test:split": ("proximal", "overlay"),
        "test:abstain": ("ABSTAIN", "proximal"),
    }
    by_relation = {card.relation_id: card for card in cards}
    for relation_id, verdicts in verdict_rows.items():
        card = by_relation[relation_id]
        baseline[_baseline_id(judge_a, card)] = verdicts[0]
        baseline[_baseline_id(judge_b, card)] = verdicts[1]
    baseline[VoteId(sha256_bytes(b"already committed refinement"))] = "overlay"

    phase_b = GridPhaseBPlan.from_baseline(
        config=config,
        cards=cards,
        prompt_pack_hash=PROMPT_PACK_HASH,
        verdicts_by_vote_id=baseline,
    )
    tasks = tuple(phase_b.tasks())

    assert tuple(card.relation_id for card in phase_b.cards) == (
        "test:abstain",
        "test:coincident",
        "test:split",
    )
    assert phase_b.expected_votes == 12
    assert tuple((task.judge.family_id, task.relation_id, task.repeat_index) for task in tasks) == (
        ("model-a", "test:abstain", 1),
        ("model-b", "test:abstain", 1),
        ("model-a", "test:abstain", 2),
        ("model-b", "test:abstain", 2),
        ("model-a", "test:coincident", 1),
        ("model-b", "test:coincident", 1),
        ("model-a", "test:coincident", 2),
        ("model-b", "test:coincident", 2),
        ("model-a", "test:split", 1),
        ("model-b", "test:split", 1),
        ("model-a", "test:split", 2),
        ("model-b", "test:split", 2),
    )
    assert all(task.bundle_id == "S1xF1" for task in tasks)


def test_grid_phase_b_fails_before_refining_an_incomplete_baseline() -> None:
    config = _config()
    card = _card("test:A")
    judge_a, _ = config.judges
    partial: dict[VoteId, VoteVerdict] = {_baseline_id(judge_a, card): "proximal"}

    with pytest.raises(IncompleteBaselineError, match=r"test:A.*model-b"):
        GridPhaseBPlan.from_baseline(
            config=config,
            cards=(card,),
            prompt_pack_hash=PROMPT_PACK_HASH,
            verdicts_by_vote_id=partial,
        )


def test_grid_plan_is_the_replayable_phase_a_then_phase_b_stream() -> None:
    config = _config()
    card = _card("test:A")
    phase_a = GridPhaseAPlan(
        config=config,
        cards=(card,),
        prompt_pack_hash=PROMPT_PACK_HASH,
    )
    baseline: dict[VoteId, VoteVerdict] = {
        _baseline_id(judge, card): "coincident" for judge in config.judges
    }
    phase_b = GridPhaseBPlan.from_baseline(
        config=config,
        cards=(card,),
        prompt_pack_hash=PROMPT_PACK_HASH,
        verdicts_by_vote_id=baseline,
    )
    canary = GridCanaryPlan(
        config=config,
        cards=(card,),
        prompt_pack_hash=PROMPT_PACK_HASH,
    )
    plan = GridPlan(phase_a=phase_a, phase_b=phase_b, canary=canary)

    first = tuple(plan.tasks())
    replay = tuple(plan.tasks())

    assert plan.analysis_votes == 6
    assert plan.expected_votes == 8
    assert tuple(task.repeat_index for task in first) == (0, 0, 1, 1, 2, 2, 3, 3)
    assert tuple(task.vote_id for task in first) == tuple(task.vote_id for task in replay)
