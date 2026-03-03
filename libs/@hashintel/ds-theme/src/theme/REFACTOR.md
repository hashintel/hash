# Refactor Notes

## Current situation

- Codegen scripts emit TypeScript into `src/theme/tokens/*`, `src/theme/colors/*`, and update barrel files.
- Hand-written tokens and generated tokens live side by side, which makes ownership unclear.
- Formatting churn: codegen output format differs from repo formatting.

## Goals

- Keep generated outputs version-controlled and formatted.
- Keep hand-written tokens easy to find and maintain.
- Avoid import churn for downstream consumers of the preset.

## Options to revisit

1) Move generated outputs to `src/theme/generated/` and keep hand-written tokens in `src/theme/`.
   - Keep `src/theme/tokens.ts` and `src/theme/colors.ts` as stable barrels that re-export from `generated/`.
2) Keep TS output in place but tag generated files with a standard header and format them during codegen.
   - Consider adding a formatter-only pass for `src/theme/generated/**` (if introduced).
3) Switch codegen outputs to JSON (or TS that only exports raw objects) and import+wrap in hand-written files.
   - This can reduce merge conflicts and keep Panda-specific code in one place.

## Open questions

- What are the intended consumption paths for Figma variables (design tokens vs. semantic tokens vs. product-specific tokens)?
- Should we split tokens by use-case (e.g., core/shared vs. product-specific) before deciding directory layout?
