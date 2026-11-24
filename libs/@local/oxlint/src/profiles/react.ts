import type { Profile } from "./profile.js";

export const react: Profile = {
  plugins: ["react", "react-perf", "jsx-a11y"],
  rules: {
    "react/forbid-component-props": "allow", // A component's props type decides whether it takes `className` and `style`.
    "react/function-component-definition": [
      "deny", // Named declarations distinguish components from helper arrows.
      {
        namedComponents: "function-declaration",
        unnamedComponents: "function-expression",
      },
    ],
    "react/jsx-filename-extension": [
      "deny", // JSX belongs in TypeScript modules.
      { extensions: [".tsx"] },
    ],
    "react/jsx-max-depth": [
      "deny", // Deep JSX trees hide component structure.
      { max: 6 },
    ],
    "react/jsx-props-no-spreading": [
      "deny", // A spread onto a DOM element can pass props the element does not know. A component's props type checks a spread onto it.
      { custom: "ignore", html: "enforce" },
    ],
    "react/react-in-jsx-scope": "allow", // The automatic JSX runtime does not require a React import.
  },
  overrides: [
    {
      files: ["**/*.tsx"],
      rules: {
        "func-style": [
          "deny", // Allow component declarations in TSX, accepting helper declarations too.
          "declaration",
          { allowArrowFunctions: true },
        ],
        "typescript/strict-boolean-expressions": "allow", // JSX commonly uses truthiness for conditional rendering.
      },
    },
  ],
};
