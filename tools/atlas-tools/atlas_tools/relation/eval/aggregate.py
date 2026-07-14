"""Soft-label aggregation from a completed ladder vote journal.

One parquet row per eligible relation: the Dirichlet(1,1,1)-smoothed posterior
mean over {coincident, proximal, overlay} from valid votes, with unclear votes
counted in the ambiguity column, plus n_votes, entropy, the rung reached, and
the review-queue flag. Every downstream fit consumes every row weighted by
``n_votes``; there is deliberately no full-panel-only selection, because
restricting to full-panel cards selects on ambiguity.

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
from atlas_tools.relation.eval.artifacts import ladder_paths
from atlas_tools.relation.eval.contract import LoadedRunConfig
from atlas_tools.relation.eval.gates import (
    dirichlet_posterior_mean,
    normalized_posterior_entropy,
)
from atlas_tools.relation.eval.inputs import prepare_ladder_inputs
from atlas_tools.relation.eval.journal import load_jsonl
from atlas_tools.relation.eval.ladder import CardLadderOutcome, complete_card_outcomes
from atlas_tools.relation.eval.schema import (
    LadderManifest,
    Probability,
    RelationFamilyId,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

SOFT_LABELS_SCHEMA_VERSION = 1


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
    rung_reached: PositiveInt
    early_exit: bool
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
        return self

    @classmethod
    def from_outcome(cls, outcome: CardLadderOutcome) -> Self:
        posterior = dirichlet_posterior_mean(outcome.placement_counts)
        return cls(
            relation_id=outcome.card.relation_id,
            card_hash=outcome.card.card_hash,
            producer=outcome.card.producer,
            family_id=outcome.card.family_id,
            prescreen_stratum=outcome.card.prescreen_stratum,
            p_coincident=posterior["coincident"],
            p_proximal=posterior["proximal"],
            p_overlay=posterior["overlay"],
            n_votes=sum(outcome.placement_counts.values()),
            coincident_votes=outcome.verdict_counts["coincident"],
            proximal_votes=outcome.verdict_counts["proximal"],
            overlay_votes=outcome.verdict_counts["overlay"],
            unclear_votes=outcome.verdict_counts["unclear"],
            abstentions=outcome.abstentions,
            entropy=normalized_posterior_entropy(posterior),
            rung_reached=outcome.rung_reached,
            early_exit=outcome.early_exit,
            review=outcome.first_coincident_rung is not None,
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
        pa.field("rung_reached", pa.int32(), nullable=False),
        pa.field("early_exit", pa.bool_(), nullable=False),
        pa.field("review", pa.bool_(), nullable=False),
    ]
)


class AggregateDetails(BaseModel):
    """Sidecar details binding the parquet to its journal and smoothing policy."""

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


def _validate_run(run_dir: Path, votes_hash: Sha256Hex) -> LadderManifest:
    paths = ladder_paths(run_dir)
    if not paths.manifest_json.is_file():
        raise ValueError(f"{run_dir} is not a completed ladder run: manifest.json is missing")
    manifest = LadderManifest.model_validate_json(paths.manifest_json.read_bytes())
    if manifest.source_hashes["votes.jsonl"] != votes_hash:
        raise ValueError("votes.jsonl does not match the run manifest")
    return manifest


def aggregate_soft_labels(
    *,
    run_dir: PathLike,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    out_path: PathLike,
) -> AggregateResult:
    """Aggregate a completed ladder run into ``soft-labels.parquet``."""
    config = loaded_config.ladder()
    run_directory = Path(run_dir)
    paths = ladder_paths(run_directory)
    prepared = prepare_ladder_inputs(cards_dir, loaded_config)
    manifest = _validate_run(run_directory, sha256_file(paths.votes_jsonl))
    if manifest.source_hashes["cards.jsonl"] != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl differs from the corpus the ladder voted on")
    if manifest.source_hashes["config.yaml"] != prepared.config_hash:
        raise ValueError("config differs from the one the ladder ran with")

    votes = load_jsonl(paths.votes_jsonl, VoteRow)
    outcomes = complete_card_outcomes(
        config,
        prepared=prepared,
        votes_by_id={vote.vote_id: vote for vote in votes},
    )
    rows = tuple(SoftLabelRow.from_outcome(outcome) for outcome in outcomes)
    if not rows:
        raise ValueError("cannot aggregate an empty ladder run")

    table = pa.Table.from_pylist(
        [row.model_dump(mode="python") for row in rows],
        schema=_SOFT_LABELS_SCHEMA,
    )
    output = Path(out_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, output)
    sidecar = AggregateProvenance.make(
        producer="relation.ladder-aggregate",
        input_hashes={
            "cards.jsonl": prepared.source_hashes["cards.jsonl"],
            "config.yaml": prepared.config_hash,
            "votes.jsonl": manifest.source_hashes["votes.jsonl"],
            "review-queue.jsonl": manifest.source_hashes["review-queue.jsonl"],
        },
        content_hashes={output.name: sha256_file(output)},
        details=AggregateDetails(
            rows=len(rows),
            rubric_version=config.rubric_version,
        ),
    ).write(output.with_name(f"{output.name}.meta.json"))
    return AggregateResult(soft_labels_parquet=output, sidecar=sidecar, rows=rows)
