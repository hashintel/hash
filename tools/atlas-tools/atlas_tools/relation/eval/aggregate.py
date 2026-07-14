"""Soft-label aggregation from a completed grid run.

One parquet row per pool relation: the Dirichlet(1,1,1)-smoothed posterior
mean over {coincident, proximal, overlay} from valid votes (baseline plus any
refinement repeats, imported pilot votes included), with unclear votes counted
in the ambiguity column, plus n_votes, entropy, the refinement flag, and the
coincident-review flag. Every downstream fit consumes every row weighted by
``n_votes``; there is deliberately no unanimous-only or refined-only
selection, because both select on ambiguity.

:class:`SoftLabelRow` owns the on-disk column contract: rows are written from
validated models and read back through the same model, so a malformed or
foreign parquet fails loudly at the boundary instead of deep in a fit.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Self

import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    ValidationError,
    model_validator,
)

from atlas_tools.common import Provenance, Sha256Hex, sha256_file
from atlas_tools.relation.concat import CONCAT_SCHEMA_VERSION
from atlas_tools.relation.eval.artifacts import load_completed_grid
from atlas_tools.relation.eval.contract import LoadedRunConfig
from atlas_tools.relation.eval.gates import (
    dirichlet_posterior_mean,
    normalized_posterior_entropy,
)
from atlas_tools.relation.eval.grid import CardGridRecord
from atlas_tools.relation.eval.schema import (
    PlacementClass,
    Probability,
    RelationFamilyId,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

SOFT_LABELS_SCHEMA_VERSION = 2


class SoftLabelRow(BaseModel):
    """One aggregated relation: the soft-labels parquet row contract."""

    relation_id: RelationId
    card_hash: Sha256Hex
    producer: RelationNamespace
    family_id: RelationFamilyId | None
    prescreen_stratum: str = Field(min_length=1)
    p_coincident: Probability
    p_proximal: Probability
    p_overlay: Probability
    n_votes: NonNegativeInt
    coincident_votes: NonNegativeInt
    proximal_votes: NonNegativeInt
    overlay_votes: NonNegativeInt
    unclear_votes: NonNegativeInt
    abstentions: NonNegativeInt
    entropy: Probability
    refined: bool
    review: bool

    model_config = ConfigDict(extra="forbid", frozen=True)

    @model_validator(mode="after")
    def check_posterior(self) -> Self:
        probabilities = (self.p_coincident, self.p_proximal, self.p_overlay)
        if any(probability >= 1.0 for probability in probabilities):
            raise ValueError(
                f"degenerate posterior for {self.relation_id}: smoothed probabilities "
                "must stay strictly below one"
            )
        if self.n_votes != self.coincident_votes + self.proximal_votes + self.overlay_votes:
            raise ValueError("n_votes must equal the placement vote counts")
        if self.coincident_votes > 0 and not self.review:
            raise ValueError("any coincident vote makes the card review-queue material")
        return self

    @classmethod
    def from_record(cls, record: CardGridRecord) -> Self:
        counts = record.verdict_counts
        placement: dict[PlacementClass, int] = {
            "coincident": counts["coincident"],
            "proximal": counts["proximal"],
            "overlay": counts["overlay"],
        }
        posterior = dirichlet_posterior_mean(placement)
        return cls(
            relation_id=record.card.relation_id,
            card_hash=record.card.card_hash,
            producer=record.card.producer,
            family_id=record.card.family_id,
            prescreen_stratum=record.card.prescreen_stratum,
            p_coincident=posterior["coincident"],
            p_proximal=posterior["proximal"],
            p_overlay=posterior["overlay"],
            n_votes=sum(placement.values()),
            coincident_votes=counts["coincident"],
            proximal_votes=counts["proximal"],
            overlay_votes=counts["overlay"],
            unclear_votes=counts["unclear"],
            abstentions=record.abstentions,
            entropy=normalized_posterior_entropy(posterior),
            refined=record.refined,
            review=counts["coincident"] > 0,
        )


_SOFT_LABELS_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("producer", pa.string(), nullable=False),
        pa.field("family_id", pa.string(), nullable=True),
        pa.field("prescreen_stratum", pa.string(), nullable=False),
        pa.field("p_coincident", pa.float64(), nullable=False),
        pa.field("p_proximal", pa.float64(), nullable=False),
        pa.field("p_overlay", pa.float64(), nullable=False),
        pa.field("n_votes", pa.int32(), nullable=False),
        pa.field("coincident_votes", pa.int32(), nullable=False),
        pa.field("proximal_votes", pa.int32(), nullable=False),
        pa.field("overlay_votes", pa.int32(), nullable=False),
        pa.field("unclear_votes", pa.int32(), nullable=False),
        pa.field("abstentions", pa.int32(), nullable=False),
        pa.field("entropy", pa.float64(), nullable=False),
        pa.field("refined", pa.bool_(), nullable=False),
        pa.field("review", pa.bool_(), nullable=False),
    ]
)


class AggregateDetails(BaseModel):
    """Sidecar details binding the parquet to its run and smoothing policy."""

    schema_version: PositiveInt = SOFT_LABELS_SCHEMA_VERSION
    rows: PositiveInt
    rubric_version: str = Field(min_length=1)
    card_format_version: PositiveInt = CONCAT_SCHEMA_VERSION
    smoothing: str = "dirichlet-1-1-1"
    weighting: str = "n-votes-every-card-v1"

    model_config = ConfigDict(extra="forbid", frozen=True)


AggregateProvenance = Provenance[AggregateDetails]


@dataclass(frozen=True)
class AggregateResult:
    soft_labels_parquet: Path
    sidecar: Path
    rows: tuple[SoftLabelRow, ...]


def read_soft_labels(path: Path) -> list[SoftLabelRow]:
    """Read and revalidate every soft-label row from parquet."""
    try:
        records = pq.read_table(path).to_pylist()
    except (OSError, pa.ArrowInvalid) as error:
        raise ValueError(f"cannot read soft labels {path}: {error}") from error
    rows: list[SoftLabelRow] = []
    for index, record in enumerate(records):
        try:
            rows.append(SoftLabelRow.model_validate(record))
        except ValidationError as error:
            raise ValueError(f"invalid soft-label row {index} in {path}: {error}") from error
    if not rows:
        raise ValueError(f"soft labels {path} contain no rows")
    return rows


def aggregate_soft_labels(
    *,
    run_dir: PathLike,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    out_path: PathLike,
) -> AggregateResult:
    """Aggregate a completed grid run into ``soft-labels.parquet``."""
    run = load_completed_grid(
        run_dir=Path(run_dir),
        cards_dir=Path(cards_dir),
        loaded_config=loaded_config,
    )
    rows = tuple(SoftLabelRow.from_record(record) for record in run.records)
    if not rows:
        raise ValueError("cannot aggregate an empty grid run")

    table = pa.Table.from_pylist(
        [row.model_dump(mode="python") for row in rows],
        schema=_SOFT_LABELS_SCHEMA,
    )
    output = Path(out_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, output)
    sidecar = AggregateProvenance.make(
        producer="relation.grid-aggregate",
        input_hashes={
            "cards.jsonl": run.manifest.source_hashes["cards.jsonl"],
            "judges-panel": run.panel_hash,
            "votes.jsonl": run.manifest.source_hashes["votes.jsonl"],
            "imported-votes.jsonl": run.manifest.source_hashes["imported-votes.jsonl"],
        },
        content_hashes={output.name: sha256_file(output)},
        details=AggregateDetails(
            rows=len(rows),
            rubric_version=loaded_config.grid().rubric_version,
        ),
    ).write(output.with_name(f"{output.name}.meta.json"))
    return AggregateResult(soft_labels_parquet=output, sidecar=sidecar, rows=rows)
