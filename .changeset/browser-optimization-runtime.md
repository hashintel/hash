---
"@hashintel/petrinaut-core": patch
---

Add in-browser optimization that runs Optuna in a Pyodide worker, downloaded from jsDelivr and PyPI unless `pyodide.indexURL` says otherwise. The `./optimization` entry adds `parseOptimizationManifest`, `isUnknownOptimizationRunError` and `PETRINAUT_OPTIMIZATION_UNKNOWN_RUN_ERROR_CODE`, and the main entry adds `createReadableStore`.
