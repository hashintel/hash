import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "@typescript-eslint/no-redeclare": "off",
      "unicorn/filename-case": "off",
      "func-names": "off",
      "canonical/filename-no-index": "off",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
    },
  },
];
