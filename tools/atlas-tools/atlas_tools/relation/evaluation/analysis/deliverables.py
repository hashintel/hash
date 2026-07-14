"""Derive deterministic review queues and classifier soft labels."""

import math
from typing import Self

from pydantic import NonNegativeInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.grid import (
    CardAnalysis,
    FourClassPosterior,
    GridAnalysis,
    VerdictTally,
    four_class_posterior,
)
from atlas_tools.relation.evaluation.domain.api import (
    JudgeFamilyId,
    NonEmptyStr,
    PlacementClass,
    Probability,
    RelationFamilyId,
    RelationId,
    RelationNamespace,
    Sha256Hex,
    Vote,
)


class CoincidentQueueEntry(AnalysisModel):
    """A card carrying coincident evidence and its complete vote record."""

    relation_id: RelationId
    card_hash: Sha256Hex
    coincident_families: tuple[JudgeFamilyId, ...]
    tally: VerdictTally
    votes: tuple[Vote, ...]

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if not self.coincident_families or self.tally.coincident == 0:
            raise ValueError("coincident queue entries require coincident evidence")
        tally, observed_families = _queue_evidence(
            self.votes,
            relation_id=self.relation_id,
            card_hash=self.card_hash,
        )
        if observed_families != self.coincident_families:
            raise ValueError("coincident families must equal the attached vote evidence")
        if self.tally != tally:
            raise ValueError("coincident queue tally must equal the attached vote evidence")
        return self


def _queue_evidence(
    votes: tuple[Vote, ...],
    *,
    relation_id: RelationId,
    card_hash: Sha256Hex,
) -> tuple[VerdictTally, tuple[JudgeFamilyId, ...]]:
    coincident = proximal = overlay = unclear = abstentions = 0
    coincident_families: set[JudgeFamilyId] = set()
    for vote in votes:
        if vote.relation_id != relation_id or vote.card_hash != card_hash:
            raise ValueError("coincident queue votes must match the declared card")
        match vote.verdict:
            case "coincident":
                coincident += 1
                coincident_families.add(vote.family_id)
            case "proximal":
                proximal += 1
            case "overlay":
                overlay += 1
            case "unclear":
                unclear += 1
            case "ABSTAIN":
                abstentions += 1
    return (
        VerdictTally(
            coincident=coincident,
            proximal=proximal,
            overlay=overlay,
            unclear=unclear,
            abstentions=abstentions,
        ),
        tuple(sorted(coincident_families)),
    )


class NominationSeed(AnalysisModel):
    """A card selected for review by four-class posterior entropy."""

    relation_id: RelationId
    card_hash: Sha256Hex
    tally: VerdictTally
    posterior: FourClassPosterior

    @model_validator(mode="after")
    def check_posterior(self) -> Self:
        if self.posterior != four_class_posterior(self.tally):
            raise ValueError("nomination posterior must equal its four-class tally")
        return self

    @computed_field
    @property
    def entropy(self) -> Probability:
        """Return the normalized four-class posterior entropy."""
        return self.posterior.normalized_entropy


class PlacementTally(AnalysisModel):
    """Counts carrying placement evidence for classifier supervision."""

    coincident: NonNegativeInt = 0
    proximal: NonNegativeInt = 0
    overlay: NonNegativeInt = 0

    @computed_field
    @property
    def n_votes(self) -> int:
        """Count responses carrying placement evidence."""
        return self.coincident + self.proximal + self.overlay


class PlacementPosterior(AnalysisModel):
    """A Dirichlet(1, 1, 1) posterior mean over placement classes."""

    coincident: Probability
    proximal: Probability
    overlay: Probability

    @model_validator(mode="after")
    def check_mass(self) -> Self:
        if not math.isclose(
            math.fsum((self.coincident, self.proximal, self.overlay)),
            1.0,
            rel_tol=0.0,
            abs_tol=1e-12,
        ):
            raise ValueError("placement posterior probabilities must sum to one")
        return self

    @computed_field
    @property
    def normalized_entropy(self) -> Probability:
        """Return Shannon entropy normalized by the three-class maximum."""
        probabilities = (self.coincident, self.proximal, self.overlay)
        entropy = -math.fsum(
            probability * math.log(probability)
            for probability in probabilities
            if probability > 0.0
        )
        return entropy / math.log(3.0)


def placement_posterior(tally: PlacementTally) -> PlacementPosterior:
    """Smooth placement evidence with one prior observation per class."""
    denominator = tally.n_votes + 3
    return PlacementPosterior(
        coincident=(tally.coincident + 1) / denominator,
        proximal=(tally.proximal + 1) / denominator,
        overlay=(tally.overlay + 1) / denominator,
    )


class SoftLabel(AnalysisModel):
    """A classifier target preserving ambiguity outside placement evidence."""

    relation_id: RelationId
    card_hash: Sha256Hex
    producer: RelationNamespace
    family_id: RelationFamilyId | None
    prescreen_stratum: NonEmptyStr
    tally: PlacementTally
    unclear_votes: NonNegativeInt
    abstentions: NonNegativeInt
    posterior: PlacementPosterior
    refined: bool
    review: bool

    @model_validator(mode="after")
    def check_projection(self) -> Self:
        expected_review = self.tally.coincident > 0
        if self.review != expected_review:
            raise ValueError("review must be true if and only if coincident evidence exists")
        if self.posterior != placement_posterior(self.tally):
            raise ValueError("soft-label posterior must equal its placement tally")
        return self

    @computed_field
    @property
    def n_votes(self) -> int:
        """Count only responses carrying placement evidence."""
        return self.tally.n_votes

    @computed_field
    @property
    def entropy(self) -> Probability:
        """Return normalized entropy of the placement posterior."""
        return self.posterior.normalized_entropy


def coincident_queue(analysis: GridAnalysis) -> tuple[CoincidentQueueEntry, ...]:
    """Return every card with coincident evidence in relation order."""
    rows: list[CoincidentQueueEntry] = []
    for card in analysis.cards:
        if card.tally.coincident == 0:
            continue
        votes = tuple(observed.vote for observed in card.votes())
        rows.append(
            CoincidentQueueEntry(
                relation_id=card.card.relation_id,
                card_hash=card.card.card_hash,
                coincident_families=tuple(
                    family.family_id
                    for family in card.families
                    if any(observed.vote.verdict == "coincident" for observed in family.votes())
                ),
                tally=card.tally,
                votes=votes,
            )
        )
    return tuple(rows)


def nomination_queue(
    analysis: GridAnalysis,
    *,
    fraction: float = 0.1,
) -> tuple[NominationSeed, ...]:
    """Select the highest-entropy fraction with stable relation tie-breaking.

    At least one card is returned. Selection sorts `n` card summaries in
    `O(n log n)` time and does not revisit raw vote payloads.

    Raises:
        ValueError: `fraction` is non-finite or outside `(0, 1]`.

    """
    if not math.isfinite(fraction) or not 0.0 < fraction <= 1.0:
        raise ValueError("nomination fraction must be finite and in (0, 1]")
    seeds = sorted(
        (
            NominationSeed(
                relation_id=card.card.relation_id,
                card_hash=card.card.card_hash,
                tally=card.tally,
                posterior=card.posterior,
            )
            for card in analysis.cards
        ),
        key=lambda seed: (-seed.entropy, seed.relation_id),
    )
    count = max(1, math.floor(len(seeds) * fraction))
    return tuple(seeds[:count])


def _soft_label(card: CardAnalysis) -> SoftLabel:
    tally = PlacementTally(
        coincident=card.tally.coincident,
        proximal=card.tally.proximal,
        overlay=card.tally.overlay,
    )
    return SoftLabel(
        relation_id=card.card.relation_id,
        card_hash=card.card.card_hash,
        producer=card.card.producer,
        family_id=card.card.family_id,
        prescreen_stratum=card.card.prescreen_stratum,
        tally=tally,
        unclear_votes=card.tally.unclear,
        abstentions=card.tally.abstentions,
        posterior=placement_posterior(tally),
        refined=card.refined,
        review=card.tally.coincident > 0,
    )


def soft_labels(analysis: GridAnalysis) -> tuple[SoftLabel, ...]:
    """Project every analyzed card into classifier supervision."""
    return tuple(_soft_label(card) for card in analysis.cards)


def placement_argmax(posterior: PlacementPosterior) -> PlacementClass:
    """Return the largest placement probability with C, P, O tie order."""
    classes: tuple[PlacementClass, ...] = ("coincident", "proximal", "overlay")
    probabilities = (
        posterior.coincident,
        posterior.proximal,
        posterior.overlay,
    )
    index = max(range(len(probabilities)), key=probabilities.__getitem__)
    return classes[index]
