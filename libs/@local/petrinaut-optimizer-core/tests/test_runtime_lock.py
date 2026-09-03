from __future__ import annotations

import json
import re
from importlib.metadata import version
from pathlib import Path

RUNTIME_LOCK = Path(__file__).resolve().parents[1] / "runtime-lock.json"


def test_browser_wheel_pins_match_the_versions_this_package_installs() -> None:
    lock = json.loads(RUNTIME_LOCK.read_text())

    assert lock["packages"]["optuna"] == version("optuna")
    assert lock["packages"]["colorlog"] == version("colorlog")


def test_runtime_lock_names_a_pyodide_release_and_its_distribution_packages() -> None:
    lock = json.loads(RUNTIME_LOCK.read_text())

    assert re.fullmatch(r"\d+\.\d+\.\d+", lock["pyodide"])
    assert re.fullmatch(r"\d+\.\d+\.\d+", lock["python"])
    assert lock["pyodideDistributionPackages"] == sorted(
        set(lock["pyodideDistributionPackages"])
    )
