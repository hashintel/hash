from pathlib import Path

import pytest
import tomlkit
from packaging.requirements import Requirement as PackagingRequirement
from packaging.specifiers import SpecifierSet
from tomlkit.items import Array

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentArray, MutationRecorder, mutation
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints._engine.requirement import Requirement, RequirementList


def requirements(source: str) -> tuple[tomlkit.TOMLDocument, RequirementList]:
    document = tomlkit.parse(source)
    array = document["requires"]
    assert isinstance(array, Array)
    return document, RequirementList(
        DocumentArray(array, location=Location(manifest=Path("pyproject.toml"), path=("requires",)))
    )


def test_requirement_write_through() -> None:
    source = "requires = [\n    # why demo\n    'demo>=1', # keep\n]\n"
    document, entries = requirements(source)
    first, second = entries[0], entries[0]
    node, trivia = first.value(), first.value().trivia
    recorder = MutationRecorder()
    recorder.rule = "pin"
    recorder.pass_number = 2
    with recorder.activate(), mutation(reason="shared version"):
        first.specifier = SpecifierSet(">=2")
        assert second.specifier == SpecifierSet(">=2")
        second.specifier = SpecifierSet(">=2")
    assert tomlkit.dumps(document) == source.replace("demo>=1", "demo>=2")
    assert first.value() is node
    assert first.value().trivia is trivia
    assert len(recorder.operations) == 1
    operation = recorder.operations[0]
    assert (operation.before, operation.after) == ("demo>=1", "demo>=2")
    assert (operation.rule, operation.reason, operation.pass_number) == ("pin", "shared version", 2)
    assert operation.location.path == ("requires", 0)


def test_replace_malformed_requirement() -> None:
    source = "requires = ['not a requirement ???', 'demo>=1']\n"
    document, entries = requirements(source)
    held = entries[0]
    with pytest.raises(ManifestError) as caught:
        _ = held.name
    assert caught.value.field == ("requires", 0)
    with MutationRecorder().activate():
        entries[0] = entries[1]
    assert held.name == "demo"
    assert tomlkit.dumps(document) == source.replace("not a requirement ???", "demo>=1")


def test_requirement_unrepresentable_assignment() -> None:
    source = "requires = ['demo>=1']\n"
    document, entries = requirements(source)
    recorder = MutationRecorder()
    with recorder.activate(), pytest.raises(ValueError, match="prerelease policy"):
        entries[0].specifier = SpecifierSet(">=2", prereleases=True)
    assert tomlkit.dumps(document) == source
    assert recorder.operations == []


def test_requirement_removed_entry() -> None:
    document, entries = requirements("requires = ['first', 'second']\n")
    first = entries[0]
    recorder = MutationRecorder()
    with recorder.activate():
        del entries[0]
        with pytest.raises(LookupError, match="removed after"):
            first.specifier = SpecifierSet(">=2")
    assert str(entries[0]) == "second"
    assert "first" not in tomlkit.dumps(document)
    assert len(recorder.operations) == 1


def test_requirement_conversion() -> None:
    original = PackagingRequirement('demo[extra]>=1; python_version < "3.14"')
    requirement = Requirement.from_packaging(
        original,
        location=Location(manifest=Path("pyproject.toml"), path=("requires", 0)),
    )
    assert requirement == original
    assert 'python_version < "3.14"' in requirement.value().item


def test_recorder_nesting() -> None:
    outer, inner = MutationRecorder(), MutationRecorder()
    with outer.activate(), mutation(reason="outer"):
        with inner.activate(), mutation(reason="inner"):
            assert MutationRecorder.current() is inner
        assert MutationRecorder.current() is outer
        assert outer.current_reason == "outer"
    with pytest.raises(LookupError):
        MutationRecorder.current()


def test_sort_comment_views() -> None:
    header = "requires = [ # header\n"
    zulu = "    # zulu explanation\n    'zulu>=1', # zulu inline\n"
    alpha = "    # alpha explanation\n    'alpha>=1', # alpha inline\n"
    footer = "    # footer\n]\n"
    document, entries = requirements(header + zulu + alpha + footer)
    held = entries[0]
    recorder = MutationRecorder()
    with recorder.activate():
        entries.sort_by(lambda requirement: requirement.name)
        sorted_source = tomlkit.dumps(document)
        assert sorted_source == header + alpha + zulu + footer
        assert held.location.path == ("requires", 1)
        held.specifier = SpecifierSet(">=2")
        entries.sort_by(lambda requirement: requirement.name)
    assert tomlkit.dumps(document) == (header + alpha + zulu + footer).replace("zulu>=1", "zulu>=2")
    assert recorder.operations[0].after == sorted_source.partition(" = ")[2].rstrip("\n")
    assert len(recorder.operations) == 2
    assert [requirement.name for requirement in entries] == ["alpha", "zulu"]
    assert tomlkit.parse(tomlkit.dumps(document))["requires"] == ["alpha>=1", "zulu>=2"]


@pytest.mark.parametrize(
    "array",
    [
        '["zulu", "alpha"]',
        '[ "zulu" , "alpha" ]',
        '[\n    "zulu"\n  , "alpha"\n]',
        '[\n    "zulu", "alpha",\n]',
        '["zulu", # zulu comment\n "alpha"]',
        '["zulu",\n # alpha comment\n "alpha"]',
        '["zulu" # zulu comment\n, "alpha"]',
    ],
)
def test_sort_separator_layout(array: str) -> None:
    document, entries = requirements(f"requires = {array}\n")
    recorder = MutationRecorder()
    with recorder.activate():
        entries.sort_by(lambda requirement: requirement.name)
    assert [requirement.name for requirement in entries] == ["alpha", "zulu"]
    assert tomlkit.parse(tomlkit.dumps(document))["requires"] == ["alpha", "zulu"]


def test_overlapping_slice_assignment() -> None:
    document, entries = requirements("requires = ['first', 'second', 'third']\n")
    with MutationRecorder().activate():
        entries[::-1] = entries
        assert [entry.name for entry in entries] == ["third", "second", "first"]
        entries[1:2] = [entries[0], entries[2]]
        assert [entry.name for entry in entries] == ["third", "third", "first", "first"]
        entries[1:] = []
    assert tomlkit.parse(tomlkit.dumps(document))["requires"] == ["third"]
