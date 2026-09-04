# `@local/petrinaut-optimizer-core`

The Optuna study logic behind Petrinaut optimization, as one pure-Python
package (`petrinaut_optimizer_core`) with a single runtime dependency, Optuna.
Two hosts import it:

- `apps/petrinaut-opt`, the FastAPI service, which runs `study.optimize` on a
  worker thread and evaluates trials through the Petrinaut CLI.
- `@hashintel/petrinaut-core`'s browser optimization runtime, which loads the
  same source files into Pyodide in a Web Worker and drives the ask/tell loop,
  evaluating each trial through a channel the host supplies.

Both parse the CLI's `optimization.describe` result with `parse_description`,
build the seeded study with `create_study`, and map parameters onto Optuna
suggestions with `suggest`, so a study proposes the same values wherever it
runs. `run_study` is the ask/tell driver: it keeps up to `parallelism` trials
in flight and continues a study it already ran, so a stopped or finished study
can be asked for more trials on the same sampler history. The worker keeps a
study in the `StudyHandle` that `create_browser_study` returns, runs segments
of trials on it with `run_browser_study`, and frees it with
`release_browser_study`.

`runtime-lock.json` pins the Pyodide distribution and the wheel versions the
browser installs. A test asserts the Optuna pin equals the version this
package's `uv.lock` installs, so the browser and the service cannot drift
apart silently.

## Development

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run basedpyright
```
