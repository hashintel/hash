import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  { ignores: ["rollup.config.js"] },
];
