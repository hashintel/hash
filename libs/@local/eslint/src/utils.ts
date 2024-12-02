import { Linter } from "eslint";
import { ESLintRules } from "eslint/rules";

export type ESConfig = Linter.Config<ESLintRules>;

export const defineConfig = (
  config: readonly Linter.Config[],
): readonly Linter.Config[] => config;
