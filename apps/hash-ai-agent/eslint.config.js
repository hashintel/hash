import { createBase, defineConfig } from "@local/eslint/deprecated";

export default [
  {
    ignores: ["_temp/**", ".mastra/**", "node_modules/**"],
  },
  ...createBase(import.meta.dirname),
  ...defineConfig([
    {
      rules: {
        /**
         * @todo we should have separate browser/node configs
         */
        "react-hooks/rules-of-hooks": "off",
      },
    },
  ]),
];
