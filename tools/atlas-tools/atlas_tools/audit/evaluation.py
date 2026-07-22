"""Typed report and provenance models for the prefix audit.

:class:`RunnerReport` is the schema of ``report.json``; :data:`RunnerProvenance` is the
envelope written to ``report.meta.json``. Metric fields round to six decimal places on
validation, so a report re-validated from disk is equal to the model that produced it.
"""

from pathlib import Path
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, NonNegativeInt

from atlas_tools.common import Dim, K, Provenance, Sha256Hex


def round_to(ndigits: int, /) -> AfterValidator:
    return AfterValidator(lambda v: round(v, ndigits))


class FlagReport(BaseModel):
    column: str
    value: str

    dim: Dim
    k: K

    n_queries: NonNegativeInt

    group_recall: Annotated[float, round_to(6)]
    overall_recall: Annotated[float, round_to(6)]

    group_degradation: Annotated[float, round_to(6)]
    overall_degradation: Annotated[float, round_to(6)]


class GroupMetric(BaseModel):
    recall: Annotated[float, round_to(6)]
    intrusion_rate: Annotated[float, round_to(6)]
    mean_rank_displacement: Annotated[float, round_to(6)]


class ColumnReport(BaseModel):
    n_queries: NonNegativeInt

    metrics: dict[Dim, dict[K, GroupMetric]]


class GroupReport(BaseModel):
    columns: dict[str, ColumnReport]


class RunnerConfig(BaseModel):
    embeddings: Path
    strata: Path | None

    dims: list[Dim]
    ks: list[K]

    sample: int
    seed: int

    memory_cap_bytes: int
    backend: Literal["cpu", "gpu"]
    min_group_size: int


class RunnerCorpus(BaseModel):
    rows: NonNegativeInt
    dim: Annotated[Dim, Field(ge=0)]
    n_sampled: NonNegativeInt
    full_truth_k: NonNegativeInt


class RunnerReport(BaseModel):
    metric_definitions: dict[str, str]
    config: RunnerConfig
    corpus: RunnerCorpus

    overall: dict[Dim, dict[K, GroupMetric]]
    groups: dict[str, GroupReport]
    flags: list[FlagReport]


class RunnerDetails(BaseModel):
    sample_rows_sha256: Sha256Hex
    report_sha256: Sha256Hex


RunnerProvenance = Provenance[RunnerDetails, RunnerConfig]
