---
"@hashintel/petrinaut-core": patch
---

Adds an in-browser optimization capability that runs the Optuna study in a Pyodide worker and evaluates trials through a host channel. A study that completed or was cancelled stays in the worker until it is released, so the connected capability can extend it with more trials on the same sampler history, and a run may keep up to four trials in flight at once. Pyodide and Optuna download from jsDelivr and PyPI by default; `pyodide.indexURL` overrides where the runtime loads from. The `./optimization` entry gains `parseOptimizationManifest`, `isUnknownOptimizationRunError` and `PETRINAUT_OPTIMIZATION_UNKNOWN_RUN_ERROR_CODE`, and the main entry gains `createReadableStore`.
