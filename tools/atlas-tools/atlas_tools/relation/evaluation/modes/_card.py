"""Normalize the immutable card identities consumed by vote planners."""

from collections.abc import Iterable
from itertools import pairwise
from typing import Protocol

from atlas_tools.relation.evaluation.domain.api import RelationId, Sha256Hex


class CardIdentity(Protocol):
    """A relation and the exact card content evaluated for that relation."""

    @property
    def relation_id(self) -> RelationId: ...

    @property
    def card_hash(self) -> Sha256Hex: ...


def ordered_unique_cards[Card: CardIdentity](
    cards: Iterable[Card],
    *,
    allow_empty: bool = False,
) -> tuple[Card, ...]:
    """Return cards in stable relation order and reject ambiguous identities."""
    ordered = tuple(sorted(cards, key=lambda card: card.relation_id))
    if not ordered and not allow_empty:
        raise ValueError("cards must not be empty")
    duplicate = next(
        (
            right.relation_id
            for left, right in pairwise(ordered)
            if left.relation_id == right.relation_id
        ),
        None,
    )
    if duplicate is not None:
        raise ValueError(f"cards contains duplicate relation ID {duplicate}")
    return ordered
