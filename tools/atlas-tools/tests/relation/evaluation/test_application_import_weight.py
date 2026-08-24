"""Keep evaluation entry points independent of optional analysis stacks."""

import subprocess
import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_FORBIDDEN_ROOTS = ("matplotlib", "pyarrow", "scipy", "sklearn")


def _run_probe(source: str) -> None:
    result = subprocess.run(
        [sys.executable, "-c", source],
        cwd=_PROJECT_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_run_boundary_does_not_import_optional_analysis_stacks() -> None:
    _run_probe(
        f"""
import importlib
import sys

importlib.import_module("atlas_tools.relation.evaluation.application.run")
forbidden = {_FORBIDDEN_ROOTS!r}
loaded = sorted(root for root in forbidden if root in sys.modules)
if loaded:
    raise AssertionError(f"evaluation run imported optional stacks: {{loaded}}")
"""
    )


def test_evaluate_cli_dispatch_does_not_import_optional_analysis_stacks() -> None:
    _run_probe(
        f"""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import atlas_tools.relation.evaluation.application.run as run_module
from atlas_tools.relation.cli import EvaluateCommand
from atlas_tools.relation.evaluation.storage.api import PilotPaths

with TemporaryDirectory() as raw_directory:
    directory = Path(raw_directory)
    cards = directory / "cards"
    cards.mkdir()
    config = directory / "pilot.yaml"
    config.touch()
    output = directory / "output"

    def completed_pilot(**arguments: object) -> PilotPaths:
        if arguments["cards_directory"] != cards:
            raise AssertionError("CLI changed the cards directory")
        return PilotPaths.under(output)

    run_module.run_evaluation = completed_pilot
    EvaluateCommand(
        cards=cards,
        config=config,
        out=output,
        quiet=True,
    ).cli_cmd()

forbidden = {_FORBIDDEN_ROOTS!r}
loaded = sorted(root for root in forbidden if root in sys.modules)
if loaded:
    raise AssertionError(f"evaluate CLI imported optional stacks: {{loaded}}")
"""
    )
