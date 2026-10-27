# Petrinaut optimizer core

The [Python package](./python/README.md) provides Optuna study logic shared by the optimizer service and the browser runtime.

The [TypeScript package](./typescript/package.json), `@local/petrinaut-optimizer-core`, packages the Python sources and runtime configuration for the browser bundle. Its build copies those files from `python/` without installing Python dependencies or building a wheel.
