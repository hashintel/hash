import { createConfig, defineConfig } from "@local/oxlint";

export default defineConfig({
  extends: [createConfig({ runtime: "node", frameworks: ["react", "next"] })],
  ignorePatterns: [".next/**", ".source/**", "next-env.d.ts"],
  overrides: [
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
      files: ["components/reference.tsx"],
      rules: {
        "react/no-multi-comp": "allow", // The reference table shares plain and highlighted type renderers.
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
      files: ["lib/reference-twoslash.ts"],
      rules: {
        "no-underscore-dangle": ["deny", { allow: ["__raw"] }], // Shiki exposes fence metadata under this public field name.
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
