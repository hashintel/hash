"""Build a small verified grid whose vote pattern exercises both phases."""

from datetime import timedelta
from pathlib import Path
from typing import Literal

import yaml
from pydantic import JsonValue

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import concat_relations
from atlas_tools.relation.evaluation.domain.api import (
    ConcurrencyConfig,
    GridJudge,
    GridRunConfig,
    ModelId,
    PanelConfig,
    ProviderName,
    ProviderSlug,
    TransientRetryConfig,
    Verdict,
)
from atlas_tools.relation.evaluation.modes.api import FEW_SHOTS, HOLDOUTS
from atlas_tools.relation_cards.common.cards import CardRow, RelationSourceSpec

MALFORMED = "MALFORMED"
type ScriptedAnswer = Verdict | Literal["MALFORMED"]

CARD_A = "P9000001"
CARD_B = "P9000002"
CARD_C = "P9000003"
CARD_D = "P9000004"
CARD_E = "P9000005"

_LIVE_CARDS = {
    CARD_A: "fam-a",
    CARD_B: "fam-a",
    CARD_C: "fam-b",
    CARD_D: "fam-c",
    CARD_E: "fam-c",
}
_HOLDOUT_VERDICTS: dict[str, Verdict] = {
    holdout.relation_id.removeprefix("wikidata:"): holdout.verdict for holdout in HOLDOUTS
}
_HOLDOUT_VERDICTS["P3403"] = "proximal"
_HOLDOUT_FAMILIES = {
    local_id: f"fam-h{index}" for index, local_id in enumerate(sorted(_HOLDOUT_VERDICTS), start=1)
}
POOL_CARDS = _LIVE_CARDS | _HOLDOUT_FAMILIES

JUDGE_MODELS = ("test/j1", "test/j2", "test/j3", "test/j4", "test/j5")
_COINCIDENT_JUDGE = "test/j2"
_ABSTAIN_JUDGE = "test/j3"
_OVERLAY_JUDGES = frozenset({"test/j4", "test/j5"})

EXPECTED_REFINED_CARDS = 3
EXPECTED_TOTAL_VOTES = (
    len(POOL_CARDS) * len(JUDGE_MODELS)
    + (EXPECTED_REFINED_CARDS * len(JUDGE_MODELS) * 2)
    + len(HOLDOUTS) * len(JUDGE_MODELS)
)


def scripted_answer(model: str, local_id: str) -> ScriptedAnswer:
    """Return a panel pattern with coincident, split, and abstention triggers."""
    holdout = _HOLDOUT_VERDICTS.get(local_id)
    if holdout is not None:
        return holdout
    if local_id == CARD_A:
        return "proximal"
    if local_id == CARD_B:
        return "overlay"
    if local_id == CARD_C:
        return "coincident" if model == _COINCIDENT_JUDGE else "proximal"
    if local_id == CARD_D:
        return "overlay" if model in _OVERLAY_JUDGES else "proximal"
    if local_id == CARD_E:
        return MALFORMED if model == _ABSTAIN_JUDGE else "unclear"
    raise KeyError(f"fixture has no scripted card {local_id}")


def write_grid_concat(directory: Path, *, include_families: bool = True) -> Path:
    """Write a real schema-v2 concat artifact for the grid integration test."""
    source = directory.with_name(f"{directory.name}-source")
    source.mkdir()
    cards_path = source / "cards.jsonl"
    rows: list[CardRow] = []
    for relation_id in sorted(shot.relation_id for shot in FEW_SHOTS):
        card_text = f"relation card for {relation_id}"
        rows.append(
            CardRow.model_validate(
                {
                    "relation_id": relation_id,
                    "pid": relation_id.removeprefix("wikidata:"),
                    "card_text": card_text,
                    "card_hash": sha256_bytes(card_text.encode()),
                    "token_count": len(card_text.split()),
                    "truncations": [],
                    "severely_truncated": False,
                }
            )
        )
    for local_id, family_id in POOL_CARDS.items():
        relation_id = f"wikidata:{local_id}"
        card_text = f"relation card for {relation_id}"
        payload: dict[str, JsonValue] = {
            "relation_id": relation_id,
            "pid": local_id,
            "card_text": card_text,
            "card_hash": sha256_bytes(card_text.encode()),
            "token_count": len(card_text.split()),
            "truncations": [],
            "severely_truncated": False,
        }
        if include_families:
            payload["family_id"] = family_id
        rows.append(CardRow.model_validate(payload))
    cards_path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))
    Provenance[JsonValue, JsonValue].make(
        producer="test.wikidata-cards",
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config={},
        details={
            "relation_source": RelationSourceSpec(
                namespace="wikidata",
                local_id_field="pid",
            ).model_dump(mode="json")
        },
    ).write(source / "cards.manifest.json")
    directory.mkdir()
    concat_relations([source], out=directory)
    return directory


def _grid_judge(model: str) -> GridJudge:
    slug = model.removeprefix("test/")
    return GridJudge(
        provider_slug=ProviderSlug(f"test-provider/{slug}"),
        provider_name=ProviderName(f"Provider {slug}"),
        model=ModelId(model),
        temperature=0.0,
        seed=17,
        effort="minimal",
        pilot_cost_per_vote_usd=0.01,
    )


def grid_config() -> GridRunConfig:
    """Return the frozen five-seat grid used by the integration test."""
    return GridRunConfig(
        panel=PanelConfig(
            version=1,
            frozen=True,
            pruning_floor="fixture floor: gold agreement >= 0.75",
        ),
        request_timeout=timedelta(seconds=5),
        transient_retries=TransientRetryConfig(
            maximum_attempts=1,
            initial_delay=timedelta(),
            maximum_delay=timedelta(),
        ),
        concurrency=ConcurrencyConfig(initial=1, maximum=1),
        judges=tuple(_grid_judge(model) for model in JUDGE_MODELS),
    )


def write_grid_config(path: Path, config: GridRunConfig) -> Path:
    """Persist a strict grid configuration through the supported YAML boundary."""
    path.write_text(
        yaml.safe_dump(config.model_dump(mode="json"), sort_keys=True),
        encoding="utf-8",
    )
    return path
