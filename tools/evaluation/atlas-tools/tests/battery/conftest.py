"""Shared fixtures for the battery tests.

The expensive end-to-end harness run (smoke suite x {pca2d, shuffle,
collapse}) is session-scoped and shared by several acceptance tests; the
umap acceptance test (marked ``slow``) runs its own suite.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from atlas_tools.battery.harness import run_suite

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
SUITES_DIR = PACKAGE_ROOT / "suites"
ENGINES_DIR = PACKAGE_ROOT / "engines"
FIXTURES_DIR = PACKAGE_ROOT / "fixtures" / "battery"

SMOKE_SUITE = SUITES_DIR / "smoke.yaml"


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: long-running end-to-end tests (umap subprocesses)"
    )


def engine_entries() -> dict[str, dict]:
    """All committed engine configs (default + adversarial), by name."""
    entries: dict[str, dict] = {}
    for filename in ("default.yaml", "adversarial.yaml"):
        data = yaml.safe_load((ENGINES_DIR / filename).read_text(encoding="utf-8"))
        for entry in data["engines"]:
            entries[entry["name"]] = entry
    return entries


def write_engines_yaml(path: Path, names: list[str]) -> Path:
    entries = engine_entries()
    payload = {"version": 1, "engines": [entries[name] for name in names]}
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")
    return path


@pytest.fixture(scope="session")
def adversarial_run(tmp_path_factory):
    """Smoke suite run with pca2d + shuffle + collapse (one shared run)."""
    root = tmp_path_factory.mktemp("battery-adversarial")
    engines_yaml = write_engines_yaml(
        root / "engines.yaml", ["pca2d", "shuffle", "collapse"]
    )
    return run_suite(SMOKE_SUITE, engines_yaml, root / "run", jobs=4)
