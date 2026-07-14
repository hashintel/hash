from pathlib import Path

import pytest

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
        ("execution/runner.py", 1, 1, "os", "execution"),
        ("transport/client.py", 1, 1, "tempfile", "transport"),
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
