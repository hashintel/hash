from pathlib import Path

import pytest

from atlas_tools.relation.evaluation.application.api import (
    RubricVotePrompt,
    prepare_pilot_inputs,
)
from atlas_tools.relation.evaluation.modes.api import RETRY_INSTRUCTION

ROOT = Path(__file__).parents[3]


def test_prompt_adapter_proves_card_identity_and_preserves_repair_shape() -> None:
    prepared = prepare_pilot_inputs(ROOT / "config/eval/pilot.yaml", ROOT / "runs/cards")
    task = next(prepared.plan.tasks())
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )

    initial = prompt.initial(task)
    assert len(initial) == 30
    assert initial[0].role == "system"
    assert initial[-1].role == "user"
    assert prepared.deck.by_relation_id[task.relation_id].card_text in initial[-1].content

    malformed = "not a response object"
    repaired = prompt.repair(initial, malformed)
    assert repaired[:-2] == initial
    assert (repaired[-2].role, repaired[-2].content) == ("assistant", malformed)
    assert (repaired[-1].role, repaired[-1].content) == ("user", RETRY_INSTRUCTION)

    parsed = prompt.parse('prefix {"reason":"same entity","verdict":"COINCIDENT"}')
    assert parsed.verdict == "coincident"
    assert parsed.reason == "same entity"


def test_prompt_adapter_rejects_card_drift_before_request_construction() -> None:
    prepared = prepare_pilot_inputs(ROOT / "config/eval/pilot.yaml", ROOT / "runs/cards")
    task = next(prepared.plan.tasks()).model_copy(update={"card_hash": "0" * 64})
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )

    with pytest.raises(ValueError, match="card hash drifted"):
        prompt.initial(task)
