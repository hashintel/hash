"""W2b: P31-stratified sampling plan for vec2slug retraining.

Consumes the per-entity parquet produced by ``dump.py`` and emits a sampling
plan parquet. No entity documents are fetched or serialized; the downstream
corpus builder consumes this plan.

Documented decisions:

- Primary class: the lexicographically smallest P31 QID string (e.g. an
  entity with P31 = [Q515, Q11424] gets primary class "Q11424"). Entities
  with an empty P31 list are excluded from the plan; their count is recorded
  in the sidecar as ``excluded_no_p31``.
- Only sampled rows are emitted (no ``sampled`` bool column).
- Per class of size n: if ``n <= rare_floor`` ALL entities are kept (the
  floor takes precedence over any cap); otherwise ``min(n, cap)`` entities
  are sampled, where cap is the per-class override or ``default_cap``.
- Determinism: within a class, entities are sorted by numeric QID and
  sampled with ``np.random.default_rng([seed, class_number])`` — the
  per-class seed derivation makes each class's sample independent of
  iteration order and of other classes. Output rows are sorted by numeric
  QID globally.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from atlas_tools.common.provenance import (
    provenance_block,
    sha256_file,
    write_sidecar,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import pid_number

PLAN_SCHEMA = pa.schema(
    [
        pa.field("qid", pa.string()),
        pa.field("p31_class", pa.string()),  # primary class (see docstring)
        pa.field("sitelink_count", pa.int32()),
        pa.field("label_count", pa.int32()),
        pa.field("label_len_primary", pa.int32()),
        pa.field("label_len_min", pa.int32()),
        pa.field("label_len_mean", pa.float64()),
        pa.field("label_len_max", pa.int32()),
    ]
)


def primary_class(p31: list[str]) -> str | None:
    """Lexicographically smallest P31 QID string, or None when P31 is empty."""
    return min(p31) if p31 else None


def class_cap(cls: str, config: Config) -> int:
    return config.stratification.per_class_caps.get(
        cls, config.stratification.default_cap
    )


def build_sampling_plan(
    entities_path: Path | str,
    *,
    config: Config,
    out_path: Path | str,
) -> dict[str, Any]:
    entities_path = Path(entities_path)
    out_path = Path(out_path)
    table = pq.read_table(entities_path)
    rows = table.to_pylist()

    by_class: dict[str, list[dict[str, Any]]] = {}
    excluded_no_p31 = 0
    for row in rows:
        cls = primary_class(row["p31"])
        if cls is None:
            excluded_no_p31 += 1
            continue
        by_class.setdefault(cls, []).append(row)

    floor = config.stratification.rare_floor
    selected: list[dict[str, Any]] = []
    class_counts: dict[str, dict[str, int]] = {}
    for cls in sorted(by_class):
        members = sorted(by_class[cls], key=lambda r: pid_number(r["qid"]))
        n = len(members)
        if n <= floor:
            chosen = members
        else:
            k = min(n, class_cap(cls, config))
            rng = np.random.default_rng([config.seed, pid_number(cls)])
            indices = np.sort(rng.choice(n, size=k, replace=False))
            chosen = [members[i] for i in indices]
        class_counts[cls] = {"total": n, "sampled": len(chosen)}
        for row in chosen:
            selected.append(
                {
                    "qid": row["qid"],
                    "p31_class": cls,
                    "sitelink_count": row["sitelink_count"],
                    "label_count": row["label_count"],
                    "label_len_primary": row["label_len_primary"],
                    "label_len_min": row["label_len_min"],
                    "label_len_mean": row["label_len_mean"],
                    "label_len_max": row["label_len_max"],
                }
            )

    selected.sort(key=lambda r: pid_number(r["qid"]))
    plan = pa.Table.from_pylist(selected, schema=PLAN_SCHEMA)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(plan, out_path)

    sidecar = {
        "rows": plan.num_rows,
        "classes": class_counts,
        "excluded_no_p31": excluded_no_p31,
        "primary_class_rule": "lexicographically smallest P31 QID string",
        "emit_rule": "only sampled rows are emitted",
        **provenance_block(
            producer="wikidata.sampling-plan",
            inputs={"entities": sha256_file(entities_path)},
            config=config.raw,
            seed=config.seed,
        ),
    }
    write_sidecar(out_path.with_name(out_path.name + ".meta.json"), sidecar)
    return {"rows": plan.num_rows, "classes": class_counts}
