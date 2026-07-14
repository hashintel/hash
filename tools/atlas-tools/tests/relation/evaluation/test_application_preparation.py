import hashlib
import json
from collections import Counter
from collections.abc import Iterable
from pathlib import Path

import pytest
import trio

from atlas_tools.relation.evaluation.application.api import (
    prepare_grid_inputs,
    prepare_pilot_inputs,
    prepare_pilot_inputs_async,
)
from atlas_tools.relation.evaluation.domain.api import (
    CorpusRecord,
    EmbeddingConfig,
    ModelId,
    PhysicalAttempt,
    SliceRecord,
    Vote,
)
from tests.relation.evaluation.grid_fixtures import (
    grid_config,
    write_grid_concat,
    write_grid_config,
)

ROOT = Path(__file__).parents[3]
PILOT_CONFIG = ROOT / "config/eval/pilot.yaml"
GRID_CONFIG = ROOT / "config/eval/grid.yaml"
DECK = ROOT / "runs/cards"
PAID_PILOT = ROOT / "runs/evaluate"

type ArtifactRow = CorpusRecord | PhysicalAttempt | SliceRecord | Vote


def _jsonl_hash(rows: Iterable[ArtifactRow]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(
            json.dumps(
                row.model_dump(mode="json"),
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        )
        digest.update(b"\n")
    return digest.hexdigest()


def test_paid_pilot_preparation_reproduces_prompt_slice_and_plan_inputs() -> None:
    prepared = prepare_pilot_inputs(PILOT_CONFIG, DECK)

    assert prepared.loaded_config.content_hash == (
        "0d507221880b5e956b10b82a6161e05358ef3bbc2e4b2b29829be1874cc63df7"
    )
    assert prepared.prompt_pack.content_hash == (
        "c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2"
    )
    assert prepared.slice_derivation.sampling_config_hash == (
        "7c4203190a487a09264e7c7c97f184c51c4e744336059e6e69857c90dffa8388"
    )
    assert prepared.slice_derivation.selection_hash == (
        "c60ea72afd3d4c0554e748a9d7c190c3af226f7000333b7aa32d3a80e8c71142"
    )
    assert _jsonl_hash(prepared.slice_records) == (
        "bcbc7d5cd040dfc3280b309115220d4bd38e0efcb42d46d24fd1186e024aa3b7"
    )
    assert len(prepared.slice_records) == 150
    assert prepared.full_grid_card_count == 1670
    assert prepared.plan.expected_votes == 14_796


def test_current_grid_preparation_imports_the_exact_paid_baseline() -> None:
    prepared = prepare_grid_inputs(
        GRID_CONFIG,
        DECK,
        pilot_directory=PAID_PILOT,
    )

    assert prepared.config.schema_version == 4
    assert prepared.config.panel.version == 2
    assert prepared.config.panel.frozen is True
    assert prepared.panel_hash == (
        "c5051313a3d70a7410242ff56952ccea8adc8c438d1a8eed6e39791357fbb7c1"
    )
    assert len(prepared.pool) == 1_670
    assert len(prepared.corpus) == 1_684
    assert sum(row.is_shot_excluded for row in prepared.corpus) == 14
    assert sum(row.is_holdout for row in prepared.corpus) == 6
    assert _jsonl_hash(prepared.corpus) == (
        "4f707448ac6368b7b9af0548997aa7c16c2622ad2254f3927d5d23a956a80778"
    )

    assert len(prepared.baseline_by_vote_id) == 8_350
    assert len(prepared.imported_by_vote_id) == 750
    assert len(prepared.pilot_import.attempts) == 810
    assert Counter(vote.family_id for vote in prepared.pilot_import.votes) == {
        judge.family_id: 150 for judge in prepared.config.judges
    }
    assert _jsonl_hash(prepared.pilot_import.votes) == (
        "2ce86e1d6b2d5538106a0e8a65778f2429a4f0721aadff19f621ae92da0a0e74"
    )
    assert _jsonl_hash(prepared.pilot_import.attempts) == (
        "9726d09ec8a69ba506f646d96515e084985de87602fe5906112ea5e8f4088072"
    )

    imported_ids = frozenset(prepared.imported_by_vote_id)
    fresh_ids = frozenset(task.vote_id for task in prepared.phase_a.tasks())
    assert len(fresh_ids) == 7_600
    assert imported_ids.isdisjoint(fresh_ids)
    assert imported_ids | fresh_ids == frozenset(prepared.baseline_by_vote_id)


def test_async_pilot_preparation_preserves_the_paid_artifact_identity() -> None:
    async def scenario() -> None:
        prepared = await prepare_pilot_inputs_async(PILOT_CONFIG, DECK)
        assert prepared.prompt_pack.content_hash == (
            "c5c617cb6f5b114c6d0f30c01004427669d6247c80da1b692a9acc4e242979e2"
        )
        assert prepared.slice_derivation.selection_hash == (
            "c60ea72afd3d4c0554e748a9d7c190c3af226f7000333b7aa32d3a80e8c71142"
        )

    trio.run(scenario)


def test_classifier_cohort_preflight_precedes_pilot_import_and_provider_work(
    tmp_path: Path,
) -> None:
    cards = write_grid_concat(tmp_path / "cards", include_families=False)
    config = grid_config().model_copy(
        update={
            "embedding": EmbeddingConfig(
                endpoint_url="https://embedding.test/v1/embeddings",
                model=ModelId("test/embedding"),
                dimension=2,
            )
        }
    )
    config_path = write_grid_config(tmp_path / "grid.yaml", config)

    with pytest.raises(
        ValueError,
        match="11 cards lack family_id",
    ):
        prepare_grid_inputs(
            config_path,
            cards,
            pilot_directory=tmp_path / "pilot-does-not-exist",
        )
