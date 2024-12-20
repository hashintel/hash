import type { ESLintRules } from "eslint/rules";

import { defineConfig as defineConfig$ } from "../utils.js";

export { create as createBase } from "./base.js";
export { create as createBlock } from "./block.js";
export { disableRules } from "./disable.js";

export const defineConfig = defineConfig$<ESLintRules>;
