import { RuleTester } from "oxlint/plugins-dev";

import { requireTodoTicket } from "./require-todo-ticket.js";

const tester = new RuleTester();

const ticket = { messageId: "ticket" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("require-todo-ticket", requireTodoTicket, {
  invalid: [
    { code: "// TODO: cache the resolved path", errors: [ticket] },
    { code: "// TODO cache the resolved path", errors: [ticket] },
    { code: "// todo(BE-123): cache the resolved path", errors: [ticket] },
    { code: "// TODO(be-123): cache the resolved path", errors: [ticket] },
    { code: "// todo(be-123): cache the resolved path", errors: [ticket] },
    { code: "// Todo(BE-123): cache the resolved path", errors: [ticket] },
    { code: "// TODO(BE): cache the resolved path", errors: [ticket] },
    { code: "// TODO(BE-123) cache the resolved path", errors: [ticket] },
    { code: "// TODO(BE-123):", errors: [ticket] },
    { code: "/* TODO: cache the resolved path */", errors: [ticket] },
    { code: "/** TODO: cache the resolved path */", errors: [ticket] },
    {
      code: [
        "/**",
        " * Resolves the path.",
        " *",
        " * TODO: cache the resolved path",
        " */",
      ].join("\n"),
      errors: [ticket],
    },
    // Each report points to its own comment. Oxlint's columns are 0-indexed.
    {
      code: [
        "// TODO(BE-123): cache the resolved path",
        "const a = 1; // TODO: drop the fallback",
      ].join("\n"),
      errors: [{ column: 13, line: 2, messageId: "ticket" }],
    },
  ],
  valid: [
    "// TODO(BE-123): cache the resolved path",
    "//   TODO(SRE-1240): rotate the key",
    "/* TODO(H-773): add the creation button */",
    "/** TODO(BE-123): cache the resolved path */",
    [
      "/**",
      " * Resolves the path.",
      " *",
      " * TODO(BE-123): cache the resolved path",
      " */",
    ].join("\n"),
    "/** Lists the TODO comments in a file. */",
    "// a comment that mentions a TODO later in its text",
    "// TODOs live in Linear",
  ],
});
