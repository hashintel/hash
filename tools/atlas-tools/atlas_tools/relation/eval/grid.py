"""Production-grid planning: pool, pilot-vote import, phases, and queues.

Phase A is one baseline vote per (card x family): per-family streams over the
pool in ascending ``relation_id`` order, interleaved round-robin so families
run in parallel while each family's own requests stay sequential (the
transport layer additionally serializes in-flight calls per family, which is
what keeps each family's prefix cache hot). Phase B refines every card whose
five baseline verdicts are not unanimous, that received any coincident vote,
or that carries any abstention: two additional repeats per (family x refined
card), identical configuration. There is no escalation of shells, templates,
effort, or families; the reserve topology is dormant by design.

Pilot votes are production votes: a pilot vote is imported, never re-bought,
when its ``vote_id`` equals a planned baseline cell's task hash, which binds
the full identity tuple (card_hash, family pins, S1xF1, effort, decoding
parameters, prompt pack hash, repeat_index 0). A drifted pin therefore
matches nothing, and changed conditioning voids the import by construction.
"""

import math
from collections import Counter
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from itertools import chain

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.eval.contract import (
    GRID_BUNDLE,
    EvaluationCard,
    GridJudge,
    GridRunConfig,
    VoteTask,
)
from atlas_tools.relation.eval.schema import (
    VERDICTS,
    CardPosterior,
    CoincidentQueueRow,
    CorpusRow,
    NominationSeed,
    Verdict,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import RelationId

REFINEMENT_REPEAT_INDICES: tuple[int, ...] = (1, 2)
BASELINE_REPEAT_INDEX = 0


class IncompleteGridError(ValueError):
    """A phase was requested before every vote it depends on was committed."""


@dataclass(frozen=True)
class GridRoundsPlan:
    """The deterministic cumulative task stream across both grid phases."""

    phases: tuple[tuple[VoteTask, ...], ...]

    @property
    def expected_votes(self) -> int:
        return sum(len(phase) for phase in self.phases)

    def tasks(self) -> Iterator[VoteTask]:
        return chain.from_iterable(self.phases)


def _interleave[Item](streams: Sequence[Sequence[Item]]) -> tuple[Item, ...]:
    """Round-robin merge, preserving each stream's internal order."""
    merged: list[Item] = []
    cursors = [0] * len(streams)
    remaining = sum(len(stream) for stream in streams)
    while remaining:
        for index, stream in enumerate(streams):
            if cursors[index] < len(stream):
                merged.append(stream[cursors[index]])
                cursors[index] += 1
                remaining -= 1
    return tuple(merged)


def grid_task(
    config: GridRunConfig,
    *,
    judge: GridJudge,
    card: EvaluationCard,
    repeat_index: int,
    pack_hash: Sha256Hex,
) -> VoteTask:
    return VoteTask(
        judge=judge,
        bundle_id=GRID_BUNDLE,
        relation_id=card.relation_id,
        card_hash=card.card_hash,
        effort=config.judge_effort(judge),
        repeat_index=repeat_index,
        pack_hash=pack_hash,
        rubric_version=config.rubric_version,
    )


def baseline_cells(
    config: GridRunConfig,
    *,
    pool: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
) -> dict[Sha256Hex, VoteTask]:
    """Every (card x family) baseline cell keyed by its identity (task) hash."""
    return {
        task.vote_id: task
        for judge in config.judges
        for card in pool
        for task in (
            grid_task(
                config,
                judge=judge,
                card=card,
                repeat_index=BASELINE_REPEAT_INDEX,
                pack_hash=pack_hash,
            ),
        )
    }


def phase_a_tasks(
    config: GridRunConfig,
    *,
    pool: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
    imported_vote_ids: frozenset[Sha256Hex],
) -> tuple[VoteTask, ...]:
    """Fresh baseline cells: per-family relation_id-ordered streams, interleaved."""
    streams = [
        [
            task
            for card in pool
            for task in (
                grid_task(
                    config,
                    judge=judge,
                    card=card,
                    repeat_index=BASELINE_REPEAT_INDEX,
                    pack_hash=pack_hash,
                ),
            )
            if task.vote_id not in imported_vote_ids
        ]
        for judge in config.judges
    ]
    return _interleave(streams)


def refinement_trigger(verdicts: Sequence[str]) -> bool:
    """Return whether five baseline verdicts demand the refinement pass.

    A card is refined when the verdicts are not unanimous, when any family
    voted coincident (C is the dangerous verdict), or when any vote abstained.
    """
    if "ABSTAIN" in verdicts or "coincident" in verdicts:
        return True
    return len(set(verdicts)) != 1


def refined_cards(
    config: GridRunConfig,
    *,
    pool: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
) -> list[EvaluationCard]:
    """Cards whose complete baseline row (imported plus fresh) triggers Phase B."""
    refined: list[EvaluationCard] = []
    for card in pool:
        verdicts: list[str] = []
        for judge in config.judges:
            task = grid_task(
                config,
                judge=judge,
                card=card,
                repeat_index=BASELINE_REPEAT_INDEX,
                pack_hash=pack_hash,
            )
            vote = votes_by_id.get(task.vote_id)
            if vote is None:
                raise IncompleteGridError(
                    f"cannot derive Phase B: card {card.relation_id} is missing its "
                    f"baseline vote for {judge.family_id}"
                )
            verdicts.append(vote.verdict)
        if refinement_trigger(verdicts):
            refined.append(card)
    return refined


def phase_b_tasks(
    config: GridRunConfig,
    *,
    refined: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
) -> tuple[VoteTask, ...]:
    """Refinement repeats: per-family streams over refined cards, interleaved."""
    streams = [
        [
            grid_task(
                config,
                judge=judge,
                card=card,
                repeat_index=repeat_index,
                pack_hash=pack_hash,
            )
            for card in refined
            for repeat_index in REFINEMENT_REPEAT_INDICES
        ]
        for judge in config.judges
    ]
    return _interleave(streams)


def corpus_rows(
    *,
    pool: Sequence[EvaluationCard],
    shot_cards: Sequence[EvaluationCard],
    holdout_verdicts: Mapping[RelationId, Verdict],
) -> list[CorpusRow]:
    """List the full deck's eligibility records in ascending relation_id order."""
    rows = [
        CorpusRow(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            prescreen_stratum=card.prescreen_stratum,
            token_count=card.token_count,
            is_holdout=card.relation_id in holdout_verdicts,
            holdout_verdict=holdout_verdicts.get(card.relation_id),
            is_shot_excluded=False,
        )
        for card in pool
    ] + [
        CorpusRow(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            prescreen_stratum=card.prescreen_stratum,
            token_count=card.token_count,
            is_holdout=False,
            holdout_verdict=None,
            is_shot_excluded=True,
        )
        for card in shot_cards
    ]
    return sorted(rows, key=lambda row: row.relation_id)


@dataclass(frozen=True)
class CardGridRecord:
    """One card's complete vote record over baseline and refinement passes."""

    card: EvaluationCard
    votes: tuple[VoteRow, ...]
    refined: bool

    @property
    def verdict_counts(self) -> dict[Verdict, int]:
        counts = Counter(vote.verdict for vote in self.votes if vote.verdict != "ABSTAIN")
        return {verdict: counts.get(verdict, 0) for verdict in VERDICTS}

    @property
    def abstentions(self) -> int:
        return sum(vote.abstained for vote in self.votes)


def card_records(
    config: GridRunConfig,
    *,
    pool: Sequence[EvaluationCard],
    pack_hash: Sha256Hex,
    votes_by_id: Mapping[Sha256Hex, VoteRow],
) -> list[CardGridRecord]:
    """Replay every card's baseline-plus-refinement record; fail on gaps."""
    refined_ids = {
        card.relation_id
        for card in refined_cards(config, pool=pool, pack_hash=pack_hash, votes_by_id=votes_by_id)
    }
    records: list[CardGridRecord] = []
    for card in pool:
        refined = card.relation_id in refined_ids
        repeat_indices = (
            (BASELINE_REPEAT_INDEX, *REFINEMENT_REPEAT_INDICES)
            if refined
            else (BASELINE_REPEAT_INDEX,)
        )
        votes: list[VoteRow] = []
        for judge in config.judges:
            for repeat_index in repeat_indices:
                task = grid_task(
                    config,
                    judge=judge,
                    card=card,
                    repeat_index=repeat_index,
                    pack_hash=pack_hash,
                )
                vote = votes_by_id.get(task.vote_id)
                if vote is None:
                    raise IncompleteGridError(
                        f"card {card.relation_id} is missing repeat {repeat_index} "
                        f"for {judge.family_id}"
                    )
                votes.append(vote)
        records.append(CardGridRecord(card=card, votes=tuple(votes), refined=refined))
    return records


def four_class_posterior(counts: Mapping[Verdict, int]) -> dict[Verdict, float]:
    """Return the alpha=1 Dirichlet posterior mean over all four verdict classes."""
    total = sum(counts.values()) + len(VERDICTS)
    return {verdict: (counts[verdict] + 1) / total for verdict in VERDICTS}


def four_class_entropy(counts: Mapping[Verdict, int]) -> float:
    """Return the normalized entropy of the four-class Dirichlet posterior mean."""
    probabilities = four_class_posterior(counts).values()
    entropy = -math.fsum(p * math.log(p) for p in probabilities)
    return entropy / math.log(len(VERDICTS))


def card_posterior(record: CardGridRecord) -> CardPosterior:
    """Project one card's votes into the pilot's per-card posterior shape."""
    counts = record.verdict_counts
    return CardPosterior(
        relation_id=record.card.relation_id,
        card_hash=record.card.card_hash,
        counts=counts,
        probabilities=four_class_posterior(counts),
        n_votes=sum(counts.values()),
        abstentions=record.abstentions,
    )


def card_posterior_seed(record: CardGridRecord) -> NominationSeed:
    """Project one card's votes into the pilot's nomination-seed shape."""
    counts = record.verdict_counts
    return NominationSeed(
        relation_id=record.card.relation_id,
        card_hash=record.card.card_hash,
        entropy=four_class_entropy(counts),
        vote_counts=counts,
        n_votes=sum(counts.values()),
        abstentions=record.abstentions,
    )


def coincident_queue(records: Sequence[CardGridRecord]) -> list[CoincidentQueueRow]:
    """Every card with any C vote, carrying its full vote record."""
    rows: list[CoincidentQueueRow] = []
    for record in records:
        coincident_families = sorted(
            {vote.family_id for vote in record.votes if vote.verdict == "coincident"}
        )
        if not coincident_families:
            continue
        rows.append(
            CoincidentQueueRow(
                relation_id=record.card.relation_id,
                card_hash=record.card.card_hash,
                coincident_families=coincident_families,
                verdict_counts=record.verdict_counts,
                abstentions=record.abstentions,
                votes=list(record.votes),
            )
        )
    return rows


def nomination_queue(
    records: Sequence[CardGridRecord],
    *,
    decile: float = 0.1,
) -> list[NominationSeed]:
    """Select the top posterior-entropy decile, highest ambiguity first."""
    if not 0.0 < decile <= 1.0:
        raise ValueError("decile must be in (0, 1]")
    seeds = sorted(
        (card_posterior_seed(record) for record in records),
        key=lambda seed: (-seed.entropy, seed.relation_id),
    )
    count = max(1, int(len(seeds) * decile))
    return seeds[:count]
