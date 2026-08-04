"""Tests for managed-array reconciliation: order, comments, layout, and refusals."""

import tomlkit
from tomlkit.items import Array

from repo_chores.toml_edit import navigate_to_array, reconcile_string_array


def _members(source: str) -> tuple[tomlkit.TOMLDocument, Array]:
    document = tomlkit.parse(source)
    return document, navigate_to_array(document, path=("members",))


def test_reordered_entries_are_sorted_in_place() -> None:
    document, members = _members('members = [\n    "b",\n    "a",\n]\n')

    reconcile_string_array(members, expected=("a", "b"))

    assert tomlkit.dumps(document) == 'members = [\n    "a",\n    "b",\n]\n'


def test_reconciliation_is_idempotent() -> None:
    document, members = _members('members = [\n    "c",\n    "a",\n]\n')

    reconcile_string_array(members, expected=("a", "b", "c"))
    once = tomlkit.dumps(document)
    reconcile_string_array(members, expected=("a", "b", "c"))

    assert tomlkit.dumps(document) == once
    assert list(members) == ["a", "b", "c"]


def test_stale_and_duplicate_entries_go_and_missing_ones_arrive() -> None:
    document, members = _members('members = [\n    "ghost",\n    "a",\n    "a",\n]\n')

    reconcile_string_array(members, expected=("a", "b"))

    assert tomlkit.dumps(document) == 'members = [\n    "a",\n    "b",\n]\n'


def test_entry_comments_travel_with_their_entry() -> None:
    document, members = _members(
        'members = [\n    "zeta", # ships first\n    "alpha", # ships second\n]\n'
    )

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    "alpha", # ships second\n    "zeta", # ships first\n]\n'
    )


def test_a_comment_does_not_outlive_the_entry_it_annotated() -> None:
    document, members = _members('members = [\n    "a",\n    "ghost", # about to go\n]\n')

    reconcile_string_array(members, expected=("a", "b"))

    assert tomlkit.dumps(document) == 'members = [\n    "a",\n    "b",\n]\n'


def test_a_single_line_array_stays_on_one_line() -> None:
    document, members = _members('members = ["b", "a"]\n')

    reconcile_string_array(members, expected=("a", "b"))

    assert tomlkit.dumps(document) == 'members = ["a", "b"]\n'


def test_an_empty_array_is_filled_one_entry_per_line() -> None:
    document, members = _members("members = []\n")

    reconcile_string_array(members, expected=("b", "a"))

    assert tomlkit.dumps(document) == 'members = [\n    "a",\n    "b",\n]\n'


def test_an_array_emptied_of_every_entry_keeps_its_key() -> None:
    document, members = _members('members = [\n    "a",\n]\n')

    reconcile_string_array(members, expected=())

    assert list(members) == []
    assert "members" in tomlkit.dumps(document)


def test_a_comment_line_travels_with_the_entry_below_it() -> None:
    document, members = _members('members = [\n    "zeta",\n    # the newcomer\n    "alpha",\n]\n')

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    # the newcomer\n    "alpha",\n    "zeta",\n]\n'
    )


def test_a_run_of_comment_lines_stays_together_above_its_entry() -> None:
    document, members = _members(
        'members = [\n    "zeta",\n    # two lines\n    # about alpha\n    "alpha",\n]\n'
    )

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    # two lines\n    # about alpha\n    "alpha",\n    "zeta",\n]\n'
    )


def test_a_run_keeps_its_blank_line_and_travels_whole() -> None:
    document, members = _members(
        'members = [\n    "zeta",\n    # two lines\n\n    # about alpha\n    "alpha",\n]\n'
    )

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    # two lines\n\n    # about alpha\n    "alpha",\n    "zeta",\n]\n'
    )


def test_a_run_above_the_first_entry_follows_that_entry_rather_than_heading_the_array() -> None:
    document, members = _members(
        'members = [\n    # two lines\n    # about zeta\n    "zeta",\n    "alpha",\n]\n'
    )

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    "alpha",\n    # two lines\n    # about zeta\n    "zeta",\n]\n'
    )


def test_a_trailing_comment_and_a_run_below_it_keep_their_separate_entries() -> None:
    document, members = _members(
        'members = [\n    "zeta",  # beside zeta\n    # about alpha\n    "alpha",\n]\n'
    )

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    # about alpha\n    "alpha",\n    "zeta",  # beside zeta\n]\n'
    )


def test_a_comment_line_goes_with_the_entry_it_documented() -> None:
    document, members = _members('members = [\n    # about the ghost\n    "ghost",\n    "a",\n]\n')

    reconcile_string_array(members, expected=("a",))

    assert tomlkit.dumps(document) == 'members = [\n    "a",\n]\n'


def test_a_comment_run_after_the_last_entry_keeps_its_place() -> None:
    document, members = _members(
        'members = [\n    "b",\n    "a",\n    # documents nothing below it\n]\n'
    )

    reconcile_string_array(members, expected=("a", "b"))

    assert tomlkit.dumps(document) == (
        'members = [\n    "a",\n    "b",\n    # documents nothing below it\n]\n'
    )


def test_comment_lines_survive_a_reconciliation_that_adds_an_entry() -> None:
    document, members = _members('members = [\n    # about zeta\n    "zeta",\n]\n')

    reconcile_string_array(members, expected=("alpha", "zeta"))

    assert tomlkit.dumps(document) == (
        'members = [\n    "alpha",\n    # about zeta\n    "zeta",\n]\n'
    )
