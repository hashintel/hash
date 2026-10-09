# `petrinaut-optimizer-core`

The Optuna study logic behind Petrinaut optimization, as one pure-Python package (`petrinaut_optimizer_core`) with a single runtime dependency, Optuna. `apps/petrinaut-opt`, the FastAPI service, imports it: the service runs `study.optimize` on a worker thread and evaluates trials through the Petrinaut CLI.

The package is written to load under Pyodide as well, so it stays pure Python over Optuna: threads, the event loop, files and the network belong to the host. `pyodide_entry.py` holds the functions the browser runtime calls. `runtime-lock.json` pins the Pyodide distribution and the wheel versions it installs. A test asserts the Optuna pin equals the version the workspace's `uv.lock` installs.

`parse_description` validates the CLI's `optimization.describe` result, `create_study` builds the seeded study, and `suggest` maps parameters onto Optuna suggestions, so a study proposes the same values wherever the package runs. A TPE study draws a third of its requested trials at random before modelling the objective, at least 2 and at most Optuna's default of 10 (`tpe_startup_trials`). `run_study` is the ask/tell driver: it keeps up to `parallelism` trials in flight and continues a study it already ran, so a stopped or finished study can be asked for more trials on the same sampler history. `create_browser_study` keeps a study in a `StudyHandle`, `run_browser_study` runs segments of trials on it, and `release_browser_study` frees it.

## Development

The package is a member of the root uv workspace. Sync with `--all-packages`: ruff and basedpyright come from the root `dev` group, which a plain `uv sync` here removes.

```bash
uv sync --all-packages
uv run --all-packages pytest .
uv run --all-packages ruff check . && uv run --all-packages ruff format --check .
uv run --all-packages basedpyright
```

Or, from the repository root:

```bash
turbo run test:unit lint:ruff lint:types --filter petrinaut-optimizer-core
```

Keep syntax compatible with Python 3.10, even though the workspace runs 3.14.

### Running a study

The caller supplies the objective:

```python
import asyncio

from petrinaut_optimizer_core import create_study, parse_description, run_study

description = parse_description(
    {
        "direction": "maximize",
        "study": {"trials": 20, "sampler": "tpe", "seed": 42},
        "parameters": [
            {"identifier": "rate", "type": "float", "default": 0.5,
             "minimum": 0.1, "maximum": 2.0, "scale": "log"},
            {"identifier": "count", "type": "int", "default": 4,
             "minimum": 2, "maximum": 8, "step": 2, "scale": "linear"},
            {"identifier": "enabled", "type": "boolean", "default": True},
        ],
    }
)


async def evaluate(values):
    # Stand-in for a simulation run; return {"pruned": reason} to prune.
    return {"objective": values["rate"] * values["count"] + values["enabled"]}


study = create_study(description)
summary = asyncio.run(
    run_study(study, description, trials=description.trials,
              evaluate=evaluate, on_trial=print)
)
print(summary)
```

### Browser bundle

`@local/petrinaut-optimizer-core` (`../typescript`) creates a copy of `src/` and `runtime-lock.json`. Rebuild it after changing either:

```bash
turbo run build --filter @local/petrinaut-optimizer-core
```

The tests run `pyodide_entry.py` on CPython only, so code that breaks only under Pyodide surfaces in the browser.

### Bumping Optuna

After `uv lock`, update the versions in `runtime-lock.json` to match. Until you do, `tests/test_runtime_lock.py` fails.
