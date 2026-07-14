from pathlib import Path

import pytest

from scripts.check_evaluation_architecture import main as check_architecture
from scripts.check_evaluation_imports import check_filesystem_imports, main


def _write(root: Path, relative_path: str, source: str) -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source, encoding="utf-8")


def test_filesystem_imports_are_restricted_to_effect_owners(tmp_path: Path) -> None:
    root = tmp_path / "evaluation"
    _write(root, "__init__.py", "from fileinput import input\n")
    _write(
        root,
        "domain/model.py",
        "from typing import TYPE_CHECKING\n\nif TYPE_CHECKING:\n    from pathlib import Path\n",
    )
    _write(root, "execution/runner.py", "import os.path\n")
    _write(root, "transport/client.py", "from tempfile import TemporaryDirectory\n")
    _write(root, "storage/journal.py", "import fcntl\nfrom pathlib import Path\n")
    _write(root, "analysis/report.py", "import shutil\n")
    _write(root, "application/run.py", "from pathlib import Path\n")
    _write(root, "domain/sql.py", "import sqlite3\n")
    _write(root, "modes/discovery.py", "from glob import glob\n")

    violations = check_filesystem_imports(root)

    assert [
        (
            violation.path.relative_to(root).as_posix(),
            violation.line,
            violation.column,
            violation.imported_module,
            violation.owner,
        )
        for violation in violations
    ] == [
        ("__init__.py", 1, 1, "fileinput", "package root"),
        ("analysis/report.py", 1, 1, "shutil", "analysis"),
        ("domain/model.py", 4, 5, "pathlib", "domain"),
        ("domain/sql.py", 1, 1, "sqlite3", "domain"),
        ("execution/runner.py", 1, 1, "os", "execution"),
        ("modes/discovery.py", 1, 1, "glob", "modes"),
        ("transport/client.py", 1, 1, "tempfile", "transport"),
    ]


def test_filesystem_entry_points_are_rejected_without_banning_unrelated_open_methods(
    tmp_path: Path,
) -> None:
    root = tmp_path / "evaluation"
    _write(root, "domain/direct.py", 'payload = open("card.json")\n')
    _write(root, "modes/stream.py", 'import io as streams\npayload = streams.open("cards.json")\n')
    _write(
        root,
        "execution/client.py",
        "def send(client: object) -> None:\n    client.open()\n",
    )
    _write(
        root,
        "analysis/names.py",
        "def open() -> None:\n    pass\n\nopen()\n",
    )
    _write(root, "application/run.py", 'payload = open("cards.json")\n')
    _write(root, "storage/codec.py", 'import io\npayload = io.open("cards.json")\n')

    violations = check_filesystem_imports(root)

    assert [
        (
            violation.path.relative_to(root).as_posix(),
            violation.line,
            violation.column,
            violation.imported_module,
            violation.kind,
        )
        for violation in violations
    ] == [
        ("domain/direct.py", 1, 11, "builtins.open", "access"),
        ("modes/stream.py", 2, 11, "io.open", "access"),
    ]


def test_imported_open_aliases_transfer_filesystem_capability(tmp_path: Path) -> None:
    root = tmp_path / "evaluation"
    _write(root, "domain/builtin.py", "from builtins import open as read_file\n")
    _write(root, "modes/stream.py", "from io import open as read_file\n")

    violations = check_filesystem_imports(root)

    assert [
        (
            violation.path.relative_to(root).as_posix(),
            violation.imported_module,
            violation.kind,
        )
        for violation in violations
    ] == [
        ("domain/builtin.py", "builtins.open", "import"),
        ("modes/stream.py", "io.open", "import"),
    ]


def test_command_reports_source_locations_and_failure_status(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "evaluation"
    _write(root, "modes/pilot.py", "from pathlib import Path\n")

    status = main([str(root)])

    assert status == 1
    captured = capsys.readouterr()
    assert captured.out == (
        "modes/pilot.py:1:1: EVAL001 filesystem import 'pathlib' belongs in "
        "application or storage; found in modes\n"
    )
    assert captured.err == ""


def test_architecture_command_rejects_dependency_and_filesystem_violations(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    project = tmp_path / "project"
    root = project / "atlas_tools/relation/evaluation"
    _write(project, "atlas_tools/__init__.py", "")
    _write(project, "atlas_tools/relation/__init__.py", "")
    _write(root, "__init__.py", "")
    _write(root, "domain/__init__.py", "")
    _write(root, "domain/model.py", 'import trio\nfrom pathlib import Path\npayload = open("x")\n')
    _write(
        project,
        "tach.toml",
        """\
source_roots = ["."]
exact = true
respect_gitignore = false
root_module = "ignore"

[[modules]]
path = "atlas_tools.relation.evaluation.domain"
depends_on = []
depends_on_external = []
""",
    )
    _write(
        project,
        "pyproject.toml",
        """\
[project]
name = "synthetic-evaluation"
version = "0.0.0"
dependencies = ["trio"]
""",
    )

    status = check_architecture([str(project)])

    assert status == 1
    captured = capsys.readouterr()
    assert "domain/model.py:2:1: EVAL001 filesystem import 'pathlib'" in captured.out
    assert "domain/model.py:3:11: EVAL002 filesystem access 'builtins.open'" in captured.out
    assert "domain/model.py:1" in captured.err
    assert "trio" in captured.err


def test_architecture_command_accepts_the_repository_tree() -> None:
    project = Path(__file__).resolve().parents[3]

    assert check_architecture([str(project)]) == 0
