import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    CardHash,
    JudgeConfig,
    ModelId,
    PilotRunConfig,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    ReasoningEffort,
    SliceSamplingConfig,
)
from atlas_tools.relation.evaluation.modes.api import PilotCard, PilotPlan

PROMPT_PACK_HASH = PromptPackHash(sha256_bytes(b"prompt pack"))


def _card(relation_id: str, *, holdout: bool) -> PilotCard:
    return PilotCard(
        relation_id=relation_id,
        card_hash=CardHash(sha256_bytes(relation_id.encode())),
        is_holdout=holdout,
    )


def _judge(model: str, *, higher_effort: ReasoningEffort | None) -> JudgeConfig:
    return JudgeConfig(
        provider_slug=ProviderSlug(f"provider-{model}"),
        provider_name=ProviderName(f"Provider {model}"),
        model=ModelId(model),
        temperature=0.0,
        seed=7,
        higher_effort=higher_effort,
    )


def _config() -> PilotRunConfig:
    return PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=2,
        judges=(
            _judge("model-a", higher_effort="high"),
            _judge("model-b", higher_effort=None),
        ),
    )


def test_pilot_plan_preserves_factorial_arm_order_and_replays() -> None:
    ordinary = _card("test:A", holdout=False)
    holdout = _card("test:B", holdout=True)
    plan = PilotPlan(
        config=_config(),
        cards=(holdout, ordinary),
        prompt_pack_hash=PROMPT_PACK_HASH,
    )

    first = tuple(plan.tasks())
    replay = tuple(plan.tasks())

    assert plan.expected_votes == 42
    assert tuple(task.vote_id for task in first) == tuple(task.vote_id for task in replay)
    assert (
        tuple(task.judge.family_id for task in first[:40])
        == (
            "model-a",
            "model-b",
        )
        * 20
    )
    assert tuple(task.judge.family_id for task in first[40:]) == ("model-a", "model-a")

    family_a = tuple(task for task in first if task.judge.family_id == "model-a")
    assert tuple(
        (task.relation_id, task.bundle_id, task.effort, task.repeat_index) for task in family_a[:6]
    ) == (
        ("test:A", "S1xF1", "minimal", 0),
        ("test:B", "S1xF1", "minimal", 0),
        ("test:A", "S1xF1", "minimal", 1),
        ("test:A", "S1xF1", "minimal", 2),
        ("test:A", "S1xF1", "high", 0),
        ("test:B", "S1xF1", "high", 0),
    )
    assert tuple(
        (task.bundle_id, task.relation_id)
        for task in family_a
        if task.effort == "minimal" and task.repeat_index == 0
    ) == tuple((bundle, relation) for bundle in BUNDLES for relation in ("test:A", "test:B"))

    family_b = tuple(task for task in first if task.judge.family_id == "model-b")
    assert tuple(
        (task.relation_id, task.bundle_id, task.effort, task.repeat_index) for task in family_b[:5]
    ) == (
        ("test:A", "S1xF1", "minimal", 0),
        ("test:B", "S1xF1", "minimal", 0),
        ("test:A", "S1xF1", "minimal", 1),
        ("test:A", "S1xF1", "minimal", 2),
        ("test:A", "S1xF2", "minimal", 0),
    )


def test_pilot_plan_rejects_duplicate_relations_before_creating_vote_ids() -> None:
    duplicate = _card("test:A", holdout=False)

    with pytest.raises(ValueError, match="duplicate relation ID test:A"):
        PilotPlan(
            config=_config(),
            cards=(duplicate, duplicate),
            prompt_pack_hash=PROMPT_PACK_HASH,
        )


def test_pilot_plan_matches_the_completed_paid_run_vote_count() -> None:
    config = PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=144),
        repeat_count=1,
        judges=tuple(_judge(f"model-{index}", higher_effort="high") for index in range(9)),
    )
    cards = tuple(_card(f"test:{index:03}", holdout=index >= 144) for index in range(150))

    plan = PilotPlan(config=config, cards=cards, prompt_pack_hash=PROMPT_PACK_HASH)

    assert plan.expected_votes == 14_796
