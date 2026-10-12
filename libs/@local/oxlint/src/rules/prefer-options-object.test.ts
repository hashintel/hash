import { RuleTester } from "oxlint/plugins-dev";

import { preferOptionsObject } from "./prefer-options-object.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "optionsObject" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("prefer-options-object", preferOptionsObject, {
  invalid: [
    { code: "function query(retry?: boolean) {}", errors: [error] },
    { code: "const query = (limit?: number) => {};", errors: [error] },
    { code: "const query = function (name?: string) {};", errors: [error] },
    { code: "function query(mode?: 'fast') {}", errors: [error] },
    { code: "function query(limit?: bigint) {}", errors: [error] },
    { code: "function query(key?: symbol) {}", errors: [error] },
    { code: "function query(retry = true) {}", errors: [error] },
    { code: "function query(limit = -1) {}", errors: [error] },
    { code: "function query(limit = +1) {}", errors: [error] },
    { code: "function query(limit = -1n) {}", errors: [error] },
    { code: "function query(limit = 1n) {}", errors: [error] },
    { code: "function query(name = `default`) {}", errors: [error] },
    {
      code: "function query(limit: number = defaultLimit) {}",
      errors: [error],
    },
    { code: "class Query { run(retry?: boolean) {} }", errors: [error] },
    {
      code: "class Query { constructor(public retry = true) {} }",
      errors: [error],
    },
    { code: "declare function query(retry?: boolean): void;", errors: [error] },
    { code: "function query(retry?: boolean): void;", errors: [error] },
    { code: "type Query = (retry?: boolean) => void;", errors: [error] },
    {
      code: "type Query = new (retry?: boolean) => QueryResult;",
      errors: [error],
    },
    { code: "interface Query { (retry?: boolean): void }", errors: [error] },
    {
      code: "interface Query { new (retry?: boolean): QueryResult }",
      errors: [error],
    },
    { code: "interface Query { run(retry?: boolean): void }", errors: [error] },
    {
      code: "function query(retry?: boolean, limit = 1) {}",
      errors: [error, error],
    },
  ],
  valid: [
    "function query(retry: boolean) {}",
    "function query(options?: { retry?: boolean }) {}",
    "function query(options: QueryOptions = {}) {}",
    "function query({ retry = true }: QueryOptions = {}) {}",
    "function query(values: number[] = []) {}",
    "function query(pattern = /query/) {}",
    "function query(value = null) {}",
    "function query(...values: number[]) {}",
    // These require semantic type information, which this syntax rule does not infer.
    "type Retry = boolean; function query(retry?: Retry) {}",
    "function query(retry = defaultRetry) {}",
    "import { accept } from 'library'; accept(retry => {});",
  ],
});
