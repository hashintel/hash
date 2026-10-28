/**
 * Requires a TODO comment to name the ticket that tracks its work, as `TODO(KEY-123): description`.
 *
 * Checks every comment whose text starts with `TODO` in any case, the position `no-warning-comments` checks for its own terms. A TODO later in a comment's text is not checked. Provides no autofix because the author must name the ticket.
 *
 * @example Incorrect
 * ```ts
 * // TODO: cache the resolved path.
 * ```
 *
 * @example Correct
 * ```ts
 * // TODO(BE-123): cache the resolved path.
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

const todo = /^todo\b/iu;
const ticketed = /^TODO\([A-Z]+-\d+\): \S/u;

export const requireTodoTicket = defineRule({
  createOnce: (context) => ({
    "Program:exit": (): void => {
      for (const comment of context.sourceCode.getAllComments()) {
        const text = comment.value.trimStart();

        if (todo.test(text) && !ticketed.test(text)) {
          context.report({ messageId: "ticket", node: comment });
        }
      }
    },
  }),
  meta: {
    messages: {
      ticket:
        'Name the ticket that tracks this work, as "TODO(KEY-123): description".',
    },
    schema: [],
    type: "problem",
  },
});
