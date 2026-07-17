"""Stratified sampling plan tests: caps, floors, overrides, determinism."""

import json
from pathlib import Path

import pyarrow.parquet as pq

from atlas_tools.wikidata.config import Config, StratificationConfig
from atlas_tools.wikidata.dump import EntityRow, extract_entities, rows_to_table
from atlas_tools.wikidata.manifest import (
    ClassSampleCount,
    build_sampling_plan,
    primary_class,
)
from tests.wikidata.conftest import DUMP_EXCERPT


def test_primary_class_is_lexicographically_smallest() -> None:
    assert primary_class(("Q515", "Q11424")) == "Q11424"  # string order
    assert primary_class(("Q5",)) == "Q5"
    assert primary_class(()) is None


def _entity(qid: str, p31: tuple[str, ...]) -> EntityRow:
    return EntityRow(
        qid=qid,
        p31=p31,
        sitelink_count=1,
        label_count=1,
        label_len_primary=5,
        label_len_min=5,
        label_len_mean=5.0,
        label_len_max=5,
    )


def _synthetic_entities(tmp_path: Path) -> Path:
    """Skewed classes: Q1 x 100, Q2 x 4 (rare), Q3 x 30 (override cap)."""
    rows: list[EntityRow] = []
    next_qid = 1001
    for _ in range(100):
        rows.append(_entity(f"Q{next_qid}", ("Q1",)))
        next_qid += 1
    for _ in range(4):
        rows.append(_entity(f"Q{next_qid}", ("Q2",)))
        next_qid += 1
    for _ in range(30):
        rows.append(_entity(f"Q{next_qid}", ("Q3",)))
        next_qid += 1
    rows.append(_entity(f"Q{next_qid}", ()))  # no P31: excluded from plan
    next_qid += 1
    rows.append(_entity(f"Q{next_qid}", ("Q3", "Q1")))  # multi-P31: primary Q1

    path = tmp_path / "entities.parquet"
    pq.write_table(rows_to_table(rows), path)
    return path


def _config(stratification: StratificationConfig | None = None) -> Config:
    if stratification is None:
        stratification = StratificationConfig(
            default_cap=10, rare_floor=5, per_class_caps={"Q3": 3}
        )
    return Config.model_validate(
        {"extraction": {"seed": 3, "stratification": stratification.model_dump()}}
    )


def test_caps_floors_and_overrides_honored(tmp_path: Path) -> None:
    entities = _synthetic_entities(tmp_path)
    summary = build_sampling_plan(entities, config=_config(), out_path=tmp_path / "plan.parquet")
    # Q1: 100 entities + 1 multi-P31 -> capped at default 10.
    # Q2: 4 <= rare_floor 5 -> all kept.
    # Q3: 30 -> per-class override cap 3.
    assert summary.classes == {
        "Q1": ClassSampleCount(total=101, sampled=10),
        "Q2": ClassSampleCount(total=4, sampled=4),
        "Q3": ClassSampleCount(total=30, sampled=3),
    }

    table = pq.read_table(tmp_path / "plan.parquet")
    assert table.num_rows == 17
    rows = table.to_pylist()
    # Only sampled rows are emitted; class column is the primary class.
    by_class: dict[str, int] = {}
    for row in rows:
        by_class[row["p31_class"]] = by_class.get(row["p31_class"], 0) + 1
    assert by_class == {"Q1": 10, "Q2": 4, "Q3": 3}
    # Output ordered by numeric QID.
    qids = [row["qid"] for row in rows]
    assert qids == sorted(qids, key=lambda q: int(q[1:]))

    with (tmp_path / "plan.parquet.meta.json").open(encoding="utf-8") as sidecar_file:
        sidecar = json.load(sidecar_file)
    assert sidecar["details"]["excluded_no_p31"] == 1
    assert sidecar["seed"] == 3  # seed lives in the provenance envelope


def test_plan_is_deterministic_across_runs(tmp_path: Path) -> None:
    entities = _synthetic_entities(tmp_path)
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "a.parquet")
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "b.parquet")
    assert (tmp_path / "a.parquet").read_bytes() == (tmp_path / "b.parquet").read_bytes()


def test_seed_changes_selection_for_capped_classes(tmp_path: Path) -> None:
    entities = _synthetic_entities(tmp_path)
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "a.parquet")
    base = _config()
    other_extraction = base.extraction.model_copy(update={"seed": 4})
    other = base.model_copy(update={"extraction": other_extraction})
    build_sampling_plan(entities, config=other, out_path=tmp_path / "b.parquet")
    a = {
        row["qid"]
        for row in pq.read_table(tmp_path / "a.parquet").to_pylist()
        if row["p31_class"] == "Q1"
    }
    b = {
        row["qid"]
        for row in pq.read_table(tmp_path / "b.parquet").to_pylist()
        if row["p31_class"] == "Q1"
    }
    assert len(a) == len(b) == 10
    assert a != b  # 10-of-101 draws with different seeds coincide with p ~ 1e-13


def test_per_class_override_is_respected_end_to_end(tmp_path: Path) -> None:
    entities = _synthetic_entities(tmp_path)
    summary = build_sampling_plan(
        entities,
        config=_config(
            StratificationConfig(default_cap=10, rare_floor=5, per_class_caps={"Q3": 7})
        ),
        out_path=tmp_path / "plan.parquet",
    )
    assert summary.classes["Q3"] == ClassSampleCount(total=30, sampled=7)


def test_plan_on_committed_excerpt(config: Config, tmp_path: Path) -> None:
    with DUMP_EXCERPT.open("rb") as stream:
        extract_entities(
            stream,
            config=config,
            out_path=tmp_path / "entities.parquet",
            checkpoint_dir=tmp_path / "ckpt",
            input_name=DUMP_EXCERPT.name,
        )
    summary = build_sampling_plan(
        tmp_path / "entities.parquet", config=config, out_path=tmp_path / "plan.parquet"
    )
    # Fixture config: default_cap 10, rare_floor 5, override Q515 -> 3.
    expected = {
        "Q5": (13, 10),
        "Q4830453": (12, 10),
        "Q515": (11, 3),
        "Q571": (10, 10),
        "Q11424": (6, 6),
        "Q3305213": (3, 3),
        "Q7889": (2, 2),
        "Q34770": (1, 1),
        "Q16521": (1, 1),
        "Q23397": (1, 1),
    }
    assert summary.classes == {
        class_qid: ClassSampleCount(total=total, sampled=sampled)
        for class_qid, (total, sampled) in expected.items()
    }
