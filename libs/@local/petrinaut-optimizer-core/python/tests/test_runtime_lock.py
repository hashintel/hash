import json
from importlib.metadata import version
from pathlib import Path

RUNTIME_LOCK = Path(__file__).resolve().parents[1] / "runtime-lock.json"


def test_runtime_wheel_versions() -> None:
    lock = json.loads(RUNTIME_LOCK.read_text())

    assert lock["packages"]["optuna"] == version("optuna")
    assert lock["packages"]["colorlog"] == version("colorlog")
