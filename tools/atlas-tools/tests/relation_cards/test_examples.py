from dataclasses import dataclass

import pytest

from atlas_tools.relation_cards.common.examples import (
    ExampleCandidate,
    ExampleStratum,
    SelectedExample,
    select_diverse_examples,
)


@dataclass(frozen=True)
class _Payload:
    name: str


SHARED_ENDPOINT = "entity:shared"


def _candidate(
    name: str,
    *,
    subgroup: str = "default",
    recognizability: float = 0.0,
    subject_token: str | None = None,
    object_token: str | None = None,
    additional_conflict_tokens: frozenset[str] = frozenset(),
) -> ExampleCandidate[_Payload]:
    return ExampleCandidate(
        payload=_Payload(name),
        subject_token=subject_token or f"subject:{name}",
        object_token=object_token or f"object:{name}",
        subgroup=subgroup,
        recognizability=recognizability,
        additional_conflict_tokens=additional_conflict_tokens,
    )


def _names[StratumT](
    selected: tuple[SelectedExample[StratumT, _Payload], ...],
) -> list[str]:
    return [example.payload.name for example in selected]


def test_recognizable_head_then_distinct_subgroups_before_repeats() -> None:
    selected = select_diverse_examples(
        [
            ExampleStratum(
                key="source",
                candidates=(
                    _candidate("France", subgroup="country", recognizability=10),
                    _candidate("Spain", subgroup="country", recognizability=9),
                    _candidate("Casefabre", subgroup="village", recognizability=1),
                ),
            )
        ],
        count=3,
    )

    assert _names(selected) == ["France", "Casefabre", "Spain"]


def test_slot_cap_preserves_small_strata_then_relaxes_to_fill_budget() -> None:
    selected = select_diverse_examples(
        [
            ExampleStratum(
                key="large",
                candidates=tuple(_candidate(f"large-{index}") for index in range(20)),
            ),
            ExampleStratum(
                key="small",
                candidates=tuple(_candidate(f"small-{index}") for index in range(2)),
            ),
        ],
        count=8,
    )

    assert [example.stratum for example in selected].count("large") == 6
    assert [example.stratum for example in selected].count("small") == 2
    assert [example.stratum for example in selected] == ["large"] * 6 + ["small"] * 2


def test_endpoint_conflict_shortfall_refills_from_another_stratum() -> None:
    selected = select_diverse_examples(
        [
            ExampleStratum(
                key="first",
                candidates=(_candidate("first", object_token=SHARED_ENDPOINT),),
            ),
            ExampleStratum(
                key="conflicting",
                candidates=(_candidate("conflicting", object_token=SHARED_ENDPOINT),),
            ),
            ExampleStratum(
                key="refill",
                candidates=(
                    _candidate("refill-1"),
                    _candidate("refill-2"),
                ),
            ),
        ],
        count=3,
    )

    assert _names(selected) == ["first", "refill-1", "refill-2"]


def test_additional_conflict_token_skips_duplicate_text_but_keeps_alternates() -> None:
    duplicate_line = "rendered:source\0A\0B"
    selected = select_diverse_examples(
        [
            ExampleStratum(
                key="source",
                candidates=(
                    _candidate(
                        "first",
                        recognizability=3,
                        additional_conflict_tokens=frozenset({duplicate_line}),
                    ),
                    _candidate(
                        "duplicate",
                        recognizability=2,
                        additional_conflict_tokens=frozenset({duplicate_line}),
                    ),
                    _candidate("alternate", recognizability=1),
                ),
            )
        ],
        count=3,
    )

    assert _names(selected) == ["first", "alternate"]


def test_empty_strata_do_not_consume_guaranteed_slots() -> None:
    selected = select_diverse_examples(
        [
            ExampleStratum[str, _Payload](key="empty", candidates=()),
            ExampleStratum(key="alpha", candidates=(_candidate("a"),)),
            ExampleStratum(key="beta", candidates=(_candidate("b"),)),
        ],
        count=2,
    )

    assert [example.stratum for example in selected] == ["alpha", "beta"]


@pytest.mark.parametrize(
    ("count", "slot_cap", "message"),
    [(-1, 3, "non-negative"), (1, 0, "positive")],
)
def test_invalid_budgets_are_rejected(count: int, slot_cap: int, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        select_diverse_examples([], count=count, slot_cap=slot_cap)
