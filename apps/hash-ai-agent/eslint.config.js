import { createBase, defineConfig } from "@local/eslint/deprecated";

export default [
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
