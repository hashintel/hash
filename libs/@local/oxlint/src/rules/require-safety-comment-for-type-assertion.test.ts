import { RuleTester } from "oxlint/plugins-dev";

import { requireSafetyCommentForTypeAssertion } from "./require-safety-comment-for-type-assertion.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "safetyComment" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run(
  "require-safety-comment-for-type-assertion",
  requireSafetyCommentForTypeAssertion,
  {
    invalid: [
      { code: "const value = input as Message;", errors: [error] },
      { code: "const value = <Message>input;", errors: [error] },
      {
        code: "const value = input as Message; // SAFETY: Too late.",
        errors: [error],
      },
      {
        code: "// The schema is checked.\nconst value = input as Message;",
        errors: [error],
      },
      { code: "// SAFETY:\nconst value = input as Message;", errors: [error] },
      {
        code: "/* SAFETY:\n *\n */\nconst value = input as Message;",
        errors: [error],
      },
      {
        code: "const value = /* SAFETY: */ input as Message;",
        errors: [error],
      },
      {
        code: "// UNSAFETY: Not a safety marker.\nconst value = input as Message;",
        errors: [error],
      },
      {
        code: "// safety: Wrong marker.\nconst value = input as Message;",
        errors: [error],
      },
      {
        code: "// SAFETY: Applies to the previous declaration.\nconst first = 1;\nconst value = input as Message;",
        errors: [error],
      },
      {
        code: "const first = 1; // SAFETY: Applies to the previous declaration.\nconst value = input as Message;",
        errors: [error],
      },
      {
        code: "// SAFETY: Not a justification for arbitrary statements in the function.\nfunction parse() { return input as Message; }",
        errors: [error],
      },
      {
        code: "// SAFETY: Not a justification for a later field.\nclass Reader { value = input as Message; }",
        errors: [error],
      },
      {
        code: "const value = input as unknown as Message;",
        errors: [error, error],
      },
      { code: "export const value = input as Message;", errors: [error] },
      {
        code: "const value = /* SAFETY: The first conversion is checked. */ (input as Message); const second = other as Message;",
        errors: [error],
      },
    ],
    valid: [
      "const value = { id: 1 } as const;",
      "const value = <const>{ id: 1 };",
      "const value = { id: 1 } satisfies Message;",
      "const value = input!;",
      "// SAFETY: The schema validates this value.\nconst value = input as Message;",
      "/* SAFETY:\n * The schema validates this value.\n */\nconst value = input as Message;",
      "const value = /* SAFETY: The schema validates this value. */ input as Message;",
      "// SAFETY: The schema validates both values.\nconst values = [first as Message, second as Message];",
      "// SAFETY: The schema validates this value.\nexport const value = input as Message;",
      "// SAFETY: The schema validates this value.\nexport default input as Message;",
      "function parse() {\n// SAFETY: The schema validates this value.\nreturn input as Message;\n}",
      "class Reader {\n// SAFETY: The schema validates this value.\nvalue = input as Message;\n}",
      "// SAFETY: The schema validates every returned value.\nconst parse = () => input as Message;",
      "// SAFETY: The conversion follows the checked external layout.\nconst value = input as unknown as Message;",
      "// SAFETY: The schema validates this value.\nconst value = <Message>input;",
    ],
  },
);
