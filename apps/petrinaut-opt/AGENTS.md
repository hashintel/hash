# Petrinaut optimizer service

Python service running Optuna optimization studies over Petrinaut simulations.

- Depends on `@local/petrinaut-python` only; nothing in the service references `petrinaut-cli` directly.
- Experiment and optimization code stays pure: the host owns worker counts, threads, and other OS concerns.
- Run tests with `uv run pytest` from this directory.

Shipping conventions for the Petrinaut packages are in `libs/@hashintel/petrinaut/AGENTS.md`.

## Architecture docs

Architecture is declared next to the code it describes, via `@layerRoot` / `@role` on a folder's primary file or `layer` / `role` in that folder's `README.md` frontmatter. When you introduce a folder that is a new architectural unit, add a declaration.

Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`. See `libs/@hashintel/petrinaut/AGENTS.md` for the full vocabulary.
