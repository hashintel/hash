# Petrinaut optimizer core

Pure-Python Optuna study logic for Petrinaut's in-browser optimizer. The browser runtime in `@hashintel/petrinaut-core` loads it under Pyodide; the CPython pytest suite is the package's own tests.

- Every module here must load under Pyodide as well as CPython: no threads, no asyncio loop ownership, no subprocesses, no file or network access, no pydantic, no OpenTelemetry, and no `pyodide` import (JavaScript values are unwrapped by duck-typing `to_py`).
- Follow the workspace's Python version requirement. `runtime-lock.json` pins the browser runtime version.
- Run tests with `uv run pytest tests` from this directory. `uv run ty check src` checks the production sources.
- When bumping Optuna, update `runtime-lock.json` too; the lock test fails otherwise.

Shipping conventions for the Petrinaut packages are in `libs/@hashintel/petrinaut/AGENTS.md`.

## Architecture docs

Architecture is declared next to the code it describes, via `@layerRoot` / `@role` in the package docstring of `src/petrinaut_optimizer_core/__init__.py`. Verify with `yarn workspace @apps/petrinaut-docs lint:arch-docs`.
