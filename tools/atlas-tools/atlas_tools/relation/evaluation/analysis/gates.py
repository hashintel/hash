"""Evaluate blocking grid acceptance gates from immutable in-memory evidence."""

from typing import Annotated, Literal, Self

from pydantic import Field, NonNegativeInt, PositiveInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.economics import (
    FamilyEconomics,
    vote_economics,
)
from atlas_tools.relation.evaluation.analysis.grid import GridAnalysis
from atlas_tools.relation.evaluation.domain.api import (
    JudgeFamilyId,
    NonEmptyStr,
    OpenProbability,
    Probability,
    RelationId,
    Verdict,
    VoteVerdict,
)

type GateName = Literal[
    "coverage",
    "routing",
    "holdout-drift",
    "abstention",
    "cost-envelope",
]

_GATE_ORDER: tuple[GateName, ...] = (
    "coverage",
    "routing",
    "holdout-drift",
    "abstention",
    "cost-envelope",
)


class HoldoutRule(AnalysisModel):
    """Accepted verdicts and probe status for one holdout relation."""

    relation_id: RelationId
    accepted_verdicts: Annotated[frozenset[Verdict], Field(min_length=1)]
    probe: bool = False


class GridGatePolicy(AnalysisModel):
    """Thresholds and holdout semantics for blocking grid acceptance."""

    holdouts: Annotated[tuple[HoldoutRule, ...], Field(min_length=1)]
    holdout_minimum_correct: PositiveInt
    abstention_ceiling: OpenProbability = 0.05
    cost_ceiling_usd: float | None = Field(default=None, ge=0.0, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_holdouts(self) -> Self:
        relation_ids = tuple(rule.relation_id for rule in self.holdouts)
        if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(
            set(relation_ids)
        ):
            raise ValueError("holdout rules must be unique and sorted by relation ID")
        if self.holdout_minimum_correct > len(self.holdouts):
            raise ValueError("holdout minimum cannot exceed the holdout count")
        return self


class GridGateEvidence(AnalysisModel):
    """Transport facts already verified at the provider boundary."""

    routing_violations: NonNegativeInt = 0


class HoldoutVote(AnalysisModel):
    """One baseline verdict retained as grid-time qualification evidence."""

    relation_id: RelationId
    verdict: VoteVerdict
    accepted_verdicts: Annotated[frozenset[Verdict], Field(min_length=1)]
    probe: bool

    @computed_field
    @property
    def accepted(self) -> bool:
        """Return whether the verdict satisfies this holdout anchor."""
        return self.verdict in self.accepted_verdicts


class HoldoutDrift(AnalysisModel):
    """One family's grid-time qualification result over holdout anchors."""

    family_id: JudgeFamilyId
    minimum_correct: PositiveInt
    votes: Annotated[tuple[HoldoutVote, ...], Field(min_length=1)]

    @model_validator(mode="after")
    def check_votes(self) -> Self:
        relation_ids = tuple(vote.relation_id for vote in self.votes)
        if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(
            set(relation_ids)
        ):
            raise ValueError("holdout votes must be unique and sorted by relation ID")
        if self.minimum_correct > len(self.votes):
            raise ValueError("holdout minimum cannot exceed the attached vote count")
        return self

    @computed_field
    @property
    def correct(self) -> int:
        """Count holdout verdicts accepted by their anchor rules."""
        return sum(vote.accepted for vote in self.votes)

    @computed_field
    @property
    def total(self) -> int:
        """Count attached holdout anchors."""
        return len(self.votes)

    @computed_field
    @property
    def probes_correct(self) -> bool:
        """Return whether every designated probe was accepted."""
        return all(not vote.probe or vote.accepted for vote in self.votes)

    @computed_field
    @property
    def passed(self) -> bool:
        """Return whether the family retained its holdout qualification."""
        return self.correct >= self.minimum_correct and self.probes_correct


class FamilyAbstention(AnalysisModel):
    """One family's logical-vote abstention rate."""

    family_id: JudgeFamilyId
    votes: PositiveInt
    abstentions: NonNegativeInt

    @model_validator(mode="after")
    def check_rate(self) -> Self:
        if self.abstentions > self.votes:
            raise ValueError("abstentions cannot exceed logical votes")
        return self

    @computed_field
    @property
    def rate(self) -> Probability:
        """Return abstentions divided by logical votes."""
        return self.abstentions / self.votes


class GateResult(AnalysisModel):
    """The pass decision and audit detail for one blocking gate."""

    gate: GateName
    passed: bool
    detail: NonEmptyStr


class GridGates(AnalysisModel):
    """The ordered blocking decisions for one reconciled grid."""

    gates: tuple[GateResult, ...]
    holdout_drift: tuple[HoldoutDrift, ...]
    abstention: tuple[FamilyAbstention, ...]
    routing_violations: NonNegativeInt
    abstention_ceiling: OpenProbability
    total_known_cost_usd: float = Field(ge=0.0, allow_inf_nan=False)
    cost_complete: bool
    cost_ceiling_usd: float | None = Field(default=None, ge=0.0, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_gate_order(self) -> Self:
        if tuple(gate.gate for gate in self.gates) != _GATE_ORDER:
            raise ValueError("grid gates must contain each blocking gate in execution order")
        return self

    @model_validator(mode="after")
    def check_family_rows(self) -> Self:
        drift_families = tuple(row.family_id for row in self.holdout_drift)
        abstention_families = tuple(row.family_id for row in self.abstention)
        if not drift_families or drift_families != tuple(sorted(drift_families)):
            raise ValueError("holdout drift families must be non-empty and sorted")
        if len(drift_families) != len(set(drift_families)):
            raise ValueError("holdout drift families must be unique")
        if abstention_families != drift_families:
            raise ValueError("abstention and holdout drift must cover the same families")
        return self

    @model_validator(mode="after")
    def check_decisions(self) -> Self:
        decisions = {gate.gate: gate.passed for gate in self.gates}
        if not decisions["coverage"]:
            raise ValueError("constructed grid coverage must pass")
        if decisions["routing"] != (self.routing_violations == 0):
            raise ValueError("routing gate must equal its violation count")
        if decisions["holdout-drift"] != all(row.passed for row in self.holdout_drift):
            raise ValueError("holdout gate must equal its family decisions")
        if decisions["abstention"] != all(
            row.rate < self.abstention_ceiling for row in self.abstention
        ):
            raise ValueError("abstention gate must equal its family rates")
        expected_cost = self.cost_complete and (
            self.cost_ceiling_usd is None
            or self.total_known_cost_usd <= self.cost_ceiling_usd
        )
        if decisions["cost-envelope"] != expected_cost:
            raise ValueError("cost gate must require complete billing within its envelope")
        return self

    @computed_field
    @property
    def all_passed(self) -> bool:
        """Return whether every blocking gate passed."""
        return all(gate.passed for gate in self.gates)


def _holdout_drift(
    analysis: GridAnalysis,
    policy: GridGatePolicy,
) -> tuple[HoldoutDrift, ...]:
    cards = {card.card.relation_id: card for card in analysis.cards}
    missing = [rule.relation_id for rule in policy.holdouts if rule.relation_id not in cards]
    if missing:
        raise ValueError(f"holdout rules refer to cards outside the grid: {missing}")

    by_card_family = {
        card.card.relation_id: {family.family_id: family for family in card.families}
        for card in analysis.cards
    }
    results: list[HoldoutDrift] = []
    for family_id in analysis.family_ids:
        votes: list[HoldoutVote] = []
        for rule in policy.holdouts:
            verdict = by_card_family[rule.relation_id][family_id].baseline.vote.verdict
            votes.append(
                HoldoutVote(
                    relation_id=rule.relation_id,
                    verdict=verdict,
                    accepted_verdicts=rule.accepted_verdicts,
                    probe=rule.probe,
                )
            )
        results.append(
            HoldoutDrift(
                family_id=family_id,
                minimum_correct=policy.holdout_minimum_correct,
                votes=tuple(votes),
            )
        )
    return tuple(results)


def _abstention(families: tuple[FamilyEconomics, ...]) -> tuple[FamilyAbstention, ...]:
    return tuple(
        FamilyAbstention(
            family_id=family.family_id,
            votes=family.total_votes,
            abstentions=family.abstentions,
        )
        for family in families
    )


def grid_acceptance_gates(
    analysis: GridAnalysis,
    *,
    policy: GridGatePolicy,
    evidence: GridGateEvidence | None = None,
) -> GridGates:
    """Evaluate coverage, routing, drift, abstention, and cost in order.

    Coverage passes because `analyze_grid` cannot construct `analysis` with a
    missing baseline or refinement cell. Routing remains an injected transport
    fact so provider payload semantics stay outside this pure subsystem.
    """
    resolved_evidence = GridGateEvidence() if evidence is None else evidence
    resolved_economics = vote_economics(analysis)
    drift = _holdout_drift(analysis, policy)
    abstention = _abstention(resolved_economics.by_family)
    abstention_failures = tuple(row for row in abstention if row.rate >= policy.abstention_ceiling)
    drift_failures = tuple(row for row in drift if not row.passed)
    ceiling = policy.cost_ceiling_usd
    gates = (
        GateResult(
            gate="coverage",
            passed=True,
            detail=(
                f"complete cells for {len(analysis.cards)} cards and "
                f"{len(analysis.family_ids)} families"
            ),
        ),
        GateResult(
            gate="routing",
            passed=resolved_evidence.routing_violations == 0,
            detail=f"{resolved_evidence.routing_violations} kept votes off their pinned route",
        ),
        GateResult(
            gate="holdout-drift",
            passed=not drift_failures,
            detail=(
                "families failing holdout qualification: "
                + (", ".join(row.family_id for row in drift_failures) or "none")
            ),
        ),
        GateResult(
            gate="abstention",
            passed=not abstention_failures,
            detail=(
                "families at or above the abstention ceiling: "
                + (
                    ", ".join(f"{row.family_id} ({row.rate:.3f})" for row in abstention_failures)
                    or "none"
                )
            ),
        ),
        GateResult(
            gate="cost-envelope",
            passed=resolved_economics.cost_complete
            and (
                ceiling is None or resolved_economics.total_known_cost_usd <= ceiling
            ),
            detail=(
                (
                    "complete fresh billing"
                    if resolved_economics.cost_complete
                    else "incomplete fresh billing"
                )
                + f"; known cost ${resolved_economics.total_known_cost_usd:.2f}"
                + (
                    f" vs ceiling ${ceiling:.2f}"
                    if ceiling is not None
                    else " with no ceiling"
                )
            ),
        ),
    )
    return GridGates(
        gates=gates,
        holdout_drift=drift,
        abstention=abstention,
        routing_violations=resolved_evidence.routing_violations,
        abstention_ceiling=policy.abstention_ceiling,
        total_known_cost_usd=resolved_economics.total_known_cost_usd,
        cost_complete=resolved_economics.cost_complete,
        cost_ceiling_usd=ceiling,
    )
