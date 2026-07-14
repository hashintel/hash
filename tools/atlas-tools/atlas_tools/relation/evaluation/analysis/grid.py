"""Reconcile a complete production grid into immutable per-card evidence.

Imported and fresh votes share one cell index keyed by relation, judge family,
and repeat. Construction proves baseline coverage and the exact refinement
shape before any posterior or downstream queue can be observed.
"""

import math
from collections.abc import Iterable, Iterator, Sequence
from typing import Literal, Self

from pydantic import NonNegativeInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.domain.api import (
    QUALIFICATION_BUNDLE,
    EvaluationCard,
    JudgeFamilyId,
    NonEmptyStr,
    Probability,
    RelationId,
    Sha256Hex,
    Vote,
    VoteVerdict,
)

type VoteSource = Literal["imported", "fresh"]
type _Cell = tuple[RelationId, JudgeFamilyId, int]

_BASELINE_REPEAT = 0
_REFINEMENT_REPEATS = (1, 2)


class GridAnalysisError(ValueError):
    """A vote cohort cannot represent one complete production grid."""


class VerdictTally(AnalysisModel):
    """Counts over the four verdict classes plus abstentions."""

    coincident: NonNegativeInt = 0
    proximal: NonNegativeInt = 0
    overlay: NonNegativeInt = 0
    unclear: NonNegativeInt = 0
    abstentions: NonNegativeInt = 0

    @computed_field
    @property
    def n_votes(self) -> int:
        """Count responses carrying four-class verdict evidence."""
        return self.coincident + self.proximal + self.overlay + self.unclear

    @computed_field
    @property
    def total_responses(self) -> int:
        """Count verdict evidence and abstentions together."""
        return self.n_votes + self.abstentions


class FourClassPosterior(AnalysisModel):
    """A Dirichlet(1, 1, 1, 1) posterior mean over grid verdicts."""

    coincident: Probability
    proximal: Probability
    overlay: Probability
    unclear: Probability

    @model_validator(mode="after")
    def check_mass(self) -> Self:
        if not math.isclose(
            math.fsum((self.coincident, self.proximal, self.overlay, self.unclear)),
            1.0,
            rel_tol=0.0,
            abs_tol=1e-12,
        ):
            raise ValueError("four-class posterior probabilities must sum to one")
        return self

    @computed_field
    @property
    def normalized_entropy(self) -> Probability:
        """Return Shannon entropy normalized by the four-class maximum."""
        probabilities = (self.coincident, self.proximal, self.overlay, self.unclear)
        entropy = -math.fsum(
            probability * math.log(probability)
            for probability in probabilities
            if probability > 0.0
        )
        return entropy / math.log(4.0)


def four_class_posterior(tally: VerdictTally) -> FourClassPosterior:
    """Smooth a four-class tally with one prior observation per class.

    Abstentions carry no verdict evidence and therefore do not enter the
    denominator. The operation runs in constant time.
    """
    denominator = tally.n_votes + 4
    return FourClassPosterior(
        coincident=(tally.coincident + 1) / denominator,
        proximal=(tally.proximal + 1) / denominator,
        overlay=(tally.overlay + 1) / denominator,
        unclear=(tally.unclear + 1) / denominator,
    )


class GridVote(AnalysisModel):
    """A grid vote tagged with whether the run bought or imported it."""

    source: VoteSource
    vote: Vote

    @model_validator(mode="after")
    def check_source(self) -> Self:
        if self.vote.bundle_id != QUALIFICATION_BUNDLE:
            raise ValueError("grid votes must use the S1xF1 qualification bundle")
        if self.vote.repeat_index not in (_BASELINE_REPEAT, *_REFINEMENT_REPEATS):
            raise ValueError("grid votes must use repeat zero, one, or two")
        if self.source == "imported" and self.vote.repeat_index != _BASELINE_REPEAT:
            raise ValueError("only baseline votes may be imported")
        return self


class FamilyCardVotes(AnalysisModel):
    """One family's baseline and optional two-repeat record for a card."""

    family_id: JudgeFamilyId
    baseline: GridVote
    refinements: tuple[GridVote, ...] = ()

    @model_validator(mode="after")
    def check_cells(self) -> Self:
        baseline = self.baseline.vote
        if baseline.family_id != self.family_id or baseline.repeat_index != _BASELINE_REPEAT:
            raise ValueError("family baseline must be repeat zero for the declared family")
        if (
            self.refinements
            and tuple(observed.vote.repeat_index for observed in self.refinements)
            != _REFINEMENT_REPEATS
        ):
            raise ValueError("refinement votes must contain repeats one and two in order")
        for observed in self.refinements:
            vote = observed.vote
            if observed.source != "fresh":
                raise ValueError("refinement votes must be fresh")
            if (
                vote.family_id != self.family_id
                or vote.relation_id != baseline.relation_id
                or vote.card_hash != baseline.card_hash
            ):
                raise ValueError("family refinement cells must describe the baseline card")
        return self

    def votes(self) -> Iterator[GridVote]:
        """Yield this family's cells in repeat order."""
        yield self.baseline
        yield from self.refinements


def _triggers_refinement(verdicts: Sequence[VoteVerdict]) -> bool:
    return "ABSTAIN" in verdicts or "coincident" in verdicts or len(frozenset(verdicts)) != 1


def _tally(observed_votes: Iterable[GridVote]) -> VerdictTally:
    coincident = proximal = overlay = unclear = abstentions = 0
    for observed in observed_votes:
        match observed.vote.verdict:
            case "coincident":
                coincident += 1
            case "proximal":
                proximal += 1
            case "overlay":
                overlay += 1
            case "unclear":
                unclear += 1
            case "ABSTAIN":
                abstentions += 1
    return VerdictTally(
        coincident=coincident,
        proximal=proximal,
        overlay=overlay,
        unclear=unclear,
        abstentions=abstentions,
    )


class CardAnalysis(AnalysisModel):
    """A card whose complete grid shape and posterior have been proved."""

    card: EvaluationCard
    families: tuple[FamilyCardVotes, ...]
    refined: bool
    tally: VerdictTally
    posterior: FourClassPosterior

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if not self.families:
            raise ValueError("card analysis requires at least one judge family")
        family_ids = tuple(family.family_id for family in self.families)
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("card families must be unique and sorted")

        baseline_verdicts: list[VoteVerdict] = []
        refinement_shapes: set[bool] = set()
        for family in self.families:
            baseline = family.baseline.vote
            if (
                baseline.relation_id != self.card.relation_id
                or baseline.card_hash != self.card.card_hash
            ):
                raise ValueError("card analysis votes must match the declared card")
            baseline_verdicts.append(baseline.verdict)
            refinement_shapes.add(bool(family.refinements))
        if len(refinement_shapes) != 1:
            raise ValueError("every family must have the same refinement shape")

        expected_refined = _triggers_refinement(baseline_verdicts)
        has_refinements = refinement_shapes.pop()
        if expected_refined != has_refinements:
            expectation = "requires" if expected_refined else "forbids"
            raise ValueError(f"the baseline row {expectation} refinement repeats")
        if self.refined != expected_refined:
            raise ValueError("refined must equal the baseline trigger decision")

        expected_tally = _tally(self.votes())
        if self.tally != expected_tally:
            raise ValueError("card tally must equal its complete vote record")
        if self.posterior != four_class_posterior(expected_tally):
            raise ValueError("card posterior must equal its four-class tally")
        return self

    def votes(self) -> Iterator[GridVote]:
        """Yield all card cells in family and repeat order."""
        for family in self.families:
            yield from family.votes()


class GridAnalysis(AnalysisModel):
    """A complete grid cohort ordered by family and relation identity."""

    family_ids: tuple[JudgeFamilyId, ...]
    prompt_pack_hash: Sha256Hex
    rubric_version: NonEmptyStr
    cards: tuple[CardAnalysis, ...]

    @model_validator(mode="after")
    def check_cohort(self) -> Self:
        if not self.family_ids:
            raise ValueError("grid analysis requires at least one judge family")
        if self.family_ids != tuple(sorted(self.family_ids)) or len(self.family_ids) != len(
            set(self.family_ids)
        ):
            raise ValueError("grid family IDs must be unique and sorted")
        if not self.cards:
            raise ValueError("grid analysis requires at least one card")
        relation_ids = tuple(card.card.relation_id for card in self.cards)
        if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(
            set(relation_ids)
        ):
            raise ValueError("grid cards must be unique and sorted by relation ID")
        for card in self.cards:
            if tuple(family.family_id for family in card.families) != self.family_ids:
                raise ValueError("every card must cover exactly the grid families")
            for observed in card.votes():
                vote = observed.vote
                if vote.prompt_pack_hash != self.prompt_pack_hash:
                    raise ValueError("all votes must use the grid prompt pack")
                if vote.rubric_version != self.rubric_version:
                    raise ValueError("all votes must use the grid rubric version")
        return self


def _index_vote(
    observed: GridVote,
    *,
    cards_by_id: dict[RelationId, EvaluationCard],
    family_ids: frozenset[JudgeFamilyId],
    cells: dict[_Cell, GridVote],
    vote_ids: set[Sha256Hex],
) -> None:
    vote = observed.vote
    card = cards_by_id.get(vote.relation_id)
    if card is None:
        raise GridAnalysisError(f"vote {vote.vote_id} refers to a card outside the grid")
    if vote.card_hash != card.card_hash:
        raise GridAnalysisError(f"vote {vote.vote_id} does not match its grid card hash")
    if vote.family_id not in family_ids:
        raise GridAnalysisError(f"vote {vote.vote_id} refers to an unseated judge family")
    if vote.vote_id in vote_ids:
        raise GridAnalysisError(f"vote ID {vote.vote_id} occurs more than once")
    vote_ids.add(vote.vote_id)

    cell = (vote.relation_id, vote.family_id, vote.repeat_index)
    if cell in cells:
        raise GridAnalysisError(
            f"grid cell {vote.relation_id}, {vote.family_id}, repeat {vote.repeat_index} "
            "occurs more than once"
        )
    cells[cell] = observed


def _ordered_cards(
    cards: Sequence[EvaluationCard],
) -> tuple[tuple[EvaluationCard, ...], dict[RelationId, EvaluationCard]]:
    ordered = tuple(sorted(cards, key=lambda card: card.relation_id))
    by_id = {card.relation_id: card for card in ordered}
    if not ordered:
        raise GridAnalysisError("cannot analyze an empty grid")
    if len(by_id) != len(ordered):
        raise GridAnalysisError("grid cards contain duplicate relation IDs")
    return ordered, by_id


def _ordered_families(
    family_ids: Sequence[JudgeFamilyId],
) -> tuple[tuple[JudgeFamilyId, ...], frozenset[JudgeFamilyId]]:
    ordered = tuple(sorted(family_ids))
    family_set = frozenset(ordered)
    if not ordered:
        raise GridAnalysisError("cannot analyze a grid without judge families")
    if len(family_set) != len(ordered):
        raise GridAnalysisError("grid judge families contain duplicates")
    return ordered, family_set


def _index_votes(
    *,
    cards_by_id: dict[RelationId, EvaluationCard],
    family_ids: frozenset[JudgeFamilyId],
    imported_votes: Iterable[Vote],
    fresh_votes: Iterable[Vote],
) -> tuple[dict[_Cell, GridVote], Sha256Hex, NonEmptyStr]:
    cells: dict[_Cell, GridVote] = {}
    vote_ids: set[Sha256Hex] = set()
    prompt_pack_hashes: set[Sha256Hex] = set()
    rubric_versions: set[NonEmptyStr] = set()

    def add(votes: Iterable[Vote], source: VoteSource) -> None:
        for vote in votes:
            try:
                observed = GridVote(source=source, vote=vote)
            except ValueError as error:
                raise GridAnalysisError(str(error)) from error
            _index_vote(
                observed,
                cards_by_id=cards_by_id,
                family_ids=family_ids,
                cells=cells,
                vote_ids=vote_ids,
            )
            prompt_pack_hashes.add(vote.prompt_pack_hash)
            rubric_versions.add(vote.rubric_version)

    add(imported_votes, "imported")
    add(fresh_votes, "fresh")
    if len(prompt_pack_hashes) != 1:
        raise GridAnalysisError("grid votes must contain exactly one prompt pack hash")
    if len(rubric_versions) != 1:
        raise GridAnalysisError("grid votes must contain exactly one rubric version")
    return cells, next(iter(prompt_pack_hashes)), next(iter(rubric_versions))


def _baseline_cells(
    *,
    card: EvaluationCard,
    family_ids: tuple[JudgeFamilyId, ...],
    cells: dict[_Cell, GridVote],
) -> tuple[GridVote, ...]:
    baselines: list[GridVote] = []
    for family_id in family_ids:
        cell = (card.relation_id, family_id, _BASELINE_REPEAT)
        try:
            baselines.append(cells[cell])
        except KeyError:
            raise GridAnalysisError(
                f"card {card.relation_id} lacks baseline repeat 0 for {family_id}"
            ) from None
    return tuple(baselines)


def _family_record(
    *,
    card: EvaluationCard,
    family_id: JudgeFamilyId,
    baseline: GridVote,
    refined: bool,
    cells: dict[_Cell, GridVote],
) -> FamilyCardVotes:
    refinements: list[GridVote] = []
    for repeat_index in _REFINEMENT_REPEATS:
        observed = cells.get((card.relation_id, family_id, repeat_index))
        if refined and observed is None:
            raise GridAnalysisError(
                f"refined card {card.relation_id} lacks repeat {repeat_index} for {family_id}"
            )
        if not refined and observed is not None:
            raise GridAnalysisError(
                f"unrefined card {card.relation_id} contains repeat {repeat_index} for {family_id}"
            )
        if observed is not None:
            refinements.append(observed)
    return FamilyCardVotes(
        family_id=family_id,
        baseline=baseline,
        refinements=tuple(refinements),
    )


def _analyze_card(
    *,
    card: EvaluationCard,
    family_ids: tuple[JudgeFamilyId, ...],
    cells: dict[_Cell, GridVote],
) -> CardAnalysis:
    baselines = _baseline_cells(card=card, family_ids=family_ids, cells=cells)
    refined = _triggers_refinement([observed.vote.verdict for observed in baselines])
    families = tuple(
        _family_record(
            card=card,
            family_id=family_id,
            baseline=baseline,
            refined=refined,
            cells=cells,
        )
        for family_id, baseline in zip(family_ids, baselines, strict=True)
    )
    tally = _tally(observed for family in families for observed in family.votes())
    return CardAnalysis(
        card=card,
        families=families,
        refined=refined,
        tally=tally,
        posterior=four_class_posterior(tally),
    )


def analyze_grid(
    *,
    cards: Sequence[EvaluationCard],
    family_ids: Sequence[JudgeFamilyId],
    imported_votes: Iterable[Vote],
    fresh_votes: Iterable[Vote],
) -> GridAnalysis:
    """Reconcile imported and fresh votes into a complete grid analysis.

    Each input vote is indexed once. The subsequent reconstruction performs
    one lookup per expected grid cell, for `O(votes + cards * families)` time
    and `O(votes)` additional memory.

    Raises:
        GridAnalysisError: A card, family, cell, cohort pin, or refinement
            invariant is incomplete or inconsistent.

    """
    ordered_cards, cards_by_id = _ordered_cards(cards)
    ordered_families, family_set = _ordered_families(family_ids)
    cells, prompt_pack_hash, rubric_version = _index_votes(
        cards_by_id=cards_by_id,
        family_ids=family_set,
        imported_votes=imported_votes,
        fresh_votes=fresh_votes,
    )
    return GridAnalysis(
        family_ids=ordered_families,
        prompt_pack_hash=prompt_pack_hash,
        rubric_version=rubric_version,
        cards=tuple(
            _analyze_card(card=card, family_ids=ordered_families, cells=cells)
            for card in ordered_cards
        ),
    )
