/**
 * Requires explanations beside literal severity settings in Oxlint configuration.
 *
 * Checks `rules` objects and `defineRules` arguments in files that import Oxlint or use its configuration filename. Tuple settings put the explanation beside the first element. Computed settings and inherited presets are not resolved.
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import {
  isOxlintConfiguration,
  ruleSettings,
} from "../lib/rule-configuration.js";

import type { ESTree, SourceCode } from "@oxlint/plugins";

const hasExplanation = (
  sourceCode: SourceCode,
  severity: ESTree.Node,
  end: number,
): boolean =>
  sourceCode.getAllComments().some((comment) => {
    if (
      comment.loc.start.line !== severity.loc.end.line ||
      comment.range[0] < severity.range[1] ||
      comment.range[0] >= end
    ) {
      return false;
    }

    const [firstLine] = comment.value.split("\n");
    return firstLine !== undefined && firstLine.trim().length > 0;
  });

export const requireRuleChangeComment = defineRule({
  createOnce: (context) => {
    let configuration = false;

    return {
      Program: (program): void => {
        configuration = isOxlintConfiguration(program, context.filename);
      },
      ObjectExpression: (node): void => {
        if (!configuration) {
          return;
        }

        for (const { severity, end } of ruleSettings(node)) {
          if (!hasExplanation(context.sourceCode, severity, end)) {
            context.report({ messageId: "explanation", node: severity });
          }
        }
      },
    };
  },
  meta: {
    messages: {
      explanation:
        "Explain this rule setting in a trailing comment on the severity's line. For an array setting, put the comment beside its first element.",
    },
    schema: [],
    type: "problem",
  },
});
