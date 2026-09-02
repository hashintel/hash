# Petrinaut core

Headless Petrinaut APIs (`@hashintel/petrinaut-core`). Published npm package.

## User-facing docs

The Petrinaut user guide lives at `libs/@hashintel/petrinaut/docs/*.md` and is the source of truth for end-user behaviour. The in-app AI assistant reads these pages at runtime via the `readPetrinautDoc` tool, so stale docs lead directly to wrong advice in the product.

When you change behaviour that the user guide describes, update those pages in the same change. New doc pages must be registered in `petrinautDocNames` and `petrinautDocSummaries` in `src/ai.ts`, and given a `?raw` import in `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/petrinaut-docs-content.ts`. The tests in `src/ai.test.ts` and `petrinaut-docs-content.test.ts` enforce that every enum value has a summary and a content entry.

Keep the docs end-user-focused. If a change ships without doc updates, call that out in your summary.

## Architecture docs

Architecture is declared next to the code it describes, via `@layerRoot` / `@role` on a folder’s primary file or `layer` / `role` in that folder’s `README.md` frontmatter. When you introduce a folder that is a new architectural unit, add a declaration.

Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`. See `libs/@hashintel/petrinaut/AGENTS.md` for the full vocabulary.
