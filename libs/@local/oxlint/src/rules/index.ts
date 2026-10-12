import { definePlugin } from "@oxlint/plugins";

import { namingConventions } from "./naming-conventions.js";
import { noPropertyModifiers } from "./no-property-modifiers.js";
import { preferOptionsObject } from "./prefer-options-object.js";
import { requireRuleChangeComment } from "./require-rule-change-comment.js";
import { requireSafetyCommentForTypeAssertion } from "./require-safety-comment-for-type-assertion.js";
import { requireSuppressionComment } from "./require-suppression-comment.js";

// oxlint-disable-next-line import/no-default-export -- required by the plugin API
export default definePlugin({
  meta: {
    name: "hash",
  },
  rules: {
    "naming-conventions": namingConventions,
    "no-property-modifiers": noPropertyModifiers,
    "prefer-options-object": preferOptionsObject,
    "require-rule-change-comment": requireRuleChangeComment,
    "require-safety-comment-for-type-assertion":
      requireSafetyCommentForTypeAssertion,
    "require-suppression-comment": requireSuppressionComment,
  },
});
