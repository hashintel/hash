from __future__ import annotations

import json
from importlib.metadata import version
from pathlib import Path

RUNTIME_LOCK = Path(__file__).resolve().parents[1] / "runtime-lock.json"


def test_browser_wheel_pins_match_the_versions_this_package_installs() -> None:
    lock = json.loads(RUNTIME_LOCK.read_text())

    assert lock["packages"]["optuna"] == version("optuna")
    assert lock["packages"]["colorlog"] == version("colorlog")
