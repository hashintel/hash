# Refactor Notes

## Current situation

- `ds-components` owns both the preset sources and the codegen scripts now.
- Codegen scripts emit TypeScript into `src/preset/theme/**/*.gen.ts` and update the preset barrel files.
- Hand-written tokens and generated tokens still live side by side under `src/preset/theme/`, which makes ownership inside the preset harder to read.
- Formatting churn: codegen output format differs from repo formatting.

## Goals

- Keep generated outputs version-controlled and formatted.
- Keep hand-written tokens easy to find and maintain.
- Avoid import churn for downstream consumers of the preset.

## Options to revisit

1) Move generated outputs to `src/preset/theme/generated/` and keep hand-written preset sources in `src/preset/theme/`.
   - Keep stable preset barrels in `src/preset/theme/` that re-export from `generated/`.
2) Keep TS output in place but tag generated files with a standard header and format them during codegen.
   - Consider adding a formatter-only pass for `src/preset/theme/generated/**` (if introduced).
3) Switch codegen outputs to JSON (or TS that only exports raw objects) and import+wrap in hand-written files.
   - This can reduce merge conflicts and keep Panda-specific code in one place.

## Open questions

- What are the intended consumption paths for Figma variables (design tokens vs. semantic tokens vs. product-specific tokens)?
- Should we split tokens by use-case (e.g., core/shared vs. product-specific) before deciding directory layout?
