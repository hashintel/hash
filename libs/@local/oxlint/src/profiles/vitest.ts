import type { Profile } from "./profile.js";
import type { DummyRuleMap } from "oxlint";

export interface VitestOptions {
  /** Whether the configuration also selects Effect, whose tests `@effect/vitest` declares. */
  readonly effect: boolean;
}

const effectTesters = ["it.effect", "it.live", "it.prop"].flatMap((tester) => [
  tester,
  `${tester}.skip`,
  `${tester}.only`,
  `${tester}.each`,
]);

const effectRules: DummyRuleMap = {
  "vitest/no-standalone-expect": [
    "deny", // @effect/vitest declares tests through `it.effect` and `it.live`, and `layer` hands its tests an `it` of their own.
    {
      additionalTestBlockFunctions: [
        "it",
        "it.effect.prop",
        "it.live.prop",
        ...effectTesters,
      ],
    },
  ],
  "vitest/require-hook": [
    "deny", // @effect/vitest's `layer` provides services to the tests it groups.
    { allowedFunctionCalls: ["layer"] },
  ],
};

export const vitest = ({ effect }: VitestOptions): Profile => ({
  plugins: ["vitest"],
  rules: {
    "vitest/consistent-test-it": ["deny", { withinDescribe: "test" }], // Use the same declaration name inside and outside describe blocks.
    "vitest/no-hooks": "allow", // Shared setup belongs in hooks, as required by vitest/require-hook.
    "vitest/no-importing-vitest-globals": "allow", // import Vitest APIs instead of relying on globals
    "vitest/no-restricted-vi-methods": [
      "deny", // Module mocks hide dependencies. Method spies remain available.
      {
        doMock: "Inject dependencies instead of replacing modules.",
        mock: "Inject dependencies instead of replacing modules.",
      },
    ],
    "vitest/require-test-timeout": "allow", // the default timeout is a good default for most tests
    "vitest/prefer-describe-function-title": "allow", // clashes with valid-title
    "vitest/prefer-to-be-falsy": "allow", // Strict boolean matchers distinguish false from falsy values.
    "vitest/prefer-to-be-truthy": "allow", // Strict boolean matchers distinguish true from truthy values.
    ...(effect ? effectRules : {}),
  },
  overrides: [
    {
      files: ["**/*.test-d.{ts,tsx}"],
      rules: {
        "vitest/prefer-expect-assertions": "allow", // type tests run through the compiler, not the runtime assertion counter.
        "hash/no-magic-numbers": "allow", // magic numbers are often used in test fixtures
        "max-lines-per-function": "allow", // tests are allowed to have more statements, because `describe` blocks are often used to group related tests
        "max-lines": "allow", // one test file covers one module, so it grows with that module's cases
        "no-restricted-imports": [
          "deny", // Vitest typechecks these files without running them, so a runtime assertion here never executes.
          {
            paths: [
              {
                name: "vitest",
                importNames: ["expect"],
                message:
                  "Vitest only typechecks *.test-d.ts files. Use expectTypeOf here, and move runtime assertions to the matching *.test.ts file.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["**/*.test.{ts,tsx,mts,cts}"],
      rules: {
        "hash/no-magic-numbers": "allow", // magic numbers are often used in test fixtures
        "max-lines-per-function": "allow", // tests are allowed to have more statements, because `describe` blocks are often used to group related tests
        "max-lines": "allow", // one test file covers one module, so it grows with that module's cases
      },
    },
  ],
});
