"""Stratified sampling plan tests: caps, floors, overrides, determinism."""

from __future__ import annotations

import json

import pyarrow as pa
import pyarrow.parquet as pq

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.dump import ENTITY_SCHEMA, extract_entities
from atlas_tools.wikidata.manifest import build_sampling_plan, primary_class
from tests.wikidata.conftest import DUMP_EXCERPT


def test_primary_class_is_lexicographically_smallest():
    assert primary_class(["Q515", "Q11424"]) == "Q11424"  # string order
    assert primary_class(["Q5"]) == "Q5"
    assert primary_class([]) is None


def _synthetic_entities(tmp_path):
    """Skewed classes: Q1 x 100, Q2 x 4 (rare), Q3 x 30 (override cap)."""
    rows = []

    def add(qid, p31):
        rows.append(
            {
                "qid": qid,
                "p31": p31,
                "sitelink_count": 1,
                "label_count": 1,
                "label_len_primary": 5,
                "label_len_min": 5,
                "label_len_mean": 5.0,
                "label_len_max": 5,
            }
        )

    next_q = 1
    for _ in range(100):
        add(f"Q{next_q + 1000}", ["Q1"])
        next_q += 1
    for _ in range(4):
        add(f"Q{next_q + 1000}", ["Q2"])
        next_q += 1
    for _ in range(30):
        add(f"Q{next_q + 1000}", ["Q3"])
        next_q += 1
    add(f"Q{next_q + 1000}", [])  # no P31: excluded from plan
    next_q += 1
    add(f"Q{next_q + 1000}", ["Q3", "Q1"])  # multi-P31: primary is Q1

    path = tmp_path / "entities.parquet"
    pq.write_table(pa.Table.from_pylist(rows, schema=ENTITY_SCHEMA), path)
    return path


def _config(**stratification):
    return Config.from_dict(
        {
            "seed": 3,
            "stratification": {
                "default_cap": 10,
                "rare_floor": 5,
                "per_class_caps": {"Q3": 3},
                **stratification,
            },
        }
    )


def test_caps_floors_and_overrides_honored(tmp_path):
    entities = _synthetic_entities(tmp_path)
    summary = build_sampling_plan(
        entities, config=_config(), out_path=tmp_path / "plan.parquet"
    )
    # Q1: 100 entities + 1 multi-P31 -> capped at default 10.
    # Q2: 4 <= rare_floor 5 -> all kept.
    # Q3: 30 -> per-class override cap 3.
    assert summary["classes"] == {
        "Q1": {"total": 101, "sampled": 10},
        "Q2": {"total": 4, "sampled": 4},
        "Q3": {"total": 30, "sampled": 3},
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

    with open(tmp_path / "plan.parquet.meta.json", encoding="utf-8") as f:
        sidecar = json.load(f)
    assert sidecar["details"]["excluded_no_p31"] == 1
    assert sidecar["seed"] == 3  # seed lives in the provenance envelope


def test_plan_is_deterministic_across_runs(tmp_path):
    entities = _synthetic_entities(tmp_path)
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "a.parquet")
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "b.parquet")
    assert (tmp_path / "a.parquet").read_bytes() == (
        tmp_path / "b.parquet"
    ).read_bytes()


def test_seed_changes_selection_for_capped_classes(tmp_path):
    entities = _synthetic_entities(tmp_path)
    build_sampling_plan(entities, config=_config(), out_path=tmp_path / "a.parquet")
    other = Config.from_dict({**_config().raw, "seed": 4})
    build_sampling_plan(entities, config=other, out_path=tmp_path / "b.parquet")
    a = {
        r["qid"]
        for r in pq.read_table(tmp_path / "a.parquet").to_pylist()
        if r["p31_class"] == "Q1"
    }
    b = {
        r["qid"]
        for r in pq.read_table(tmp_path / "b.parquet").to_pylist()
        if r["p31_class"] == "Q1"
    }
    assert len(a) == len(b) == 10
    assert a != b  # 10-of-101 draws with different seeds coincide with p ~ 1e-13


def test_per_class_override_is_respected_end_to_end(tmp_path):
    entities = _synthetic_entities(tmp_path)
    summary = build_sampling_plan(
        entities,
        config=_config(per_class_caps={"Q3": 7}),
        out_path=tmp_path / "plan.parquet",
    )
    assert summary["classes"]["Q3"] == {"total": 30, "sampled": 7}


def test_plan_on_committed_excerpt(config, tmp_path):
    with open(DUMP_EXCERPT, "rb") as stream:
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
    assert summary["classes"] == {
        "Q5": {"total": 80, "sampled": 10},
        "Q4830453": {"total": 40, "sampled": 10},
        "Q515": {"total": 25, "sampled": 3},
        "Q571": {"total": 20, "sampled": 10},
        "Q11424": {"total": 12, "sampled": 10},
        "Q3305213": {"total": 8, "sampled": 8},
        "Q7889": {"total": 6, "sampled": 6},
        "Q34770": {"total": 4, "sampled": 4},
        "Q16521": {"total": 3, "sampled": 3},
        "Q23397": {"total": 2, "sampled": 2},
    }
