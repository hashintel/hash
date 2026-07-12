"""Typed report and provenance models for the prefix audit.

:class:`RunnerReport` is the schema of ``report.json``; :data:`RunnerProvenance` is the
envelope written to ``report.meta.json``. Metric fields round to six decimal places on
validation, so a report re-validated from disk is equal to the model that produced it.
"""

from pathlib import Path
from typing import Annotated, NewType

from pydantic import AfterValidator, BaseModel, NonNegativeInt

from atlas_tools.common import Provenance


def round_to(ndigits: int, /) -> AfterValidator:
    return AfterValidator(lambda v: round(v, ndigits))


Dim = NewType("Dim", int)
K = NewType("K", int)


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
    min_group_size: int


class RunnerCorpus(BaseModel):
    rows: NonNegativeInt
    dim: NonNegativeInt
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
    sample_rows_sha256: str
    report_sha256: str


RunnerProvenance = Provenance[RunnerDetails, RunnerConfig]
