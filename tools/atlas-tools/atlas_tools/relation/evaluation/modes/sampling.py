"""Derive a byte-stable stratified pilot slice from immutable card facts.

The sampler excludes fixed few-shot cards, always retains the six rubric-v1
holdouts, and apportions ordinary cards across deterministic composite strata.
Input order does not affect selected relations, row order, or hashes.
"""

import hashlib
import json
import math
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    RelationId,
    Sha256Hex,
    SliceSamplingConfig,
    Verdict,
)
from atlas_tools.relation.evaluation.modes._rubric_v1 import FEW_SHOT_ROWS, HOLDOUT_ROWS

type LengthQuartile = Literal[1, 2, 3, 4]

_FEW_SHOT_IDS = frozenset(relation_id for relation_id, _ in FEW_SHOT_ROWS)
_HOLDOUT_VERDICTS = dict(HOLDOUT_ROWS)


@dataclass(frozen=True, slots=True)
class SamplingCard:
    """The card facts that influence deterministic pilot selection."""

    relation_id: RelationId
    producer: str
    card_hash: CardHash
    token_count: int
    prescreen_stratum: str
    pilot_strata: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.producer:
            raise ValueError("producer must not be empty")
        if self.token_count < 0:
            raise ValueError("token_count must not be negative")
        if not self.prescreen_stratum:
            raise ValueError("prescreen_stratum must not be empty")
        if any(not stratum for stratum in self.pilot_strata):
            raise ValueError("pilot_strata must not contain empty values")
        object.__setattr__(self, "pilot_strata", tuple(sorted(set(self.pilot_strata))))


@dataclass(frozen=True, order=True, slots=True)
class _SamplingStratum:
    """The structured quota key for one sampling stratum."""

    producer: str
    prescreen_stratum: str
    length_quartile: LengthQuartile
    pilot_strata: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PilotSliceRow:
    """One selected card with every fact needed to replay its selection."""

    relation_id: RelationId
    card_hash: CardHash
    prescreen_stratum: str
    sampling_stratum: str
    length_quartile: LengthQuartile
    pilot_strata: tuple[str, ...]
    token_count: int
    is_holdout: bool
    holdout_verdict: Verdict | None
    sampling_seed: int
    selection_key: Sha256Hex


@dataclass(frozen=True, slots=True)
class SliceDerivation:
    """The complete deterministic provenance of one pilot slice."""

    algorithm: Literal["stratified-hash-v1"]
    sampling_seed: int
    requested_non_holdouts: int
    eligible_non_holdouts: int
    selected_non_holdouts: int
    cards_hash: Sha256Hex
    sampling_config_hash: Sha256Hex
    selection_hash: Sha256Hex


@dataclass(frozen=True, slots=True)
class PilotSlice:
    """The selected rows and the hashes required to verify their derivation."""

    rows: tuple[PilotSliceRow, ...]
    derivation: SliceDerivation


def _canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def _sha256_json(value: object) -> Sha256Hex:
    return hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def _length_quartiles(cards: Sequence[SamplingCard]) -> dict[RelationId, LengthQuartile]:
    ordered = sorted(cards, key=lambda card: (card.token_count, card.relation_id))
    count = len(ordered)
    quartiles: dict[RelationId, LengthQuartile] = {}
    for index, card in enumerate(ordered):
        bucket = min(4, index * 4 // count + 1)
        match bucket:
            case 1:
                quartiles[card.relation_id] = 1
            case 2:
                quartiles[card.relation_id] = 2
            case 3:
                quartiles[card.relation_id] = 3
            case 4:
                quartiles[card.relation_id] = 4
            case _:
                raise AssertionError("quartile arithmetic produced an invalid bucket")
    return quartiles


def _sampling_stratum(card: SamplingCard, quartile: LengthQuartile) -> _SamplingStratum:
    return _SamplingStratum(
        producer=card.producer,
        prescreen_stratum=card.prescreen_stratum,
        length_quartile=quartile,
        pilot_strata=card.pilot_strata,
    )


def _escape_stratum_component(value: str) -> str:
    return value.replace("%", "%25").replace("|", "%7C").replace(",", "%2C")


def _render_sampling_stratum(stratum: _SamplingStratum) -> str:
    if stratum.pilot_strata:
        trouble = ",".join(_escape_stratum_component(value) for value in stratum.pilot_strata)
        if trouble == "ordinary":
            trouble = "%6Frdinary"
    else:
        trouble = "ordinary"
    return "|".join(
        (
            _escape_stratum_component(stratum.producer),
            _escape_stratum_component(stratum.prescreen_stratum),
            f"length-q{stratum.length_quartile}",
            trouble,
        )
    )


def _selection_key(
    card: SamplingCard,
    *,
    cards_hash: Sha256Hex,
    sampling_hash: Sha256Hex,
    seed: int,
) -> Sha256Hex:
    return _sha256_json(
        {
            "card_hash": card.card_hash,
            "cards_hash": cards_hash,
            "relation_id": card.relation_id,
            "sampling_config_hash": sampling_hash,
            "seed": seed,
        }
    )


def _apportion(sizes: Mapping[_SamplingStratum, int], target: int) -> dict[_SamplingStratum, int]:
    if target < 0 or target > sum(sizes.values()):
        raise ValueError("target must fit within the available strata")
    quotas = dict.fromkeys(sizes, 0)
    if target >= len(sizes):
        quotas = dict.fromkeys(sizes, 1)
    remaining = target - sum(quotas.values())

    while remaining:
        capacities = {
            stratum: size - quotas[stratum]
            for stratum, size in sizes.items()
            if size > quotas[stratum]
        }
        total_capacity = sum(capacities.values())
        shares = {
            stratum: remaining * capacity / total_capacity
            for stratum, capacity in capacities.items()
        }
        floor_allocations = {
            stratum: min(capacities[stratum], math.floor(share))
            for stratum, share in shares.items()
        }
        for stratum, allocation in floor_allocations.items():
            quotas[stratum] += allocation
            remaining -= allocation

        if remaining:
            by_remainder = sorted(
                capacities,
                key=lambda stratum: (-(shares[stratum] % 1), stratum),
            )
            for stratum in by_remainder:
                if not remaining:
                    break
                if quotas[stratum] < sizes[stratum]:
                    quotas[stratum] += 1
                    remaining -= 1
    return quotas


class SliceSelectionRow(Protocol):
    """Expose exactly the row fields committed by the selection hash."""

    @property
    def relation_id(self) -> RelationId: ...

    @property
    def card_hash(self) -> CardHash: ...

    @property
    def prescreen_stratum(self) -> str: ...

    @property
    def sampling_stratum(self) -> str: ...

    @property
    def length_quartile(self) -> LengthQuartile: ...

    @property
    def pilot_strata(self) -> tuple[str, ...]: ...

    @property
    def token_count(self) -> int: ...

    @property
    def is_holdout(self) -> bool: ...

    @property
    def holdout_verdict(self) -> Verdict | None: ...

    @property
    def sampling_seed(self) -> int: ...

    @property
    def selection_key(self) -> Sha256Hex: ...


def _row_payload(row: SliceSelectionRow) -> dict[str, object]:
    return {
        "card_hash": row.card_hash,
        "holdout_verdict": row.holdout_verdict,
        "is_holdout": row.is_holdout,
        "length_quartile": row.length_quartile,
        "pilot_strata": list(row.pilot_strata),
        "prescreen_stratum": row.prescreen_stratum,
        "relation_id": row.relation_id,
        "sampling_seed": row.sampling_seed,
        "sampling_stratum": row.sampling_stratum,
        "selection_key": row.selection_key,
        "token_count": row.token_count,
    }


def pilot_slice_selection_hash(rows: Sequence[SliceSelectionRow]) -> Sha256Hex:
    """Hash selection content independently of artifact schema metadata."""
    digest = hashlib.sha256()
    digest.update(b"[")
    separator = b""
    for row in rows:
        digest.update(separator)
        digest.update(_canonical_json_bytes(_row_payload(row)))
        separator = b","
    digest.update(b"]")
    return digest.hexdigest()


def derive_pilot_slice(
    cards: Iterable[SamplingCard],
    *,
    cards_hash: Sha256Hex,
    config: SliceSamplingConfig,
) -> PilotSlice:
    """Select the rubric-v1 pilot slice independently of input order.

    Raises [`ValueError`] for an empty eligible deck, duplicate relations, or
    any missing fixed holdout. Time is `O(n log n)` and additional memory is
    `O(n)`, where `n` is the number of non-few-shot cards.
    """
    by_id: dict[RelationId, SamplingCard] = {}
    for card in cards:
        if card.relation_id in by_id:
            raise ValueError(f"sampling cards repeat relation {card.relation_id}")
        by_id[card.relation_id] = card
    candidates = tuple(card for card in by_id.values() if card.relation_id not in _FEW_SHOT_IDS)
    if not candidates:
        raise ValueError("cards contain no pilot-eligible relations")

    missing_holdouts = tuple(
        relation_id for relation_id, _ in HOLDOUT_ROWS if relation_id not in by_id
    )
    if missing_holdouts:
        raise ValueError(f"cards lack fixed holdout relations: {missing_holdouts}")

    quartiles = _length_quartiles(candidates)
    sampling_hash = _sha256_json(
        {
            "algorithm": config.algorithm,
            "non_holdout_count": config.non_holdout_count,
            "seed": config.seed,
        }
    )
    selection_keys = {
        card.relation_id: _selection_key(
            card,
            cards_hash=cards_hash,
            sampling_hash=sampling_hash,
            seed=config.seed,
        )
        for card in candidates
    }
    ordinary = [card for card in candidates if card.relation_id not in _HOLDOUT_VERDICTS]
    target = min(config.non_holdout_count, len(ordinary))
    by_stratum: dict[_SamplingStratum, list[SamplingCard]] = defaultdict(list)
    for card in ordinary:
        by_stratum[_sampling_stratum(card, quartiles[card.relation_id])].append(card)
    quotas = _apportion(
        {stratum: len(stratum_cards) for stratum, stratum_cards in by_stratum.items()},
        target,
    )

    selected: list[SamplingCard] = []
    for stratum, stratum_cards in sorted(by_stratum.items()):
        ranked = sorted(
            stratum_cards,
            key=lambda card: (selection_keys[card.relation_id], card.relation_id),
        )
        selected.extend(ranked[: quotas[stratum]])
    selected.extend(by_id[relation_id] for relation_id, _ in HOLDOUT_ROWS)

    rows = tuple(
        PilotSliceRow(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            prescreen_stratum=card.prescreen_stratum,
            sampling_stratum=_render_sampling_stratum(
                _sampling_stratum(card, quartiles[card.relation_id])
            ),
            length_quartile=quartiles[card.relation_id],
            pilot_strata=card.pilot_strata,
            token_count=card.token_count,
            is_holdout=card.relation_id in _HOLDOUT_VERDICTS,
            holdout_verdict=_HOLDOUT_VERDICTS.get(card.relation_id),
            sampling_seed=config.seed,
            selection_key=selection_keys[card.relation_id],
        )
        for card in sorted(selected, key=lambda card: card.relation_id)
    )
    return PilotSlice(
        rows=rows,
        derivation=SliceDerivation(
            algorithm=config.algorithm,
            sampling_seed=config.seed,
            requested_non_holdouts=config.non_holdout_count,
            eligible_non_holdouts=len(ordinary),
            selected_non_holdouts=target,
            cards_hash=cards_hash,
            sampling_config_hash=sampling_hash,
            selection_hash=pilot_slice_selection_hash(rows),
        ),
    )
