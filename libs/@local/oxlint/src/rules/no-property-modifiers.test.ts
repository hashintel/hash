import { RuleTester } from "oxlint/plugins-dev";

import { noPropertyModifiers } from "./no-property-modifiers.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
});

const privateError = { messageId: "private" };
const publicError = { messageId: "public" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("no-property-modifiers", noPropertyModifiers, {
  invalid: [
    {
      code: "class A { private foo = 1; get() { return this.foo; } }",
      errors: [privateError],
      output: "class A { #foo = 1; get() { return this.#foo; } }",
    },
    {
      code: "class A { private readonly foo: number; constructor() { this.foo = 1; } }",
      errors: [privateError],
      output:
        "class A { readonly #foo: number; constructor() { this.#foo = 1; } }",
    },
    {
      code: "class A { private foo = 1; bar = () => this.foo; baz = this.foo + 1; m() { return () => this?.foo; } }",
      errors: [privateError],
      output:
        "class A { #foo = 1; bar = () => this.#foo; baz = this.#foo + 1; m() { return () => this?.#foo; } }",
    },
    {
      code: "class A { private static foo = 1; static { this.foo; } static m() { return A.foo + this.foo; } }",
      errors: [privateError],
      output:
        "class A { static #foo = 1; static { this.#foo; } static m() { return A.#foo + this.#foo; } }",
    },
    {
      code: "class A { private accessor foo = 1; m() { return this.foo; } }",
      errors: [privateError],
      output: "class A { accessor #foo = 1; m() { return this.#foo; } }",
    },
    // `.foo` outside the class cannot refer to the private property.
    {
      code: "class A { private foo = 1; } const o = { foo: 1 }; o.foo;",
      errors: [privateError],
      output: "class A { #foo = 1; } const o = { foo: 1 }; o.foo;",
    },
    // Not every access can be rewritten with certainty.
    {
      code: "class A { private foo = 1; eq(other: A) { return other.foo === this.foo; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; m() { return function () { return this.foo; }; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; static m() { return this.foo; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; m() { const { foo } = this; return foo; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; m() { return this['foo']; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; m() { delete this.foo; } }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo = 1; #foo = 2; }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private foo?: number; }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { @dec private foo = 1; }",
      errors: [privateError],
      output: null,
    },
    {
      code: "declare class A { private foo: number; }",
      errors: [privateError],
      output: null,
    },
    {
      code: "class A { private 'foo-bar' = 1; }",
      errors: [privateError],
      output: null,
    },
    // The fix removes `public`, the default visibility.
    {
      code: "class A { public foo = 1; public static readonly bar = 2; public /* c */ accessor baz = 3; }",
      errors: [publicError, publicError, publicError],
      output:
        "class A { foo = 1; static readonly bar = 2; /* c */ accessor baz = 3; }",
    },
    {
      code: "class A { @dec({ public: true }) public foo = 1; }",
      errors: [publicError],
      output: "class A { @dec({ public: true }) foo = 1; }",
    },
    {
      code: "class A { public foo_bar() {} public static baz() {} }",
      errors: [publicError, publicError],
      output: "class A { foo_bar() {} static baz() {} }",
    },
    {
      code: "class A { public get value() { return 1; } public set value(next: number) {} }",
      errors: [publicError, publicError],
      output:
        "class A { get value() { return 1; } set value(next: number) {} }",
    },
    {
      code: "abstract class A { public abstract foo(): void; public bar(value: string): void; public bar(value: number): void; public bar(value: string | number) {} }",
      errors: [publicError, publicError, publicError, publicError],
      output:
        "abstract class A { abstract foo(): void; bar(value: string): void; bar(value: number): void; bar(value: string | number) {} }",
    },
    {
      code: "class A extends B { @dec({ public: true }) public /* keep */ override foo() {} public async *bar() {} }",
      errors: [publicError, publicError],
      output:
        "class A extends B { @dec({ public: true }) /* keep */ override foo() {} async *bar() {} }",
    },
    {
      code: "class A { public constructor() {} }",
      errors: [publicError],
      output: "class A { constructor() {} }",
    },
    {
      code: "class A { private foo_bar() {} private static baz() {} private get value() { return 1; } private set value(next: number) {} }",
      errors: [privateError, privateError, privateError, privateError],
      output: null,
    },
    {
      code: "class A { foo = value\n public [key]() {} }",
      errors: [publicError],
      output: null,
    },
    {
      code: "class A { foo = value\n public *bar() {} }",
      errors: [publicError],
      output: null,
    },
    {
      code: "class A { constructor(public readonly foo: number) {} }",
      errors: [publicError],
      output: "class A { constructor(readonly foo: number) {} }",
    },
    // Without the modifier, the computed key would continue the previous member.
    {
      code: "class A { foo = 1\n public [key] = 2; }",
      errors: [publicError],
      output: null,
    },
    // Without `readonly` or `override`, the parameter would no longer declare a property.
    {
      code: "class A { constructor(private readonly foo: number, public bar = 1) {} }",
      errors: [privateError, publicError],
      output: null,
    },
    {
      code: "class A { protected foo = 1; }",
      errors: [{ messageId: "protected" }],
      output: null,
    },
  ],
  valid: [
    "class A { foo = 1; #bar = 2; static baz = 3; readonly qux = 4; }",
    "class A { foo_bar() {} #bar() {} static baz() {} }",
    "class A { protected foo() {} protected get bar() { return 1; } protected set bar(value: number) {} }",
    "class A { private constructor() {} }",
    "class A { protected constructor() {} }",
    "const object = { public() {}, private() {}, protected() {} };",
    "class A { constructor(readonly foo: number) {} }",
  ],
});
