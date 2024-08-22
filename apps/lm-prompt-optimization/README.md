# lm-prompt-optimization

Before you start install (or update) rye and run `rye sync`.

- Install: `curl -sSf https://rye.astral.sh/get | bash`
- Update: `rye self update`

Generated using `rye init --private --script --license AGPL-3.0 --build-system pdm --no-pin --min-py 3.11 lm-prompt-optimization`.

To generate libraries, simply remove the `--script` flag.

## Short rye introduction

`rye` is a new-ish package manager that is under the umbrella of [astro](https://astro.build) (the makers of ruff), it's a blazingly fast, written in Rust and natively supports workspaces. In the future, it will [merge](https://lucumr.pocoo.org/2024/2/15/rye-grows-with-uv/) with `uv` (another astro project), to become a sort of "cargo for python".

`rye` has been shown to be a lot more predictable then other package managers, such as `poetry` while not being as invasive as `conda`.

Link to rye: <https://rye.astral.sh>.

Before starting you will need to set `rye` to use `uv` for package resolution, this is set by default to `true`, but older installations might still use `false`, use `rye config --set-bool behaviour.use-uv=true`.

Commands in `rye` are very similar to `yarn` or other package managers, `rye add` for adding packages, `rye remove` to remove them, `rye sync` to synchronize the dependencies, `rye lock` to regenerate the lockfiles.

`pdm` has been chosen as the build-system, as it allows for local file dependencies more easily, this is done through adding `<package-name> @ file:///${PROJECT_ROOT}/<path from workspace root>` to the dependencies of a project.

You add new scripts simply by modifying the `projects.scripts` entry, be aware tho that any change to `project.script` will need a `rye sync`.

## Getting Started

This is a script project, meaning that you use scripts to interact with different functions that are defined in the `__init__.py` file, if you change any entry in the `pyproject.toml` files `[project.scripts]` you will need to call `rye sync` to update the scripts.

You can run scripts simply by using `rye run <name of script>`.

## Formatting and Linting

`ruff` is already included in `rye`, use `rye fmt` or `rye lint` respectively to either format or lint files.

Ruff has a native integration into VSCode (<https://github.com/astral-sh/ruff-vscode>), as well as IntelliJ based IDEs (<https://plugins.jetbrains.com/plugin/20574-ruff>) and LSP based editors (<https://github.com/astral-sh/ruff-lsp>).

The configuration is located in the workspace root, as the documentation states:

> In locating the "closest" pyproject.toml file for a given path, Ruff ignores any pyproject.toml files that lack a `[tool.ruff]` section.

Read more about extending the existing configuration at <https://docs.astral.sh/ruff/configuration/#config-file-discovery>.

To typecheck use `rye run typecheck` which will invoke mypy.
