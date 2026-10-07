"""Tests for both constraints command entrypoints."""

from collections.abc import Callable, Sequence
from io import StringIO
from pathlib import Path
from typing import NamedTuple, Never

import pytest

from repo_chores import __main__ as root_cli
from repo_chores.constraints import __main__ as module_cli
from repo_chores.constraints import cli
from repo_chores.constraints._engine import (
    CheckReport,
    FixReport,
    ManifestDiff,
    Operation,
    OperationKind,
)
from repo_chores.constraints._engine.diagnostics import (
    FixError,
    ManifestError,
    RuleError,
    RuleWarning,
    WorkspaceError,
)
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints.cli import ConstraintMode
from repo_chores.constraints.rendering import render_report


class _Entrypoint(NamedTuple):
    main: Callable[[Sequence[str]], int]
    prefix: tuple[str, ...]


class _CliFixtures(NamedTuple):
    directory: Path
    monkeypatch: pytest.MonkeyPatch
    capsys: pytest.CaptureFixture[str]


_ENTRYPOINTS = (
    pytest.param(_Entrypoint(root_cli.main, ("constraints",)), id="main-prefix0"),
    pytest.param(_Entrypoint(module_cli.main, ()), id="main-prefix1"),
)


@pytest.fixture
def cli_fixtures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> _CliFixtures:
    return _CliFixtures(tmp_path, monkeypatch, capsys)


def operation(location: Location, before: object, after: object, *, rule: str) -> Operation:
    return Operation(
        location=location,
        kind=OperationKind.SET,
        before=before,
        after=after,
        rule=rule,
        reason=None,
        pass_number=1,
    )


def check(*, changed: bool = False, blocked: bool = False) -> CheckReport:
    location = Location(manifest=Path("pyproject.toml"), path=("project", "name"))
    return CheckReport(
        operations=(operation(location, "old", "new", rule="test"),) if changed else (),
        diffs=(
            ManifestDiff(
                path=location.manifest,
                before=b'[project]\nname = "old"\n',
                after=b'[project]\nname = "new"\n',
            ),
        )
        if changed
        else (),
        diagnostics=(RuleError(location=location, rule="test", error=ValueError("blocked")),)
        if blocked
        else (),
        passes=1,
    )


def fix(*, changed: bool = False, blocked: bool = False) -> FixReport:
    return FixReport(
        report=check(changed=changed, blocked=blocked),
        written=(Path("pyproject.toml"),) if changed and not blocked else (),
    )


@pytest.mark.parametrize("entrypoint", _ENTRYPOINTS)
@pytest.mark.parametrize("fix_requested", [False, True])
def test_forwarding(
    entrypoint: _Entrypoint, *, fix_requested: bool, cli_fixtures: _CliFixtures
) -> None:
    calls: list[tuple[Path, ConstraintMode]] = []

    def verify(*, directory: Path, mode: ConstraintMode) -> CheckReport | FixReport:
        calls.append((directory, mode))
        return fix() if mode is ConstraintMode.FIX else check()

    cli_fixtures.monkeypatch.setattr(cli, "verify_constraints", verify)
    arguments = [*entrypoint.prefix, "--directory", str(cli_fixtures.directory)]
    if fix_requested:
        arguments.append("--fix")
    assert entrypoint.main(arguments) == 0
    assert calls == [
        (cli_fixtures.directory, ConstraintMode.FIX if fix_requested else ConstraintMode.CHECK)
    ]
    assert not cli_fixtures.capsys.readouterr().err


@pytest.mark.parametrize(
    ("report", "expected"),
    [
        (check(), 0),
        (check(changed=True), 1),
        (check(blocked=True), 1),
        (fix(), 0),
        (fix(changed=True), 0),
        (fix(blocked=True), 1),
    ],
)
def test_status(report: CheckReport | FixReport, expected: int, cli_fixtures: _CliFixtures) -> None:
    calls: list[tuple[Path, ConstraintMode]] = []

    def verify(*, directory: Path, mode: ConstraintMode) -> CheckReport | FixReport:
        calls.append((directory, mode))
        return report

    cli_fixtures.monkeypatch.setattr(cli, "verify_constraints", verify)
    assert root_cli.main(["constraints"]) == expected
    assert calls == [(Path.cwd(), ConstraintMode.CHECK)]
    output = cli_fixtures.capsys.readouterr()
    if report.status.name == "BLOCKED":
        assert not output.out
        assert "blocked" in output.err.lower()
    else:
        assert not output.err
        assert (
            "clean" in output.out.lower()
            or "change" in output.out.lower()
            or "fix" in output.out.lower()
        )
    assert "0 file(s) written" in (output.err or output.out) or "1 file(s) written" in (
        output.err or output.out
    )


@pytest.mark.parametrize(
    "error",
    [
        ManifestError(path=Path("bad.toml"), field=(), message="invalid"),
        WorkspaceError(directory=Path("missing"), message="unknown workspace"),
        FixError(path=Path("bad.toml"), written=()),
    ],
)
def test_operational_error(
    error: ManifestError | WorkspaceError | FixError,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    calls: list[tuple[Path, ConstraintMode]] = []

    def verify(*, directory: Path, mode: ConstraintMode) -> Never:
        calls.append((directory, mode))
        raise error

    monkeypatch.setattr(cli, "verify_constraints", verify)
    assert module_cli.main([]) == 1
    assert calls == [(Path.cwd(), ConstraintMode.CHECK)]
    output = capsys.readouterr()
    assert not output.out
    assert "\x1b[" not in output.err
    if isinstance(error, FixError):
        assert "No files written" in output.err
        assert "bad.toml" in output.err
    else:
        assert str(error).split(": ")[-1] in output.err


def test_unexpected_error(monkeypatch: pytest.MonkeyPatch) -> None:
    failure = RuntimeError("unexpected")
    calls: list[tuple[Path, ConstraintMode]] = []

    def verify(*, directory: Path, mode: ConstraintMode) -> Never:
        calls.append((directory, mode))
        raise failure

    monkeypatch.setattr(cli, "verify_constraints", verify)
    with pytest.raises(RuntimeError) as caught:
        root_cli.main(["constraints"])
    assert caught.value is failure
    assert calls == [(Path.cwd(), ConstraintMode.CHECK)]


def test_grouped_literal_plain_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    manifest = tmp_path / "[bold]member.toml"
    location = Location(manifest=manifest, path=("project", "dependencies", 2))
    error = RuleError(location=location, rule="pin_[red]", error=ValueError("missing [bold]pin"))
    warning = RuleWarning(location=location, rule="pin_[red]", warning=Warning("inspect [link]"))
    report = CheckReport(
        operations=(operation(location, "foo>=1", "foo>=2", rule="pin_[red]"),),
        diffs=(ManifestDiff(path=manifest, before=b"a = 1 # [bold]\n", after=b"a = 2\n"),),
        diagnostics=(warning, error),
        passes=1,
    )
    calls: list[tuple[Path, ConstraintMode]] = []

    def verify(*, directory: Path, mode: ConstraintMode) -> CheckReport:
        calls.append((directory, mode))
        return report

    monkeypatch.setattr(cli, "verify_constraints", verify)
    assert root_cli.main(["constraints", "--directory", str(tmp_path)]) == 1
    assert calls == [(tmp_path, ConstraintMode.CHECK)]
    output = capsys.readouterr()
    assert not output.out
    assert output.err.splitlines().count("[bold]member.toml") == 1
    assert (
        output.err.index("error ·") < output.err.index("change ·") < output.err.index("warning ·")
    )
    assert "project.dependencies · index 2" in output.err
    assert "missing [bold]pin" in output.err
    assert "inspect [link]" in output.err
    assert "'foo>=1' → 'foo>=2' (pin_[red], pass 1)" in " ".join(output.err.split())
    assert "-a = 1 # [bold]\n+a = 2" in output.err
    assert "\x1b[" not in output.err
    assert "Fix blocked" not in output.err


def test_nested_manifest_error_location(tmp_path: Path) -> None:
    root = Location(manifest=tmp_path / "pyproject.toml", path=())
    nested = ManifestError(
        path=tmp_path / "pkg" / "pyproject.toml",
        field=("project", "license"),
        message="License is required [bold]",
    )
    report = CheckReport(
        operations=(),
        diffs=(),
        diagnostics=(RuleError(location=root, rule="license", error=nested),),
        passes=1,
    )
    stream = StringIO()
    render_report(report, directory=tmp_path, stream=stream)
    text = stream.getvalue()
    assert "pkg/pyproject.toml" in text
    assert "project.license · license: License is required [bold]" in text
    assert str(tmp_path) not in text
    assert "pyproject.toml:" not in text


def test_partial_write_operational_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    error = FixError(path=tmp_path / "second.toml", written=(tmp_path / "first.toml",))
    calls: list[tuple[Path, ConstraintMode]] = []

    def fail(*, directory: Path, mode: ConstraintMode) -> Never:
        calls.append((directory, mode))
        raise error

    monkeypatch.setattr(cli, "verify_constraints", fail)
    assert root_cli.main(["constraints", "--fix", "--directory", str(tmp_path)]) == 1
    assert calls == [(tmp_path, ConstraintMode.FIX)]
    captured = capsys.readouterr()
    assert not captured.out
    assert "second.toml" in captured.err
    assert "Already written: first.toml" in captured.err
    assert str(tmp_path) not in captured.err
