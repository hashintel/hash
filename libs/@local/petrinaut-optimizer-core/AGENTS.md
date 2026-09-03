# Petrinaut optimizer core

Pure-Python Optuna study logic shared by the optimizer service and the browser worker.

- Every module here runs under Pyodide as well as CPython: no threads, no asyncio loop ownership, no subprocesses, no file or network access, no pydantic, no OpenTelemetry, and no `pyodide` import (JavaScript values are unwrapped by duck-typing `to_py`).
- Keep the syntax compatible with Python 3.10; the service targets it.
- Run tests with `uv run pytest` from this directory; `uv run basedpyright` checks `src` in strict mode.
- When bumping Optuna, update `runtime-lock.json` too; the lock test fails otherwise.

Shipping conventions for the Petrinaut packages are in `libs/@hashintel/petrinaut/AGENTS.md`.

## Architecture docs

Architecture is declared next to the code it describes, via `@layerRoot` / `@role` in the package docstring of `src/petrinaut_optimizer_core/__init__.py`. Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`.
