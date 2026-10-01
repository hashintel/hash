"""Preservation and attributed writes through live document nodes."""

import tomllib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
import tomlkit

from repo_chores.constraints._engine.document import (
    Document,
    DocumentArray,
    DocumentString,
    DocumentTable,
    MutationRecorder,
    OperationKind,
    mutation,
)
from repo_chores.constraints._engine.location import LocationPath


@pytest.fixture(autouse=True)
def trace() -> Iterator[MutationRecorder]:
    recorder = MutationRecorder()
    with recorder.activate():
        yield recorder


def _proxy(source: str) -> Document:
    return Document(path=Path("pyproject.toml"), source=source)


def _positions(sections: tuple[LocationPath, ...]) -> Callable[[LocationPath], int]:
    positions = {section: index for index, section in enumerate(sections)}

    def key(path: LocationPath) -> int:
        return min(
            (index for section, index in positions.items() if section[: len(path)] == path),
            default=len(positions),
        )

    return key


@dataclass(frozen=True, kw_only=True)
class SectionCase:
    preamble: str
    fragments: tuple[str, ...]
    order: tuple[int, ...]
    sections: tuple[LocationPath, ...]
    field: tuple[str, ...]

    @property
    def source(self) -> str:
        return self.preamble + "".join(self.fragments)

    @property
    def expected(self) -> str:
        return self.preamble + "".join(self.fragments[index] for index in self.order)


_SECTIONS = [
    pytest.param(
        SectionCase(
            preamble="project.name = 'root' # dotted parent\nroot = +1_000\n",
            fragments=(
                "[z]\nvalue = 'z'\n",
                "\n# child explanation\n[project.extra]\nvalue = 'child'\n",
            ),
            order=(1, 0),
            sections=(("project", "extra"), ("z",)),
            field=("project", "extra", "value"),
        ),
        id="dotted-parent-with-header",
    ),
    pytest.param(
        SectionCase(
            preamble="# preamble\nproject.name = 'root' # dotted parent\nroot-count = +1_234\n",
            fragments=(
                "[tool.ruff] # ruff header\nline-length = 88\nmessage = '# not a comment'\n",
                "\n# workspace explanation\n[tool.uv.workspace] # workspace header\nmembers = []\n",
                "\n# build explanation\n[build-system] # build header\nrequires = []\n",
                "\n# uv explanation\n[tool.uv] # uv header\npackage = false\n",
            ),
            order=(2, 3, 1, 0),
            sections=(
                ("build-system",),
                ("tool", "uv"),
                ("tool", "uv", "workspace"),
                ("tool", "ruff"),
            ),
            field=("tool", "ruff", "message"),
        ),
        id="repeated-parents",
    ),
    pytest.param(
        SectionCase(
            preamble="# preamble\nroot = 0xAB_CD\n",
            fragments=(
                "[tool.deep.z] # z\nvalue = 'z'\n",
                "\n# a explanation\n[tool.deep.a] # a\nvalue = 'a'\n",
                "\n# build explanation\n[build-system]\nrequires = []\n",
                "\n# deep explanation\n[tool.deep] # deep\nvalue = 'deep'\n",
                "\n# tool explanation\n[tool] # tool\nvalue = 'tool'\n",
            ),
            order=(4, 3, 1, 0, 2),
            sections=(
                ("tool",),
                ("tool", "deep"),
                ("tool", "deep", "a"),
                ("tool", "deep", "z"),
                ("build-system",),
            ),
            field=("tool", "deep", "value"),
        ),
        id="nested-parents",
    ),
    pytest.param(
        SectionCase(
            preamble='"root.meta"."literal.dot" = 0xA_B\nroot = +1_000\n',
            fragments=(
                "['tool'.'z.z'] # z\n'quoted.field' = 'z'\n",
                '\n# a explanation\n["tool"."a.a"] # a\nmessage = "a"\n',
            ),
            order=(1, 0),
            sections=(("tool", "a.a"), ("tool", "z.z")),
            field=("tool", "z.z", "quoted.field"),
        ),
        id="quoted-keys",
    ),
    pytest.param(
        SectionCase(
            preamble="root = 1_000\n[anchor]\nvalue = 'anchor'\n",
            fragments=(
                "\n# first entry\n[[catalog.entry]] # one\nname = 'one'\n",
                "\n# z explanation\n[z]\nvalue = 'z'\n",
                "\n# catalog explanation\n[catalog]\nlabel = 'catalog'\n",
                "\n# second entry\n[[catalog.entry]] # two\nname = 'two'\n",
            ),
            order=(2, 0, 3, 1),
            sections=(("anchor",), ("catalog",), ("catalog", "entry"), ("z",)),
            field=("z", "value"),
        ),
        id="split-arrays-of-tables",
    ),
]


@pytest.mark.parametrize("case", _SECTIONS)
def test_section_order_keeps_explanations(case: SectionCase) -> None:
    proxy = _proxy(case.source)
    proxy.sort_sections(_positions(case.sections))
    assert proxy.render() == case.expected
    proxy.set_string(case.field, "updated")
    changed = proxy.expect(case.field, DocumentString)
    assert changed is not None and changed.item == "updated"
    rendered = proxy.render()
    proxy.sort_sections(_positions(case.sections))
    assert proxy.render() == rendered
    expected = tomllib.loads(case.source)
    parent = expected
    for component in case.field[:-1]:
        parent = parent[component]
    parent[case.field[-1]] = "updated"
    assert tomllib.loads(rendered) == expected


@pytest.mark.parametrize(
    ("source", "sections", "expected"),
    [
        pytest.param(
            "[[project.authors]] # first\nname = 'one'\n[z]\nvalue = 'z'\n"
            "[project]\nname = 'p'\n[[project.authors]] # second\nname = 'two'\n"
            "[project.optional-dependencies]\nextra = []\n[a]\nvalue = 'a'\n",
            (("project",), ("project", "optional-dependencies"), ("a",), ("z",)),
            "[project]\nname = 'p'\nauthors = [\n    # first\n    { name = 'one' },\n"
            "    # second\n    { name = 'two' },\n]\n"
            "[project.optional-dependencies]\nextra = []\n[a]\nvalue = 'a'\n[z]\nvalue = 'z'\n",
            id="split-fragments",
        ),
        pytest.param(
            "project.name = 'p'\nroot = 1_000\n[z]\nvalue = 'z'\n[[project.authors]]\nname = 'one'\n",
            (("z",),),
            "project.name = 'p'\nproject.authors = [\n    { name = 'one' },\n]\n"
            "root = 1_000\n[z]\nvalue = 'z'\n",
            id="dotted-parent",
        ),
        pytest.param(
            "[project]\nname = 'p'\n\n# Alice explanation\n[[project.authors]]\nname = 'Alice'\n"
            "\n# Between explanation\n[tool.intervening]\nvalue = 'between'\n"
            "\n# Bob explanation\n[[project.authors]]\nname = 'Bob'\n"
            "\n# Tool explanation\n[tool.example]\nvalue = 'unchanged'\n",
            (("project",), ("tool", "example"), ("tool", "intervening")),
            "[project]\nname = 'p'\n\n# Alice explanation\nauthors = [\n"
            "    { name = 'Alice' },\n    # Bob explanation\n    { name = 'Bob' },\n]\n"
            "\n# Tool explanation\n[tool.example]\nvalue = 'unchanged'\n"
            "\n# Between explanation\n[tool.intervening]\nvalue = 'between'\n",
            id="explanations",
        ),
        pytest.param(
            "[tool.z]\nvalue = 'z'\n\n# project explanation\n[project]\nname = 'p'\n"
            "\n# author explanation\n[[project.authors]] ##first\nname = 'HASH' # #field\n"
            "\n# a explanation\n[tool.a]\nvalue = 'a'\n",
            (("project",), ("tool", "a"), ("tool", "z")),
            "\n# project explanation\n[project]\nname = 'p'\n"
            "\n# author explanation\nauthors = [\n    ##first\n    # #field\n"
            "    { name = 'HASH' },\n]\n"
            "\n# a explanation\n[tool.a]\nvalue = 'a'\n[tool.z]\nvalue = 'z'\n",
            id="header-and-field-comments",
        ),
    ],
)
def test_inline_authors(source: str, sections: tuple[LocationPath, ...], expected: str) -> None:
    proxy = _proxy(source)
    proxy.inline_array_of_tables(("project", "authors"))
    proxy.sort_sections(_positions(sections))
    assert proxy.render() == expected
    assert tomllib.loads(expected) == tomllib.loads(source)


def test_nested_author_table_refuses_before_mutation(trace: MutationRecorder) -> None:
    source = "[project]\nname = 'p'\n[[project.authors]]\nname = 'HASH'\n[project.authors.contact]\nurl = 'x'\n"
    proxy = _proxy(source)
    with pytest.raises(TypeError, match="Nested tables"):
        proxy.inline_array_of_tables(("project", "authors"))
    assert proxy.render() == source
    assert trace.operations == []


@pytest.mark.parametrize(
    ("source", "field", "expected"),
    [
        pytest.param(
            "[tool.ruff]\nline-length = 88\n\n# pytest owns this explanation\n"
            "[tool.pytest.ini_options]\naddopts = '-q' # keep\n",
            ("tool", "ruff"),
            "\n# pytest owns this explanation\n[tool.pytest.ini_options]\naddopts = '-q' # keep\n",
            id="following-explanation",
        ),
        pytest.param(
            "[project]\nname = 'p'\n[tool.deep.ruff]\nline-length = 88\n\n# footer\n",
            ("tool", "deep", "ruff"),
            "[project]\nname = 'p'\n\n# footer\n",
            id="implicit-parents-leave",
        ),
        pytest.param(
            "[tool]\nruff = { lint = { select = [] } }\n",
            ("tool", "ruff", "lint", "select"),
            "[tool]\nruff = { lint = {  } }\n",
            id="explicit-empty-table-stays",
        ),
    ],
)
def test_delete(source: str, field: LocationPath, expected: str) -> None:
    proxy = _proxy(source)
    proxy.remove(field)
    assert proxy.render() == expected
    assert proxy.at(field) is None


def test_retained_table_string_after_sort_and_removal() -> None:
    source = "[z]\nname = 'before' # keep\n[a]\nvalue = 1\n"
    document = _proxy(source)
    name = document.at(("z", "name"))
    assert isinstance(name, DocumentString)
    trivia = name.trivia
    document.sort_sections(lambda path: path)
    name.set("after")
    assert name.item == "after"
    assert name.trivia is trivia
    assert document.render() == "[a]\nvalue = 1\n[z]\nname = 'after' # keep\n"
    document.remove(("z", "name"))
    document.set_string(("z", "name"), "replacement")
    with pytest.raises(LookupError, match="removed"):
        name.set("must not write")
    replacement = document.expect(("z", "name"), DocumentString)
    assert replacement is not None and replacement.item == "replacement"


def test_insert_into_empty_array_keeps_footer() -> None:
    source = "requires = [ # opening\n    # footer\n]\n"
    document = _proxy(source)
    array = document.at(("requires",))
    assert isinstance(array, DocumentArray)
    array.insert(0, DocumentString.from_str("first", location=array.location.descend(0)))
    expected = source.replace("\n    # footer", '\n    "first"\n    # footer')
    assert document.render() == expected
    assert tomlkit.parse(expected)["requires"] == ["first"]


def test_replace_table_keeps_following_section_comment() -> None:
    source = "[project]\nname = 'p'\n[tool.old]\nvalue = 1\n\n# survivor\n[keep]\nvalue = 2\n"
    document = _proxy(source)
    old = document.expect(("tool",), DocumentTable)
    assert old is not None
    replacement = _proxy("[new]\nvalue = 'new'\n")
    document.assign(field=("tool",), value=replacement)
    assert "\n# survivor\n[keep]\nvalue = 2\n" in document.render()
    assert tomllib.loads(document.render())["tool"] == {"new": {"value": "new"}}
    with pytest.raises(LookupError, match="replaced"):
        old.get("old")


def test_trace_and_equal_assignment(trace: MutationRecorder) -> None:
    proxy = _proxy("[project]\nname = 'p' # keep\nflag = true\ndeps = ['a']\n")
    trace.rule, trace.pass_number = "rule", 3
    proxy.set_string(("project", "name"), "p")
    proxy.assign(
        field=("project", "deps"),
        value=DocumentArray.from_strings(
            ("a",), location=proxy.location.descend("project").descend("deps")
        ),
    )
    array = proxy.at(("project", "deps"))
    assert isinstance(array, DocumentArray)
    with mutation(reason="reason"):
        proxy.set_boolean(("project", "flag"), False)
        array.insert(1, DocumentString.from_str("b", location=array.location.descend(1)))
    array.permute([1, 0])
    assert proxy.render() == "[project]\nname = 'p' # keep\nflag = false\ndeps = [\"b\", 'a']\n"
    assert [
        (
            operation.kind,
            operation.location.path,
            operation.before,
            operation.after,
            operation.reason,
        )
        for operation in trace.operations
    ] == [
        (OperationKind.SET, ("project", "flag"), "true", "false", "reason"),
        (OperationKind.INSERT, ("project", "deps", 1), None, "b", "reason"),
        (OperationKind.SORT, ("project", "deps"), "['a', \"b\"]", "[\"b\", 'a']", None),
    ]
    assert {(operation.rule, operation.pass_number) for operation in trace.operations} == {
        ("rule", 3)
    }


def test_invalid_assignment_keeps_the_document(trace: MutationRecorder) -> None:
    source = "[project]\nname = 'p'\n"
    proxy = _proxy(source)
    with pytest.raises(ValueError, match="expected a table"):
        proxy.set_string(("project", "name", "nested"), "x")
    assert proxy.render() == source
    assert trace.operations == []
