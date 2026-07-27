"""Shared fixture: a miniature repository exercising every sync rule."""

import json
from pathlib import Path

import pytest

REQUIRES_PYTHON = ">=3.14,<3.15"

ROOT_PYPROJECT = f"""\
[project]
name = "fixture-root"
version = "0.0.0"
requires-python = "{REQUIRES_PYTHON}"

[tool.uv]
package = false

[tool.uv.workspace]
members = [
    "packages/alpha",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "ruff>=0.15.21",
    "tach>=0.35,<0.36",
]

[tool.ruff]
src = []

[tool.pytest.ini_options]
testpaths = []

[tool.tach]
source_roots = []
"""

ALPHA_PYPROJECT = """\
[project]
name = "alpha"
version = "0.1.0"
requires-python = ">=3.13"

[dependency-groups]
dev = [
    "pytest>=7.0",
]
"""

BETA_PYPROJECT = """\
[project]
name = "beta"
version = "0.1.0"
requires-python = ">=3.14,<3.15"
dependencies = [
    "alpha",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "ruff>=0.15.21",
]

[tool.uv.sources]
alpha = { workspace = true }
"""

GAMMA_PYPROJECT = """\
[project]
name = "gamma"
version = "0.1.0"
requires-python = ">=3.14,<3.15"

[dependency-groups]
dev = [
    "ruff>=0.15.21",
]
"""

TOOL_ONLY_PYPROJECT = """\
[tool.some-linter]
option = true
"""


@pytest.fixture
def fixture_repo(tmp_path: Path) -> Path:
    """Build a repository with one compliant member and one deviation per sync rule."""
    (tmp_path / "pyproject.toml").write_text(ROOT_PYPROJECT)
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "fixture-root",
                "private": True,
                "workspaces": {"packages": ["!**/node_modules", "packages/**"]},
            },
            indent=2,
        )
        + "\n"
    )

    # alpha: declared member, but wrong requires-python, stale dev pin, no package.json.
    alpha = tmp_path / "packages" / "alpha"
    (alpha / "tests").mkdir(parents=True)
    (alpha / "pyproject.toml").write_text(ALPHA_PYPROJECT)

    # beta: undeclared member with a workspace dependency and stale turbo wiring.
    beta = tmp_path / "packages" / "beta"
    beta.mkdir(parents=True)
    (beta / "pyproject.toml").write_text(BETA_PYPROJECT)
    (beta / "package.json").write_text(
        json.dumps({"name": "@python/wrong-name", "version": "0.0.0-private"}, indent=2) + "\n"
    )

    # gamma: compliant manifest outside the yarn workspace globs.
    gamma = tmp_path / "outside" / "lib"
    gamma.mkdir(parents=True)
    (gamma / "pyproject.toml").write_text(GAMMA_PYPROJECT)

    # A tool-configuration-only manifest: unfixable finding.
    tool_only = tmp_path / "packages" / "toolcfg"
    tool_only.mkdir(parents=True)
    (tool_only / "pyproject.toml").write_text(TOOL_ONLY_PYPROJECT)

    # Manifests under pruned directories must be invisible.
    hidden = tmp_path / "node_modules" / "dep"
    hidden.mkdir(parents=True)
    (hidden / "pyproject.toml").write_text('[project]\nname = "hidden"\n')

    return tmp_path
