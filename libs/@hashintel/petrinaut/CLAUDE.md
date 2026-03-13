# Petrinaut

Visual editor for Stochastic Dynamic Colored Petri Nets (SDCPN). Published npm package (`@hashintel/petrinaut`).

## Stack

- React 19 with React Compiler (babel-plugin-react-compiler)
- TypeScript (type-checked with `tsgo`)
- Vite 8 + Rolldown (library build + demo site)
- Panda CSS for styling
- oxlint for linting
- vitest for testing

## React Compiler

React Compiler is enabled — it automatically memoizes components and hooks.

**Do not use `useMemo`, `useCallback`, or `React.memo` unless there is a specific reason the compiler cannot handle it.** The compiler makes manual memoization unnecessary in the vast majority of cases.

When code is genuinely incompatible (e.g. writing to refs during render), opt out with:

```ts
function useMyHook() {
  "use no memo"; // <reason why>
  // ...
}
```

The compiler runs with `panicThreshold: "CRITICAL_ERRORS"` — the build fails if it encounters critical errors not opted out via `"use no memo"`.

## Commands

```sh
yarn dev              # Dev server (demo site)
yarn build            # Library build
yarn lint:eslint      # Lint with oxlint
yarn lint:tsc         # Type check with tsgo
yarn test:unit        # Unit tests (vitest)
```

## Conventions

- Function components only (no class components except error boundaries)
- `use()` for context consumption (React 19), not `useContext()`
- Styles via Panda CSS (`css()`, `cva()` from `@hashintel/ds-helpers/css`)
- No `@local/*` imports — this is a published package
- Prefix unused parameters with `_`
