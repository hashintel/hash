# Petrinaut optimizer core

The [Python package](./python/README.md) provides the Optuna study logic for Petrinaut's in-browser optimizer, which runs it under Pyodide.

The [TypeScript package](./typescript/package.json), `@local/petrinaut-optimizer-core`, packages the Python sources and runtime configuration for the browser bundle. Its build copies those files from `python/` without installing Python dependencies or building a wheel.
