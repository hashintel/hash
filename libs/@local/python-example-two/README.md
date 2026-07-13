# `hash-python-example-two`

Second example package for the Python monorepo infrastructure ([H-6664](https://linear.app/hash/issue/H-6664/create-python-monorepo-infrastructure)).

> [!NOTE]
> **Temporary scaffolding.** This package (and [`python-example`](../python-example)) exists only to validate the Python infrastructure and should be deleted once the first real Python package (e.g. `petrinaut-opt`) joins the workspace.

It keeps two things exercised on every CI run:

- **Cross-package workspace dependencies:** this package depends on [`hash-python-example`](../python-example) via `[tool.uv.sources] hash-python-example = { workspace = true }` and imports from it in both the module and its tests.
- **The prune path:** pruned CI checkouts must retain *all* uv workspace members (see `.github/actions/prune-repository/prune.py`), which only shows up with more than one Python package in the workspace.

See [`python-example`](../python-example) for the general layout conventions.
