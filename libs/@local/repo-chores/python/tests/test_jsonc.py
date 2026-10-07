from pathlib import Path

import pytest

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import MutationRecorder
from repo_chores.constraints._engine.jsonc import JsoncDocument

FIELD = ("tasks", "lint:deptry", "command")


@pytest.mark.parametrize(
    "value",
    [
        "'single'",
        "0x10",
        "01",
        "+1",
        ".1",
        "1.",
        "NaN",
        "Infinity",
        "-Infinity",
        '"\\x20"',
        '"\\v"',
        '"a\\\nb"',
    ],
)
def test_reject_json5_values(value: str) -> None:
    with pytest.raises(ManifestError):
        JsoncDocument(path=Path("turbo.json"), source='{"other": ' + value + "}")


@pytest.mark.parametrize("source", ["{bare: 1}", '{"a":\v1}', '{"a": 1,,}', '{"a": [1,,]}'])
def test_reject_non_jsonc(source: str) -> None:
    with pytest.raises(ManifestError):
        JsoncDocument(path=Path("turbo.json"), source=source)


@pytest.mark.parametrize(
    "source",
    [
        '{"tasks": {}, "tasks": {}}',
        '{"tasks": {"lint:deptry": {}, "lint:deptry": {}}}',
        '{"tasks": {"lint:deptry": {"command": [], "comm\\u0061nd": []}}}',
        '{"tasks": []}',
        '{"tasks": {"lint:deptry": false}}',
    ],
)
def test_ambiguous_owned_path_is_not_replaced(source: str) -> None:
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    recorder = MutationRecorder()
    with recorder.activate(), pytest.raises(ManifestError):
        document.assign(FIELD, ["uv"])
    assert document.render() == source
    assert not recorder.operations


def test_command_edit_preserves_surviving_slots_and_other_bytes() -> None:
    source = """// Header
{
  "tasks": {
    "lint:deptry": { "command": [
      "uv", // runner rationale
      "run", "deptry", "src", // module rationale
    ], "cache": false },
    "other": {"command":"echo unchanged", /* note */ "outputs": []},
  },
}
"""
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    recorder = MutationRecorder()
    with recorder.activate():
        document.assign(FIELD, ["uv", "run", "deptry", "src/package"])
        expected = source.replace('"src"', '"src/package"')
        assert document.render() == expected
        document.assign(FIELD, ["uv", "run", "deptry", "src/package"])
    assert len(recorder.operations) == 1


@pytest.mark.parametrize("trailing", ["", ","])
def test_grow_and_shrink_before_closing_comments(trailing: str) -> None:
    source = (
        '{"tasks":{"lint:deptry":{"command":["uv", // runner\n "src"'
        + trailing
        + " // old last\n // closing block\n]}}}"
    )
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    with MutationRecorder().activate():
        document.assign(FIELD, ["uv", "src/module", "--flag", "value"])
        grown = document.render()
        assert "// runner" in grown
        assert grown.index("// old last") < grown.index('"--flag"')
        assert grown.index('"value"') < grown.index("// closing block")
        assert document.strings(FIELD) == ["uv", "src/module", "--flag", "value"]
        document.assign(FIELD, ["uv"])
        shrunk = document.render()
        assert "// runner" in shrunk
        assert "// closing block" in shrunk
        assert document.strings(FIELD) == ["uv"]
        document.assign(FIELD, [])
        assert "// closing block" in document.render()
        assert document.strings(FIELD) == []
        document.assign(FIELD, ["uv"])
        assert document.render().index('"uv"') < document.render().index("// closing block")


@pytest.mark.parametrize("trailing", ["", ","])
@pytest.mark.parametrize("newline", ["\n", "\r\n"])
@pytest.mark.parametrize("closing", ["", "\n", "\r\n", "\r"])
def test_shrink_preserves_comment_terminator(trailing: str, newline: str, closing: str) -> None:
    prefix = '{"tasks":{"lint:deptry":{"command":["uv", // runner rationale' + newline
    source = prefix + ' "obsolete"' + trailing + closing + "]}}}"
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    recorder = MutationRecorder()
    with recorder.activate():
        document.assign(FIELD, ["uv"])
        assert document.render() == prefix + ("" if closing else " ") + "]}}}"
        assert document.strings(FIELD) == ["uv"]
        document.assign(FIELD, ["uv"])
    assert len(recorder.operations) == 1


@pytest.mark.parametrize(
    "source",
    [
        '{"other": 1 // unrelated final value\n}',
        '{"other": 1, // unrelated final value\n}',
        "{/* empty object */}",
        '{"tasks":{/* no tasks */}}',
        '{"tasks":{"lint:deptry":{"command":"old shell" /* command note */}}}',
    ],
)
def test_insert_and_remove_command(source: str) -> None:
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    with MutationRecorder().activate():
        document.assign(FIELD, ["uv", "deptry"])
        assert document.strings(FIELD) == ["uv", "deptry"]
        if "// unrelated" in source:
            assert '"other": 1, // unrelated final value\n' in document.render()
        document.assign(FIELD, None)
        assert document.strings(FIELD) is None
    if '"other"' in source:
        assert '"other": 1' in document.render()


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
def test_no_op_keeps_jsonc_spelling(newline: str) -> None:
    source = """/* a */ {"tasks": {"lint:deptry": {"command": ["u\\u0076", "deptry",],},}, "other": 1e+2, "other": 2,}
""".replace("\n", newline)
    document = JsoncDocument(path=Path("turbo.json"), source=source)
    with MutationRecorder().activate():
        document.assign(FIELD, ["uv", "deptry"])
    assert document.render() == source
