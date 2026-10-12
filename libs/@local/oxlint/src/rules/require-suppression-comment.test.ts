import { RuleTester } from "oxlint/plugins-dev";

import { requireSuppressionComment } from "./require-suppression-comment.js";

const tester = new RuleTester();

const allRules = { messageId: "allRules" };
const justification = { messageId: "justification" };
const multipleRules = { messageId: "multipleRules" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("require-suppression-comment", requireSuppressionComment, {
  invalid: [
    {
      code: "// oxlint-disable-next-line no-console\nconsole.log();",
      errors: [justification],
    },
    {
      code: "console.log(); // oxlint-disable-line no-console --   ",
      errors: [justification],
    },
    { code: "/* oxlint-disable -- legacy file */", errors: [allRules] },
    {
      code: "// oxlint-disable-next-line\nconsole.log();",
      errors: [allRules, justification],
    },
    {
      code: "// oxlint-disable-next-line no-console, no-var -- legacy\nvar a = console;",
      errors: [
        { data: { rules: "no-console, no-var" }, messageId: "multipleRules" },
      ],
    },
    {
      code: "/* eslint-disable no-console, no-var */",
      errors: [multipleRules, justification],
    },
    {
      code: "// oxlint-disable-next-line no-console ,  no-var -- legacy\nvar a = console;",
      errors: [
        { data: { rules: "no-console, no-var" }, messageId: "multipleRules" },
      ],
    },
    // Each report points to the directive's own comment. Oxlint's columns are 0-indexed.
    {
      code: [
        "/* oxlint-disable no-console -- generated file */",
        "const a = 1; // oxlint-disable-line no-unused-vars",
        "// oxlint-disable-next-line",
        "const b = 2;",
      ].join("\n"),
      errors: [
        { column: 13, line: 2, messageId: "justification" },
        { column: 0, line: 3, messageId: "allRules" },
        { column: 0, line: 3, messageId: "justification" },
      ],
    },
  ],
  valid: [
    "// oxlint-disable-next-line no-console -- the CLI reports progress on stdout\nconsole.log();",
    "/* oxlint-disable no-console -- generated file */\n/* oxlint-enable */",
    "console.log(); // eslint-disable-line no-console -- debugging aid",
    "// oxlint-disable-next-line unicorn/no-null -- the API distinguishes null from undefined\nconst a = null;",
    "// a regular comment, mentioning oxlint-disable in passing",
  ],
});
