# Petrinaut CLI

Internal JSON-lines CLI for Petrinaut simulations.

## Architecture docs

Architecture is declared next to the code it describes, via `@layerRoot` / `@role` on a folder’s primary file or `layer` / `role` in that folder’s `README.md` frontmatter. When you introduce a folder that is a new architectural unit, add a declaration.

Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`. See `libs/@hashintel/petrinaut/AGENTS.md` for the full vocabulary.
