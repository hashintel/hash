# Shared lint configuration

Strict, type-aware Oxlint configuration for TypeScript packages, intended to become the repository default. Package-specific exceptions override the shared rules. Current tuning covers vanilla TypeScript, Effect and Vitest consumers. React and Next selections remain provisional. The policy will change as more packages migrate.

```ts
import { defineConfig } from "@local/oxlint";

export default defineConfig({
  runtime: "node",
  frameworks: ["vitest", "effect"],
  ignorePatterns: ["generated/**"],
  rules: {
    "eslint/no-console": "allow", // This CLI writes results to stdout.
  },
});
```

Build the package before importing it. `defineConfig` accepts every native Oxlint configuration field alongside a required `runtime` of `node` or `browser`. Its optional `frameworks` array selects `react`, `next`, `vitest` or `effect`.

The shared defaults precede the supplied `extends` entries, and the package's own fields take precedence. Oxlint handles rules, categories, plugins, options and ordered overrides. The helper resolves the fields Oxlint does not inherit: `env` and `globals` merge by name, `settings` merges by plugin name, and `ignorePatterns` concatenates in inheritance order. A later plugin settings value replaces that plugin's earlier value as a whole. Nested objects and arrays are not deep-merged. Cyclic `extends` references throw. Relative paths retain Oxlint's configuration-directory semantics.

The React and Next selections enable their native plugins. The React profile permits truthiness checks in `.tsx` files for conditional rendering, while `.ts` files retain `strict-boolean-expressions`. This applies to the whole TSX file, not only JSX. The profile reports a prop spread onto a DOM element and leaves a spread onto a component to that component's props type. A file that spreads onto DOM elements on purpose disables `react/jsx-props-no-spreading` at its top. Next also ignores its generated `.next/**` output and `next-env.d.ts`. Vitest adds test rules and file overrides for runtime tests (`*.test.{ts,tsx,mts,cts}`) and type tests (`*.test-d.{ts,tsx}`). Effect extends the strict native Effect preset and allows its namespace imports and functional composition conventions.

`additionalRestrictedTypes` adds messages for restricted types without replacing the built-in entries for `object`, `unknown` and `Function`. An attempt to replace one of those entries throws. `ignorePatterns` passes the package's exclusion globs to Oxlint.

## Repository rules

The `hash` plugin enforces naming conventions, including mapped type parameters. Its naming fixes update references and avoid name collisions. A module-level `const` may use UPPER_CASE, as in `MAX_RETRIES`. This allowance covers neither a function nor a destructured name. Other rules cover JavaScript visibility, options-object parameters and unnamed numbers. Type assertions and individual lint suppressions require explanations, and a TODO comment names its ticket as `TODO(KEY-123): description`.

Use `allow`, `warn` or `deny` for rule severities. The default `hash/prefer-rust-severities` rule checks literal settings and fixes equivalent ESLint aliases:

| Alias        | Replacement |
| ------------ | ----------- |
| `off`, `0`   | `allow`     |
| `1`          | `warn`      |
| `error`, `2` | `deny`      |

The fix leaves rule options and comments unchanged. Other settings, such as `reportUnusedDisableDirectives: "error"`, keep their own vocabulary.

The default `hash/require-rule-change-comment` rule requires an inline explanation beside a literal severity setting. For tuple settings, put the comment beside the first element:

```ts
"no-duplicate-imports": [
  "deny", // Keep type-only dependencies distinct from runtime imports.
  { allowSeparateTypeImports: true },
],
```

The check recognizes literal `rules` objects, `rules` variable initializers and `defineRules` calls in Oxlint configuration modules. Computed settings and inherited presets remain outside its analysis. An explanation covers the complete setting, including options, without requiring a comparison with upstream defaults.

A comment records an author's justification. These rules check for an explanation. A reviewer must judge whether it supports the assertion or exception.

### Readable ternary branches

`hash/no-complex-ternary` replaces the blanket `no-ternary` ban. Choosing between values can read more directly beside the value's consumer. Choosing between operations hides conditional work inside an expression, even when the expression fits on one line. Use `if`/`else` for those branches. Inline functions embed another body for the reader to follow, so the rule rejects both arrow and non-arrow functions. Select named callbacks instead.

Accepted examples:

```tsx
const options = enabled ? { [key]: value } : {};
const formatter = detailed
  ? new DetailedFormatter(locale)
  : new BriefFormatter(locale);
const label = enabled ? text`Enabled: ${name}` : text`Disabled`;
const view = enabled ? <Active /> : <Inactive />;
const callback = enabled ? refresh : fallback;
const direction = ascending ? 1 : -1;
```

The rule checks both branches, not the condition. It accepts literals, negative numbers, references, object and array construction, member access, constructors and templates. Computed keys, spreads, constructor arguments and template interpolations undergo the same check. JSX remains opaque. Constructors, tags and getters may execute code, so this policy does not prove that an expression is pure.

Rejected examples:

```ts
const options = enabled ? { value: compute() } : {};
const formatter = detailed ? new Formatter(loadLocale()) : fallback;
const callback = enabled ? () => refresh() : fallback;
```

The first two diagnostics highlight `compute()` and `loadLocale()`, respectively, and explain that a call hides conditional work. The third highlights the arrow function and suggests selecting a callback by reference. Neither example marks the whole ternary as merely “complex”. The rule reports independent problems in both branches: `{ first: loadFirst(), second: loadSecond() }` receives two findings. It stops inspecting inside a rejected expression, so `outer(inner())` receives one finding. A nested ternary inside accepted JSX still receives its own check.

Calls, mutations, `await`, `yield`, `import()` expressions and further conditional evaluation require explicit control flow. The rule also rejects binary, logical and unary expressions rather than judging their complexity by length. A negative number is the exception: JavaScript has no negative literals, so `-1` parses as negation of `1`. It offers no autofix: turning a value expression into statements requires choosing where the result lives, and moving a condition inside a callback can change when it runs.

### Magic numbers

`hash/no-magic-numbers` replaces the native `no-magic-numbers` rule. A number needs a name unless its position supplies one:

- a `const` initializer
- a default value
- an object property or a class field
- an enum member
- a JSX expression
- a literal type in a type alias, or a type index
- an assignment to a member
- an argument of `parseInt`

The integers from -2 to 2, as numbers and as bigints, need no name anywhere. Arithmetic over number literals counts as one number, so a constant can show the arithmetic behind its value:

```ts
const SECONDS_PER_DAY = 60 * 60 * 24;
const MEBIBYTE = 2 ** 20;
```

In `price * 1.2` the operand `price` is not a literal, which leaves `1.2` needing a name of its own. The rule reads literals alone and never resolves a name, since a constant imported from another module has no value a lint plugin can read.

## Preparation and checks

The Effect rules require a patched Oxlint binary. From the repository root, run:

```sh
yarn prepare:oxlint
```

This patches Oxlint without replacing TypeScript or adding an install hook. The Turbo build task runs preparation without caching it: build artifacts cannot restore changes inside `node_modules`.

Run the package checks with:

```sh
yarn workspace @local/oxlint build
yarn workspace @local/oxlint lint:tsc
yarn workspace @local/oxlint lint:oxlint
yarn workspace @local/oxlint lint:format
yarn workspace @local/oxlint test:unit
yarn workspace @local/oxlint test:integration
```

Packages expose a `lint:oxlint` task alongside any existing `lint:eslint` task. The root Turbo task and lint workflow run it for affected packages.
