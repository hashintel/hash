# @hashintel/ds-icons - Agent Context

## Purpose

`@hashintel/ds-icons` is the published HASH icon set: animated SVG icons with a motion layer.

It owns:

- the icon components, geometry and motion in `src/hash-icon.tsx` and `src/hash-icon/**`
- the icon catalog and studies in `src/catalog.ts`
- the Panda preset with the icon keyframes in `src/panda-preset.ts`

## Conventions

- Function components only. React Compiler is enabled in the build, so do not add `useMemo`, `useCallback` or `React.memo` without a reason the compiler cannot handle.
- `use()` for context consumption (React 19), not `useContext()`.
- Styles via Panda CSS `css()` from `@hashintel/ds-helpers/css`. The package ships `dist/panda.buildinfo.json` (`yarn build:buildinfo`) and `./panda-preset`, not a stylesheet. Every keyframe an icon references must exist in `src/panda-preset.ts`.
- No runtime dependency on `@hashintel/ds-components`, `@hashintel/petrinaut` or any `@local/*` package. This is a published package. `@hashintel/ds-components` is a devDependency only, for the test that checks `hashIconPack` maps every design-system icon name.
- Prefix unused parameters with `_`.

## Commands

```sh
yarn build        # Library, types, preset and Panda build info
yarn lint:eslint  # Lint with oxlint
yarn lint:tsc     # Type check with tsgo
yarn test:unit    # Unit tests (vitest)
```
