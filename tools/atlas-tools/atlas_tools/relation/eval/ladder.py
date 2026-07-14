"""Vote-ladder structure, early-exit policy, and adaptive round planning.

The ladder executes the panel rung by rung. After each completed rung a card
either stops early (every vote so far is valid and unanimously proximal or
overlay), or continues to the next rung. A card whose leading class is
coincident after any rung never exits early: it runs the full panel and joins
the review queue at the rung where coincident first led. Ties that include
coincident count as coincident-leading, and any abstained (malformed) vote
blocks early exit, so doubt always buys more votes.

Rounds are derived deterministically from the committed vote journal: round
``r`` contains every (voter, card) task for cards still active at rung ``r``,
in eligible-card order with voters interleaved per card. Re-deriving rounds
from the same journal prefix reproduces the identical cumulative task stream,
which is what lets the durable executor resume a killed run byte-for-byte.
"""

from collections import Counter
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from itertools import chain
from typing import cast

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.eval.contract import (
    EvaluationCard,
    LadderJudge,
    LadderPreparedInputs,
    LadderRunConfig,
    VoteTask,
)
from atlas_tools.relation.eval.schema import (
    VERDICTS,
    BundleId,
    FramingId,
    Verdict,
    VoteRow,
    VoteVerdict,
)

EARLY_EXIT_VERDICTS: frozenset[Verdict] = frozenset({"proximal", "overlay"})


@dataclass(frozen=True)
class Voter:
    """One (judge, framing) pair; the ladder's unit of panel membership."""

    judge: LadderJudge
    framing: FramingId


@dataclass(frozen=True)
class RungOutcome:
    """The stop/continue decision for one card after one completed rung."""

    early_exit: bool
    coincident_leading: bool
    verdict_counts: dict[Verdict, int]
    abstentions: int


@dataclass(frozen=True)
class CardLadderOutcome:
    """One card's final path through a complete ladder run."""

    card: EvaluationCard
    rung_reached: int
    early_exit: bool
    first_coincident_rung: int | None
    coincident_rung_counts: dict[Verdict, int] | None
    coincident_rung_abstentions: int | None
    verdict_counts: dict[Verdict, int]
    abstentions: int
    votes: tuple[VoteRow, ...]


@dataclass(frozen=True)
class LadderRoundsPlan:
    """The deterministic cumulative task stream across all derived rounds."""

    rounds: tuple[tuple[VoteTask, ...], ...]

    @property
    def expected_votes(self) -> int:
        return sum(len(round_tasks) for round_tasks in self.rounds)

    def tasks(self) -> Iterator[VoteTask]:
        return chain.from_iterable(self.rounds)


def rung_voters(config: LadderRunConfig) -> tuple[tuple[Voter, ...], ...]:
    """Return each rung's voters, in config judge order then framing order."""
    return tuple(
        tuple(
            Voter(judge=judge, framing=framing)
            for judge in config.judges
            if judge.rung == rung
            for framing in judge.framings
        )
        for rung in range(1, config.rung_count + 1)
    )


def voter_task(
    config: LadderRunConfig,
    *,
    voter: Voter,
    card: EvaluationCard,
    pack_hash: Sha256Hex,
) -> VoteTask:
    return VoteTask(
        judge=voter.judge,
        bundle_id=cast("BundleId", f"{config.shell}x{voter.framing}"),
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        effort=config.judge_effort(voter.judge),
        repeat_index=0,
        pack_hash=pack_hash,
        rubric_version=config.rubric_version,
    )


def rung_outcome(verdicts: Sequence[VoteVerdict]) -> RungOutcome:
    """Decide stop/continue from every vote committed so far for one card."""
    counts = Counter(verdict for verdict in verdicts if verdict != "ABSTAIN")
    abstentions = sum(verdict == "ABSTAIN" for verdict in verdicts)
    verdict_counts: dict[Verdict, int] = {verdict: counts.get(verdict, 0) for verdict in VERDICTS}
    if not counts:
        return RungOutcome(
            early_exit=False,
            coincident_leading=False,
            verdict_counts=verdict_counts,
            abstentions=abstentions,
        )
    top = max(counts.values())
    coincident_leading = counts.get("coincident", 0) == top
    unanimous_verdict = next(iter(counts)) if len(counts) == 1 else None
    early_exit = (
        abstentions == 0
        and unanimous_verdict is not None
        and unanimous_verdict in EARLY_EXIT_VERDICTS
    )
    return RungOutcome(
        early_exit=early_exit,
        coincident_leading=coincident_leading,
        verdict_counts=verdict_counts,
        abstentions=abstentions,
    )


def _round_tasks(
    config: LadderRunConfig,
    *,
    voters: Sequence[Voter],
    cards: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
) -> tuple[VoteTask, ...]:
    """Order one round card-major so consecutive tasks spread across providers."""
    return tuple(
        voter_task(config, voter=voter, card=card, pack_hash=pack_hash)
        for card in cards
        for voter in voters
    )


class IncompleteLadderError(ValueError):
    """A card outcome was requested before every required vote was committed."""


def _card_outcome(
    config: LadderRunConfig,
    *,
    rungs: Sequence[Sequence[Voter]],
    card: EvaluationCard,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
    pack_hash: Sha256Hex,
) -> CardLadderOutcome:
    verdicts: list[VoteVerdict] = []
    votes: list[VoteRow] = []
    first_coincident_rung: int | None = None
    coincident_counts: dict[Verdict, int] | None = None
    coincident_abstentions: int | None = None
    outcome = rung_outcome(verdicts)
    rung_reached = 0
    for rung_index, voters in enumerate(rungs, start=1):
        rung_votes: list[VoteRow] = []
        for voter in voters:
            task = voter_task(config, voter=voter, card=card, pack_hash=pack_hash)
            vote = votes_by_id.get(task.vote_id)
            if vote is None:
                raise IncompleteLadderError(
                    f"card {card.relation_id} is missing its rung-{rung_index} vote "
                    f"for voter ({voter.judge.family_id}, {voter.framing})"
                )
            rung_votes.append(vote)
        votes.extend(rung_votes)
        verdicts.extend(vote.verdict for vote in rung_votes)
        outcome = rung_outcome(verdicts)
        rung_reached = rung_index
        if outcome.coincident_leading and first_coincident_rung is None:
            first_coincident_rung = rung_index
            coincident_counts = outcome.verdict_counts
            coincident_abstentions = outcome.abstentions
        if outcome.early_exit:
            break
    # A unanimous final rung is not an early exit: the full panel already ran.
    return CardLadderOutcome(
        card=card,
        rung_reached=rung_reached,
        early_exit=outcome.early_exit and rung_reached < len(rungs),
        first_coincident_rung=first_coincident_rung,
        coincident_rung_counts=coincident_counts,
        coincident_rung_abstentions=coincident_abstentions,
        verdict_counts=outcome.verdict_counts,
        abstentions=outcome.abstentions,
        votes=tuple(votes),
    )


def _active_cards_at(
    config: LadderRunConfig,
    *,
    rungs: Sequence[Sequence[Voter]],
    rung_index: int,
    prepared: LadderPreparedInputs,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
) -> list[EvaluationCard]:
    """Return cards not early-exited by rungs below ``rung_index``.

    Requires every vote for rungs below ``rung_index`` to be committed; the
    round loop guarantees this by executing each round before deriving the
    next one.
    """
    active: list[EvaluationCard] = []
    for card in prepared.eligible:
        verdicts: list[VoteVerdict] = []
        exited = False
        for prior_index in range(1, rung_index):
            for voter in rungs[prior_index - 1]:
                task = voter_task(config, voter=voter, card=card, pack_hash=prepared.pack_hash)
                vote = votes_by_id.get(task.vote_id)
                if vote is None:
                    raise IncompleteLadderError(
                        f"cannot derive rung {rung_index}: card {card.relation_id} is missing "
                        f"a rung-{prior_index} vote"
                    )
                verdicts.append(vote.verdict)
            if rung_outcome(verdicts).early_exit:
                exited = True
                break
        if not exited:
            active.append(card)
    return active


def derive_round(
    config: LadderRunConfig,
    *,
    rung_index: int,
    prepared: LadderPreparedInputs,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
) -> tuple[VoteTask, ...]:
    """Derive one rung's complete round from the votes of all prior rungs."""
    rungs = rung_voters(config)
    active = _active_cards_at(
        config,
        rungs=rungs,
        rung_index=rung_index,
        prepared=prepared,
        votes_by_id=votes_by_id,
    )
    return _round_tasks(
        config,
        voters=rungs[rung_index - 1],
        cards=active,
        pack_hash=prepared.pack_hash,
    )


def complete_card_outcomes(
    config: LadderRunConfig,
    *,
    prepared: LadderPreparedInputs,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
) -> list[CardLadderOutcome]:
    """Replay every card's ladder path; fails loudly on any missing vote."""
    rungs = rung_voters(config)
    return [
        _card_outcome(
            config,
            rungs=rungs,
            card=card,
            votes_by_id=votes_by_id,
            pack_hash=prepared.pack_hash,
        )
        for card in prepared.eligible
    ]
