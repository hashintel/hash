/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  // this is the highest config lower ones will automatically extend
  parser: "@typescript-eslint/parser",
  plugins: [
    "@typescript-eslint",
    "canonical",
    "jest",
    "react-hooks",
    "simple-import-sort",
    "unicorn",
  ],
  extends: [
    "airbnb",
    "prettier",
    // mutes eslint rules conflicting w/ prettier (requires eslint-config-prettier)
  ],
  globals: {
    NodeJS: true,
    FixMeLater: "readonly",
    globalThis: "readonly",
  },
  env: {
    browser: true,
    node: true,
  },
  reportUnusedDisableDirectives: true,
  rules: {
    "canonical/filename-no-index": "error",
    // overridden airbnb rules (if you wish to add to this list, please outline your reasoning here: https://www.notion.so/hashintel/HASH-dev-eslint-configuration-60c52c127d13478fbce6bb5579a6b7be)
    "no-undef-init": "off",
    "no-underscore-dangle": "off",
    "no-nested-ternary": "off",
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "TSTypeReference[typeName.name=/^(Plugin|PluginKey)$/]:not([typeParameters])",
        message: "Please provide a generic to avoid implicit `any`",
      },
      {
        selector:
          "TSTypeReference[typeName.name=/^(Plugin|PluginKey)$/][typeParameters.params.0.type=TSAnyKeyword]",
        message: "Please replace `any` with a specific type",
      },
      {
        selector:
          "NewExpression[callee.name=/^(Plugin|PluginKey)$/]:not([typeParameters])",
        message: "Please provide a generic to avoid implicit `any`",
      },
      {
        selector:
          "NewExpression[callee.name=/^(Plugin|PluginKey)$/][typeParameters.params.0.type=TSAnyKeyword]",
        message: "Please replace `any` with a specific type",
      },
    ],
    camelcase: "off",
    "default-param-last": "off", // using @typescript-eslint/default-param-last instead
    "import/no-cycle": "error",
    "import/prefer-default-export": "off",
    "no-await-in-loop": "off",
    "no-console": "error",
    "no-dupe-class-members": "off",
    "import/no-unresolved": [
      2,
      {
        // graph uses 'exports' field in package.json https://github.com/import-js/eslint-plugin-import/issues/1810
        ignore: [
          "^@blockprotocol/graph",
          "^@blockprotocol/hook",
          "^@blockprotocol/type-system",
          "^@hashintel",
          "^@local",
        ],
      },
    ],
    "react/prop-types": "off",
    // because we are using typescript this is redundant
    "jsx-a11y/anchor-is-valid": "off",
    // because we use next.js empty anchor tags should be used when using the Link component
    "react/jsx-filename-extension": [
      2,
      {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    ],
    "react/jsx-props-no-spreading": "off",
    "no-void": [
      "error",
      {
        allowAsStatement: true,
      },
    ],
    "no-continue": "off",
    "react/react-in-jsx-scope": "off",
    "no-return-await": "off",
    "max-classes-per-file": "off",
    "lines-between-class-members": [
      "error",
      "always",
      {
        exceptAfterSingleLine: true,
      },
    ],
    "consistent-return": "off",
    "default-case": "off",
    "class-methods-use-this": "off",
    "react/no-unescapted-entities": "off",
    "jsx-a11y/no-autofocus": "off",
    "no-plusplus": "off",
    "prefer-destructuring": "off",
    "no-else-return": "off",
    "arrow-body-style": "off",
    "react/no-unescaped-entities": "off",
    // Other rule changes
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": [
      "error",
      {
        additionalHooks: "^(useModal|useUserGatedEffect)$",
      },
    ],
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "arrow-function",
        unnamedComponents: "arrow-function",
      },
    ],
    "react/jsx-key": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/self-closing-comp": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react",
            importNames: ["FC", "VFC", "VoidFunctionComponent"],
            message: "Please use FunctionComponent instead",
          },
          {
            name: "@testing-library/react",
            importNames: ["render"],
            message: "Please use ./src/tests/testUtils.tsx#render instead",
          },
          {
            name: "@mui/material",
            importNames: ["Link"],
            message:
              "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "@mui/material/Link",
            message:
              "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "next",
            importNames: ["Link"],
            message:
              "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "next/link",
            message:
              "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "@mui/material",
            importNames: ["Button"],
            message:
              "Please use the custom wrapper component in src/component instead.",
          },
          {
            name: "@mui/material/Button",
            importNames: ["default"],
            message:
              "Please use the custom src/components/Button component instead.",
          },
        ],
      },
    ],
    "react/require-default-props": "off",
    "no-shadow": "off",
    "@typescript-eslint/default-param-last": "error",
    // see https://github.com/typescript-eslint/typescript-eslint/issues/2483
    "@typescript-eslint/no-shadow": "error",
    "no-use-before-define": "off",
    "@typescript-eslint/no-use-before-define": ["error"],
    "no-redeclare": "off",
    "@typescript-eslint/no-redeclare": ["error"],

    eqeqeq: [
      "error",
      "always",
      {
        null: "ignore",
      },
    ],
    "id-length": [
      "error",
      {
        min: 2,
        exceptions: ["_", "x", "y", "z", "a", "b", "i"],
        properties: "never",
      },
    ],
    "no-unused-expressions": "error",
    curly: ["error", "all"],
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        js: "never",
        jsx: "never",
        ts: "never",
        tsx: "never",
      },
    ],
    "no-useless-constructor": "off",
    "@typescript-eslint/no-useless-constructor": ["error"],
    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": "allow-with-description",
        minimumDescriptionLength: 10,
      },
    ],
    "no-empty-function": "off",
    "no-param-reassign": [
      "error",
      {
        props: true,
        ignorePropertyModificationsForRegex: ["^draft"],
        ignorePropertyModificationsFor: [
          "acc",
          "accumulator",
          "e",
          "ctx",
          "context",
          "req",
          "request",
          "res",
          "response",
          "$scope",
          "staticContext",
        ],
      },
    ],
    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": "error",
    "unicorn/filename-case": "error",
    "unicorn/import-style": [
      "error",
      {
        styles: {
          react: { named: true },
          "react-dom": { named: true },
        },
      },
    ],
    "unicorn/no-array-for-each": "error",
    "unicorn/prefer-node-protocol": "error",
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
  overrides: [
    {
      files: ["**/*.{c,m,}js"],
      parser: "@babel/eslint-parser", // disables typescript rules
      parserOptions: {
        requireConfigFile: false,
        extraFileExtensions: [".cjs"],
        babelOptions: {
          presets: ["@babel/preset-react"], // allows jsx
        },
      },
    },
    {
      files: [
        "**/tests/**",
        "**/__mocks__/**",
        "**/testUtils/**",
        "*.test.{j,t}s{x,}",
        "jest.setup.ts",
      ],
      env: {
        "jest/globals": true,
        node: true,
      },
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
      },
    },
    {
      files: [".storybook/*", "**/*.stories.{j,t}s{x,}"],
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
      },
    },
    {
      files: ["*.config.{c,m,}{j,t}s", "*.d.ts", "*rc.{c,m,}js"],
      rules: {
        "global-require": "off",
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
      },
    },
    {
      files: ["*.ts", "*.tsx"],
      extends: [
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
      ],
      rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/prefer-nullish-coalescing": ["error"],
        "@typescript-eslint/no-meaningless-void-operator": "error",
        "@typescript-eslint/no-misused-promises": [
          "error", // https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/no-misused-promises.md#checksvoidreturn
          { checksVoidReturn: { attributes: false, properties: false } },
        ],
        "no-constant-condition": "off", // replaced by @typescript-eslint/no-unnecessary-condition
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            args: "all", // check all args, not just those after-used
            argsIgnorePattern: "^_+",
            varsIgnorePattern: "^_+",
          },
        ],
      },
    },
    {
      files: ["**/scripts/**"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
