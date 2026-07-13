# `hash-python-example`

Minimal example package demonstrating the Python monorepo infrastructure ([H-6664](https://linear.app/hash/issue/H-6664/create-python-monorepo-infrastructure)).

> [!NOTE]
> **Temporary scaffolding.** This package (and [`python-example-two`](../python-example-two)) exists only to validate the Python infrastructure — turbo wiring, shared tool config, cross-package workspace dependencies, and the CI prune path. Delete both once the first real Python package (e.g. `petrinaut-opt`) joins the workspace.

Python packages in this repository are members of the [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/) defined in the root `pyproject.toml`, which centralizes the shared tool configuration (`ruff`, `basedpyright`, `pytest`) and the `dev` dependency group. A single `uv.lock` at the repository root pins the whole workspace.

Each Python package also carries a `package.json` whose scripts wrap `uv`, so `turbo run lint:ruff lint:basedpyright test:unit` picks Python packages up exactly like any other workspace package:

```sh
turbo run lint:ruff lint:basedpyright test:unit --filter '@local/python-example'
```
