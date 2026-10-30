/**
 * Requires a TODO comment to name the ticket that tracks its work, as `TODO(KEY-123): description`.
 *
 * Checks every line of a comment that starts with `TODO` in any case, after the `*` that a JSDoc comment puts at the start of its lines. A TODO later in a line is not checked. Provides no autofix because the author must name the ticket.
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
const lineStart = /^[\s*]*/u;

const isUnticketed = (line: string): boolean => {
  const text = line.replace(lineStart, "");

  return todo.test(text) && !ticketed.test(text);
};

export const requireTodoTicket = defineRule({
  createOnce: (context) => ({
    "Program:exit": (): void => {
      for (const comment of context.sourceCode.getAllComments()) {
        if (comment.value.split("\n").some(isUnticketed)) {
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
