from collections import Counter, defaultdict
from datetime import timedelta
from math import fsum, inf
from pathlib import Path

from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    CorpusRecord,
    GridRunState,
    JudgeFamilyId,
    PhysicalAttempt,
    Vote,
    VoteId,
)
from atlas_tools.relation.evaluation.storage.api import load_json, load_jsonl

RUN = Path("runs/grid-v2")
TRIGGER_RATE = 0.40
IDLE_GAP = timedelta(minutes=10)


def latest_rate(attempts: list[PhysicalAttempt]) -> float:
    ordered = sorted(attempts, key=lambda attempt: attempt.request_at)
    if not ordered:
        return 0.0

    segment_start = 0
    segment_end = ordered[0].response_at

    for index, attempt in enumerate(ordered[1:], start=1):
        if attempt.request_at - segment_end > IDLE_GAP:
            segment_start = index
            segment_end = attempt.response_at
        else:
            segment_end = max(segment_end, attempt.response_at)

    segment = ordered[segment_start:]
    completed = {
        attempt.vote_id for attempt in segment if isinstance(attempt.outcome, AcceptedAttempt)
    }
    elapsed = (
        max(attempt.response_at for attempt in segment)
        - min(attempt.request_at for attempt in segment)
    ).total_seconds()

    return len(completed) / elapsed if elapsed > 0 else 0.0


state = load_json(RUN / "run-state.json", GridRunState)
corpus = load_jsonl(RUN / "corpus.jsonl", CorpusRecord)
imported_votes = load_jsonl(RUN / "imported-votes.jsonl", Vote)
attempts = load_jsonl(RUN / "attempts.jsonl", PhysicalAttempt)

holdouts = sum(record.is_holdout for record in corpus)
imported = Counter(vote.family_id for vote in imported_votes)

accepted: defaultdict[JudgeFamilyId, set[VoteId]] = defaultdict(set)
by_family: defaultdict[JudgeFamilyId, list[PhysicalAttempt]] = defaultdict(list)
known_costs: list[float] = []

for attempt in attempts:
    by_family[attempt.family_id].append(attempt)

    if isinstance(attempt.outcome, AcceptedAttempt):
        accepted[attempt.family_id].add(attempt.vote_id)

    result = attempt.result
    if result is not None and result.usage is not None:
        if result.usage.cost_usd is not None:
            known_costs.append(result.usage.cost_usd)

estimated_refined_cards = round(state.pool_cards * TRIGGER_RATE)
etas: list[float] = []

for family in sorted(imported.keys() | by_family.keys()):
    done = len(accepted[family])
    phase_a = state.pool_cards - imported[family]
    total = phase_a + estimated_refined_cards * 2 + holdouts
    rate = latest_rate(by_family[family])
    remaining = max(total - done, 0)
    eta = remaining / rate / 3600 if rate else inf
    etas.append(eta)

    print(f"{family:<28} {done:>5}/{total}  {rate * 60:5.1f}/min  ETA {eta:5.1f}h")

print(f"\nknown spend ${fsum(known_costs):.2f}; wall clock = slowest stream ~ {max(etas):.1f}h")
