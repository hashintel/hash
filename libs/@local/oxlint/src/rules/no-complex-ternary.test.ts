import { RuleTester } from "oxlint/plugins-dev";

import { noComplexTernary } from "./no-complex-ternary.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

const rejects = (
  code: string,
  ...findings: readonly [expression: string, messageId: string][]
): RuleTester.InvalidTestCase => ({
  code,
  errors: findings.map(([expression, messageId]) => {
    const offset = code.indexOf(expression);
    if (offset === -1 || offset !== code.lastIndexOf(expression)) {
      throw new Error(`Expected a unique diagnostic span: ${expression}`);
    }
    const before = code.slice(0, offset);
    const through = code.slice(0, offset + expression.length);
    return {
      messageId,
      line: before.split("\n").length,
      column: before.length - before.lastIndexOf("\n") - 1,
      endLine: through.split("\n").length,
      endColumn: through.length - through.lastIndexOf("\n") - 1,
    };
  }),
  output: null,
});

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("no-complex-ternary", noComplexTernary, {
  invalid: [
    rejects("const result = enabled ? compute() : fallback;", [
      "compute()",
      "call",
    ]),
    rejects("const result = enabled ? value : compute();", [
      "compute()",
      "call",
    ]),
    rejects("const result = enabled ? { value: compute() } : {};", [
      "compute()",
      "call",
    ]),
    rejects("const result = enabled ? { [getKey()]: value } : {};", [
      "getKey()",
      "call",
    ]),
    rejects("const result = enabled ? { ...getOptions() } : {};", [
      "getOptions()",
      "call",
    ]),
    rejects(
      "const result = enabled ? { values: [value, { nested: compute() }] } : {};",
      ["compute()", "call"],
    ),
    rejects("const result = enabled ? [...getValues()] : [];", [
      "getValues()",
      "call",
    ]),
    rejects("const result = enabled ? getObject().value : fallback;", [
      "getObject()",
      "call",
    ]),
    rejects("const result = enabled ? object[getKey()] : fallback;", [
      "getKey()",
      "call",
    ]),
    rejects(
      "const result = enabled ? new Formatter(loadLocale()) : fallback;",
      ["loadLocale()", "call"],
    ),
    rejects("const result = enabled ? new (getConstructor())() : fallback;", [
      "getConstructor()",
      "call",
    ]),
    rejects(
      // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
      "const result = enabled ? text`Value: ${compute()}` : text`Absent`;",
      ["compute()", "call"],
    ),
    rejects("const result = enabled ? getTag()`Value` : fallback;", [
      "getTag()",
      "call",
    ]),
    rejects(
      // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
      "const result = enabled ? `Value: ${compute()}` : fallback;",
      ["compute()", "call"],
    ),
    rejects(
      "async function choose() { return enabled ? await pending : fallback; }",
      ["await pending", "await"],
    ),
    rejects("const result = enabled ? (target = value) : fallback;", [
      "target = value",
      "assignment",
    ]),
    rejects("const result = enabled ? count++ : fallback;", [
      "count++",
      "update",
    ]),
    rejects("const result = enabled ? ready && value : fallback;", [
      "ready && value",
      "logical",
    ]),
    rejects("const result = enabled ? (ready ? first : second) : fallback;", [
      "ready ? first : second",
      "nestedConditional",
    ]),
    rejects("const result = enabled ? (first, second) : fallback;", [
      "first, second",
      "sequence",
    ]),
    rejects("const result = enabled ? count + 1 : fallback;", [
      "count + 1",
      "binary",
    ]),
    rejects("const result = enabled ? !ready : fallback;", ["!ready", "unary"]),
    rejects("const result = enabled ? object?.value : fallback;", [
      "object?.value",
      "optionalChain",
    ]),
    rejects("const result = enabled ? import('module') : fallback;", [
      "import('module')",
      "import",
    ]),
    rejects("function* choose() { return enabled ? yield value : fallback; }", [
      "yield value",
      "yield",
    ]),
    rejects(
      "const result = enabled ? class { static value = compute(); } : fallback;",
      ["class { static value = compute(); }", "class"],
    ),
    rejects("const result = enabled ? (compute() as Value) : fallback;", [
      "compute()",
      "call",
    ]),
    rejects(
      "const result = enabled ? (compute() satisfies Value) : fallback;",
      ["compute()", "call"],
    ),
    rejects("const result = enabled ? compute()! : fallback;", [
      "compute()",
      "call",
    ]),
    rejects(
      "const callback = enabled ? function run() { return compute(); } : fallback;",
      ["function run() { return compute(); }", "inlineFunction"],
    ),
    rejects("const callback = enabled ? () => compute() : fallback;", [
      "() => compute()",
      "inlineFunction",
    ]),
    rejects(
      "const callback = enabled ? (value: string) => { return value; } : fallback;",
      ["(value: string) => { return value; }", "inlineFunction"],
    ),
    rejects(
      `enabled
  ? {
      first: loadFirst(),
      [getKey()]: loadSecond(),
    }
  : fallback();`,
      ["loadFirst()", "call"],
      ["getKey()", "call"],
      ["loadSecond()", "call"],
      ["fallback()", "call"],
    ),
    rejects(
      "const result = enabled ? getObject()[getKey()] : fallback;",
      ["getObject()", "call"],
      ["getKey()", "call"],
    ),
    rejects(
      "const result = enabled ? new (getConstructor())(first(), second()) : fallback;",
      ["getConstructor()", "call"],
      ["first()", "call"],
      ["second()", "call"],
    ),
    rejects(
      // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
      "const result = enabled ? getTag()`First: ${first()} Second: ${second()}` : fallback;",
      ["getTag()", "call"],
      ["first()", "call"],
      ["second()", "call"],
    ),
    rejects("const result = enabled ? outer(inner()) : fallback;", [
      "outer(inner())",
      "call",
    ]),
    rejects(
      "const result = enabled ? outer(ready ? first() : second()) : fallback;",
      ["outer(ready ? first() : second())", "call"],
    ),
    rejects(
      "const result = enabled ? (ready ? first() : second()) : fallback;",
      ["ready ? first() : second()", "nestedConditional"],
    ),
    rejects(
      "const callback = enabled ? () => ready ? first() : second() : fallback;",
      ["() => ready ? first() : second()", "inlineFunction"],
    ),
    rejects(
      "const view = enabled ? <Item>{ready ? first() : second()}</Item> : null;",
      ["first()", "call"],
      ["second()", "call"],
    ),
  ],
  valid: [
    "const result = enabled ? value : fallback;",
    "const result = enabled ? 'present' : null;",
    "const options = enabled ? { [key]: value } : {};",
    "const result = enabled ? { ...defaults, values: [, value, ...rest] } : {};",
    "const result = enabled ? object.value : object[key];",
    "class State { #value = 0; read() { return enabled ? this.#value : this; } }",
    "const formatter = detailed ? new DetailedFormatter(locale) : new BriefFormatter(locale);",
    "const result = enabled ? new registry.Factory(...arguments_) : fallback;",
    // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
    "const label = enabled ? text`Enabled: ${name}` : text`Disabled`;",
    // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
    "const result = enabled ? tags.text`Value: ${object[key]}` : `Value: ${value}`;",
    "const result = enabled ? ((value as Value) satisfies Value)! : fallback;",
    {
      code: "const result = enabled ? <Value>value : fallback;",
      languageOptions: { parserOptions: { lang: "ts" } },
    },
    "const callback = enabled ? refresh : fallback;",
    "const callback = enabled ? refresh<Value> : fallback;",
    "const location = enabled ? import.meta : fallback;",
    "class Child extends Parent { read() { return enabled ? super.value : fallback; } }",
    "const view = enabled ? <Active /> : <Inactive />;",
    "const view = enabled ? <><Item value={compute()} />{render()}</> : null;",
    "const result = isEnabled() ? { value } : {};",
  ],
});
