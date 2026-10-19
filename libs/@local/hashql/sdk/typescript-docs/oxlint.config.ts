import { defineConfig } from "@local/oxlint";

export default defineConfig({
  runtime: "node",
  frameworks: ["react", "next", "effect", "vitest"],
  ignorePatterns: [".next/**", ".source/**", "next-env.d.ts"],
  overrides: [
    {
      files: ["src/cli.ts"],
      rules: {
        "vitest/require-hook": "allow", // The CLI entry point runs its command when imported; it is not a test file.
      },
    },
    {
      files: ["src/**/*.ts"],
      rules: {
        "unicorn/filename-case": [
          "deny", // filename casing follows Effect style
          { cases: { pascalCase: true, kebabCase: true } },
        ],
      },
    },
    {
      files: ["*.config.mjs", "source.config.ts"],
      rules: {
        "effecttsgo/node-builtin-import": "allow", // Next.js and Fumadocs load these modules outside any Effect runtime that could provide FileSystem or Path.
        "effecttsgo/schema-sync": "allow", // Next.js and Fumadocs evaluate a configuration module synchronously, and a malformed input should fail its load.
      },
    },
    {
      files: ["app/**/*.tsx", "*.config.mjs"],
      rules: {
        "import/no-default-export": "allow", // Next.js and PostCSS discover default exports.
      },
    },
    {
      files: ["app/**/*.tsx", "components/**/*.tsx"],
      rules: {
        "react/react-in-jsx-scope": "allow", // Next.js uses the automatic JSX runtime.
        "react/jsx-filename-extension": ["deny", { extensions: [".tsx"] }], // This TypeScript app uses TSX.
        "react/only-export-components": "allow", // Next.js discovers metadata and static parameter exports.
        "oxc/no-async-await": "allow", // Server components await route parameters and syntax highlighting.
        "effecttsgo/async-function": "allow", // Next.js calls server components and metadata functions as async functions.
      },
    },
    {
      files: ["components/**/*.tsx"],
      rules: {
        "react/function-component-definition": [
          "deny", // Match the repository's function-expression style.
          { namedComponents: "arrow-function" },
        ],
      },
    },
    {
      files: ["components/reference-trigger.tsx"],
      rules: {
        "react/jsx-props-no-spreading": "allow", // Forward Base UI's trigger events, accessibility attributes and children.
        "react-perf/jsx-no-jsx-as-prop": "allow", // Base UI's public render prop accepts the replacement element.
        "jsx-a11y/no-redundant-roles": "allow", // The link role overrides Base UI's non-native button role.
      },
    },
    {
      files: ["components/index-entry.tsx"],
      rules: {
        "react-perf/jsx-no-jsx-as-prop": "allow", // Fumadocs' Card takes its title as a node, which carries the count beside the name. These server components render once.
      },
    },
    {
      files: ["lib/reference-links.ts"],
      rules: {
        "no-underscore-dangle": ["deny", { allow: ["__raw"] }], // Shiki exposes a code block's meta string under this public field name.
      },
    },
    {
      files: ["app/layout.tsx"],
      rules: {
        "import/no-unassigned-import": "allow", // The root layout loads global CSS.
      },
    },
  ],
});
