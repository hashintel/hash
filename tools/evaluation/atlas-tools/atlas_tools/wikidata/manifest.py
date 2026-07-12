"""P31-stratified sampling plan for vec2slug retraining.

Consumes the per-entity parquet produced by ``dump.py`` and emits a sampling
plan parquet. No entity documents are fetched or serialized; the downstream
corpus builder consumes this plan.

Documented decisions:

- Primary class: the lexicographically smallest P31 QID string (for
  example, an entity with P31 = [Q515, Q11424] gets primary class
  "Q11424"). Entities with an empty P31 list are excluded from the plan;
  their count is recorded in the sidecar as ``excluded_no_p31``.
- Only sampled rows are emitted (no ``sampled`` bool column).
- Per class of size n: if ``n <= rare_floor`` every entity is kept (the
  floor takes precedence over any cap); otherwise ``min(n, cap)`` entities
  are sampled, where cap is the per-class override or ``default_cap``.
- Determinism: within a class, entities are sorted by numeric QID and
  sampled with ``np.random.default_rng([seed, class_number])``. The
  per-class seed derivation makes each class's sample independent of
  iteration order and of other classes. Output rows are sorted by numeric
  QID globally.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common.provenance import (
    Provenance,
    sha256_file,
)
from atlas_tools.wikidata.config import Config, StratificationConfig
from atlas_tools.wikidata.dump import EntityRow
from atlas_tools.wikidata.model import pid_number


class ClassSampleCount(BaseModel):
    total: NonNegativeInt
    sampled: NonNegativeInt


class SamplingPlanDetails(BaseModel):
    """Sidecar details for the sampling plan.

    The entities parquet input hash lives in the envelope's
    ``input_hashes``.
    """

    rows: NonNegativeInt
    classes: dict[str, ClassSampleCount]
    excluded_no_p31: NonNegativeInt
    primary_class_rule: str
    emit_rule: str


SamplingPlanProvenance = Provenance[SamplingPlanDetails, Config]


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


class PlanRow(NamedTuple):
    """One sampled entity (field order == plan parquet column order)."""

    qid: str
    p31_class: str
    sitelink_count: int
    label_count: int
    label_len_primary: int | None
    label_len_min: int | None
    label_len_mean: float | None
    label_len_max: int | None


@dataclass(frozen=True)
class SamplingPlanSummary:
    rows: int
    classes: dict[str, ClassSampleCount]


def primary_class(p31: tuple[str, ...]) -> str | None:
    """Lexicographically smallest P31 QID string, or None when P31 is empty."""
    return min(p31) if p31 else None


def class_cap(class_qid: str, stratification: StratificationConfig) -> int:
    return stratification.per_class_caps.get(class_qid, stratification.default_cap)


def _read_entity_rows(entities_path: Path) -> list[EntityRow]:
    """Load the extractor's parquet back into typed rows (dump order)."""
    table = pq.read_table(entities_path)
    return [
        EntityRow(
            qid=row["qid"],
            p31=tuple(row["p31"]),
            sitelink_count=row["sitelink_count"],
            label_count=row["label_count"],
            label_len_primary=row["label_len_primary"],
            label_len_min=row["label_len_min"],
            label_len_mean=row["label_len_mean"],
            label_len_max=row["label_len_max"],
        )
        for row in table.to_pylist()
    ]


def _plan_table(rows: list[PlanRow]) -> pa.Table:
    columns = list(zip(*rows, strict=True)) if rows else [[] for _ in PLAN_SCHEMA]
    arrays = [
        pa.array(column, type=field.type)
        for column, field in zip(columns, PLAN_SCHEMA, strict=True)
    ]
    return pa.Table.from_arrays(arrays, schema=PLAN_SCHEMA)


def build_sampling_plan(
    entities_path: Path | str,
    *,
    config: Config,
    out_path: Path | str,
) -> SamplingPlanSummary:
    entities_path = Path(entities_path)
    out_path = Path(out_path)
    stratification = config.extraction.stratification
    seed = config.extraction.seed

    by_class: dict[str, list[EntityRow]] = {}
    excluded_no_p31 = 0
    for row in _read_entity_rows(entities_path):
        row_class = primary_class(row.p31)
        if row_class is None:
            excluded_no_p31 += 1
            continue
        by_class.setdefault(row_class, []).append(row)

    floor = stratification.rare_floor
    selected: list[PlanRow] = []
    class_counts: dict[str, ClassSampleCount] = {}
    for row_class in sorted(by_class):
        members = sorted(by_class[row_class], key=lambda row: pid_number(row.qid))
        total = len(members)
        if total <= floor:
            chosen = members
        else:
            sample_size = min(total, class_cap(row_class, stratification))
            rng = np.random.default_rng([seed, pid_number(row_class)])
            indices = np.sort(rng.choice(total, size=sample_size, replace=False))
            chosen = [members[i] for i in indices]
        class_counts[row_class] = ClassSampleCount(total=total, sampled=len(chosen))
        selected.extend(
            PlanRow(
                qid=row.qid,
                p31_class=row_class,
                sitelink_count=row.sitelink_count,
                label_count=row.label_count,
                label_len_primary=row.label_len_primary,
                label_len_min=row.label_len_min,
                label_len_mean=row.label_len_mean,
                label_len_max=row.label_len_max,
            )
            for row in chosen
        )

    selected.sort(key=lambda row: pid_number(row.qid))
    plan = _plan_table(selected)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(plan, out_path)

    SamplingPlanProvenance.make(
        producer="wikidata.sampling-plan",
        input_hashes={"entities": sha256_file(entities_path)},
        config=config,
        seed=seed,
        details=SamplingPlanDetails(
            rows=plan.num_rows,
            classes=class_counts,
            excluded_no_p31=excluded_no_p31,
            primary_class_rule="lexicographically smallest P31 QID string",
            emit_rule="only sampled rows are emitted",
        ),
    ).write(out_path.with_name(out_path.name + ".meta.json"))
    return SamplingPlanSummary(rows=plan.num_rows, classes=class_counts)
