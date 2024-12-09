import { Array, pipe, Record } from "effect";

import type { ESConfig } from "../utils.js";

export const disableRules = (rules: readonly string[]): readonly ESConfig[] =>
  process.env.CHECK_TEMPORARILY_DISABLED_RULES === "true"
    ? []
    : pipe(
        rules,
        Array.map((rule) => [rule, "off"] as const),
        Record.fromEntries,
        (record) => [{ rules: record }],
      );
