/**
 * Requires lint suppressions to name exactly one rule and give a nonempty reason after `--`.
 *
 * Checks oxlint-disable and eslint-disable directives, including line-scoped forms. Enable directives only end suppressions and are not checked. Provides no autofix because the author must choose the rule and explain the exception.
 *
 * @example Incorrect
 * ```ts
 * // oxlint-disable-next-line no-console
 * console.log("Ready.");
 * ```
 *
 * @example Correct
 * ```ts
 * // oxlint-disable-next-line no-console -- This CLI writes its result to stdout.
 * console.log("Ready.");
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

export const requireSuppressionComment = defineRule({
  createOnce: (context) => ({
    "Program:exit": (): void => {
      const { directives } = context.sourceCode.getDisableDirectives();

      for (const directive of directives) {
        if (directive.type !== "enable") {
          const rules = directive.value
            .split(",")
            .map((rule) => rule.trim())
            .filter((rule) => rule.length > 0);

          if (rules.length === 0) {
            context.report({ messageId: "allRules", node: directive.node });
          } else if (rules.length > 1) {
            context.report({
              data: { rules: rules.join(", ") },
              messageId: "multipleRules",
              node: directive.node,
            });
          }

          if (directive.justification.trim().length === 0) {
            context.report({
              messageId: "justification",
              node: directive.node,
            });
          }
        }
      }
    },
  }),
  meta: {
    messages: {
      allRules:
        "Name the rule to disable; a directive without a rule disables every rule.",
      justification:
        'Explain why the rule is disabled after "--", e.g. "oxlint-disable-next-line rule -- reason".',
      multipleRules:
        "Disable one rule per directive, each with its own justification, instead of {{rules}}.",
    },
    type: "problem",
  },
});
