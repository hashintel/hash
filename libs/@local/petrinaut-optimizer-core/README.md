# `@local/petrinaut-optimizer-core`

The Optuna study logic behind Petrinaut optimization, as one pure-Python
package (`petrinaut_optimizer_core`) with a single runtime dependency, Optuna.
`apps/petrinaut-opt`, the FastAPI service, imports it: the service runs
`study.optimize` on a worker thread and evaluates trials through the Petrinaut
CLI.

The package is written to load under Pyodide as well, so it stays pure Python
over Optuna: threads, the event loop, files and the network belong to the host.
The browser runtime that will load it there is FE-1582. `pyodide_entry.py` holds
the functions that runtime calls, and `runtime-lock.json` pins the Pyodide
distribution and the wheel versions it installs. A test asserts the Optuna pin
equals the version this package's `uv.lock` installs.

`parse_description` validates the CLI's `optimization.describe` result,
`create_study` builds the seeded study, and `suggest` maps parameters onto
Optuna suggestions, so a study proposes the same values wherever the package
runs. A TPE study draws a third of its requested trials at random before
modelling the objective, at least 2 and at most Optuna's default of 10
(`tpe_startup_trials`). `run_study` is the ask/tell driver: it keeps up to
`parallelism` trials in flight and continues a study it already ran, so a
stopped or finished study can be asked for more trials on the same sampler
history. `create_browser_study` keeps a study in a `StudyHandle`,
`run_browser_study` runs segments of trials on it, and `release_browser_study`
frees it.

## Development

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run basedpyright
```
