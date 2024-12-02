import { fixupConfigRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, ESConfig } from "../utils.js";

const flatCompat = new FlatCompat();

export interface Options {}

export const create = (options: Partial<Options>): readonly ESConfig[] => {
  return defineConfig([...fixupConfigRules(flatCompat.extends("airbnb"))]);
};
