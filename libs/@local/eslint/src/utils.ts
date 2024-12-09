import type { Linter } from "eslint";
import type { ESLintRules } from "eslint/rules";

export type ESConfig = Linter.Config<ESLintRules>;

export const defineConfig = <R extends Linter.RulesRecord>(
  config: readonly Linter.Config<R>[],
): readonly Linter.Config<R>[] => config;
