import { RuleTester } from "oxlint/plugins-dev";

import { namingConventions } from "./naming-conventions.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
});

const error = { messageId: "casing" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("naming-conventions/variable-casing", namingConventions, {
  invalid: [
    {
      code: "const foo_bar = 1; console.log(foo_bar);",
      errors: [error],
      output: "const fooBar = 1; console.log(fooBar);",
    },
    // Oxlint merges a report's edits into one span. The overlapping second rename waits a pass.
    {
      code: "const fn = (foo_bar: string, baz_q?: number) => foo_bar + String(baz_q);",
      errors: [error, error],
      output:
        "const fn = (fooBar: string, baz_q?: number) => fooBar + String(baz_q);",
    },
    {
      code: "class Foo { m(@D() foo_bar: string) { return foo_bar; } }",
      errors: [error],
      output: "class Foo { m(@D() fooBar: string) { return fooBar; } }",
    },
    {
      code: "const foo_bar = 1; export { foo_bar };",
      errors: [error],
      output: "const fooBar = 1; export { fooBar as foo_bar };",
    },
    {
      code: "const foo_bar = 1; const o = { foo_bar }; const { k_v = 1 } = o;",
      errors: [error, error],
      output:
        "const fooBar = 1; const o = { foo_bar: fooBar }; const { k_v: kV = 1 } = o;",
    },
    {
      code: "function f() { var a_b; { let aB = 1; } return a_b; }",
      errors: [error],
      output: "function f() { var aB; { let aB = 1; } return aB; }",
    },
    // Types, classes, enums and namespaces are PascalCase.
    {
      code: "class Foo_Bar { static make() { return new Foo_Bar(); } } new Foo_Bar();",
      errors: [
        {
          data: { casing: "PascalCase", expected: "FooBar", name: "Foo_Bar" },
          messageId: "casing",
        },
      ],
      output:
        "class FooBar { static make() { return new FooBar(); } } new FooBar();",
    },
    {
      code: "const make = () => new (class inner_class {})(); make();",
      errors: [error],
      output: "const make = () => new (class InnerClass {})(); make();",
    },
    {
      code: "const my_class = class {}; new my_class();",
      errors: [error],
      output: "const MyClass = class {}; new MyClass();",
    },
    {
      code: "type user_id = string; const id: user_id = '';",
      errors: [error],
      output: "type UserId = string; const id: UserId = '';",
    },
    {
      code: "interface fooBar {} let value: fooBar;",
      errors: [error],
      output: "interface FooBar {} let value: FooBar;",
    },
    {
      code: "enum color { Red } color.Red;",
      errors: [error],
      output: "enum Color { Red } Color.Red;",
    },
    {
      code: "namespace utils {}",
      errors: [error],
      output: "namespace Utils {}",
    },
    // Renaming an enum member would rename a property of the enum object.
    { code: "enum Color { dark_red }", errors: [error], output: null },
    {
      code: "const identity = <t_value,>(value: t_value): t_value => value;",
      errors: [error],
      output: "const identity = <TValue,>(value: TValue): TValue => value;",
    },
    {
      code: "type Copy<T> = { readonly [index in keyof T]: T[index] };",
      errors: [
        {
          messageId: "casing",
          data: { casing: "PascalCase", expected: "Index", name: "index" },
        },
      ],
      output: "type Copy<T> = { readonly [Index in keyof T]: T[Index] };",
    },
    {
      code: `type Getters<T> = { [key_name in keyof T as \`get\${key_name & string}\`]: T[key_name] };`,
      errors: [
        {
          messageId: "casing",
          data: { casing: "PascalCase", expected: "KeyName", name: "key_name" },
        },
      ],
      output: `type Getters<T> = { [KeyName in keyof T as \`get\${KeyName & string}\`]: T[KeyName] };`,
    },
    {
      code: "type Copy<Index, Keys extends PropertyKey> = { [index in Keys]: [Index, index] };",
      errors: [error],
      output: null,
    },
    {
      code: "let Index = 0; type Copy<T> = { [Index in keyof T]: T[Index] }; Index += 1;",
      errors: [error],
      output:
        "let index = 0; type Copy<T> = { [Index in keyof T]: T[Index] }; index += 1;",
    },
    // A value merged with a type follows the type.
    {
      code: "const user_schema = 1; type user_schema = typeof user_schema;",
      errors: [error],
      output: "const UserSchema = 1; type UserSchema = typeof UserSchema;",
    },
    {
      code: "const q = function inner_f() { return inner_f; }; q();",
      errors: [error],
      output: "const q = function innerF() { return innerF; }; q();",
    },
    // Renaming would cause a collision or shadowing with an existing binding.
    {
      code: "const foo_bar = 1; const fooBar = 2;",
      errors: [error],
      output: null,
    },
    {
      code: "const foo_bar = 1; function f(fooBar: number) { return foo_bar + fooBar; }",
      errors: [error],
      output: null,
    },
    {
      code: "const foo_bar = 1; function f() { return fooBar + foo_bar; }",
      errors: [error],
      output: null,
    },
    {
      code: "function f() { var a_b; { let aB = 1; var a_b; } }",
      errors: [error],
      output: null,
    },
    // Only the first rename can claim the name when two variables converge on it.
    {
      code: "const foo_bar = 1; const fooBar_ = 2; const foo__bar = 3;",
      errors: [error, error],
      output: "const fooBar = 1; const fooBar_ = 2; const foo__bar = 3;",
    },
    // Renaming would change the module's interface or the meaning of the code.
    { code: "export const foo_bar = 1;", errors: [error], output: null },
    { code: "export class Foo_Bar {}", errors: [error], output: null },
    { code: "export type foo_bar = string;", errors: [error], output: null },
    { code: "declare const foo_bar: string;", errors: [error], output: null },
    {
      code: "class P { constructor(private foo_bar: string) {} }",
      errors: [error],
      output: null,
    },
    // `const` bindings and function declarations keep the case of their first letter.
    {
      code: "const My_Comp = () => null; const el = <My_Comp />;",
      errors: [
        {
          data: {
            casing: "camelCase or PascalCase",
            expected: "MyComp",
            name: "My_Comp",
          },
          messageId: "casing",
        },
      ],
      output: "const MyComp = () => null; const el = <MyComp />;",
    },
    {
      code: "function User_Schema() {} User_Schema();",
      errors: [error],
      output: "function UserSchema() {} UserSchema();",
    },
    {
      code: "function make_user(): void; function make_user() {} make_user();",
      errors: [error],
      output: "function makeUser(): void; function makeUser() {} makeUser();",
    },
    {
      code: "const { Foo_Bar } = source;",
      errors: [error],
      output: "const { Foo_Bar: FooBar } = source;",
    },
    // `let`, `var`, parameters and function expression names are camelCase only.
    {
      code: "let Counter = 0; Counter += 1;",
      errors: [error],
      output: "let counter = 0; counter += 1;",
    },
    {
      code: "const fn = (Value: number) => Value;",
      errors: [error],
      output: "const fn = (value: number) => value;",
    },
    // A JSX component must not become an intrinsic element.
    {
      code: "let My_Comp = () => null; const el = <My_Comp />;",
      errors: [error],
      output: null,
    },
    {
      code: "const foo_bar = 1; eval('foo_bar');",
      errors: [error],
      output: null,
    },
    { code: "let New = 1;", errors: [error], output: null },
  ],
  valid: [
    "const fooBar = 1;",
    "const userID = 1;",
    "const _private = 1; const value$ = 2; const __dirname = '';",
    "import { foo_bar as fooBar } from 'x';",
    // The exporting module chooses imported names.
    "import Foo_Bar, { foo_bar, Baz_Q as baz_q } from 'x'; import * as Ns_X from 'y'; import type { T_x } from 'z';",
    "class FooBar {} const Expr = class Inner {}; abstract class Base {}",
    "type UserId = string; interface Props {} enum Color { Red } namespace Utils {}",
    "function identity<T, TValue>(value: TValue): TValue { return value; }",
    "type Values<Members extends readonly unknown[]> = { [Index in keyof Members]: Members[Index] };",
    "type Nested<T> = { [Outer in keyof T]: { [Inner in keyof T[Outer]]: T[Outer][Inner] } };",
    `type Getters<T> = { readonly [Key in keyof T as \`get\${Key & string}\`]-?: T[Key] };`,
    "type Value<T> = T extends infer Item ? Item : never;",
    "const Schema = 1; type Schema = typeof Schema;",
    "const MyComponent = () => null; const User = Schema.Struct({}); const { Foo } = source;",
    "function Person() {} function makePerson() { return new Person(); }",
    "function Over(value: string): void; function Over(value: unknown) {}",
  ],
});

const affixError = { messageId: "kindAffix" };

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("naming-conventions/kind-affixes", namingConventions, {
  invalid: [
    {
      code: "interface IUser {} let user: IUser;",
      errors: [
        {
          data: {
            affix: "I",
            expected: "User",
            name: "IUser",
            position: "prefix",
          },
          messageId: "kindAffix",
        },
      ],
      output: "interface User {} let user: User;",
    },
    {
      code: "type IUser = { id: string }; let user: IUser;",
      errors: [affixError],
      output: "type User = { id: string }; let user: User;",
    },
    {
      code: "class IRepository {} new IRepository();",
      errors: [affixError],
      output: "class Repository {} new Repository();",
    },
    {
      code: "enum EColor { Red } EColor.Red;",
      errors: [affixError],
      output: "enum Color { Red } Color.Red;",
    },
    {
      code: "interface UserI {} let user: UserI;",
      errors: [affixError],
      output: "interface User {} let user: User;",
    },
    {
      code: "type UserShape = { id: string }; let user: UserShape;",
      errors: [affixError],
      output: "type User = { id: string }; let user: User;",
    },
    {
      code: "const userShape = {}; console.log(userShape);",
      errors: [affixError],
      output: "const user = {}; console.log(user);",
    },
    {
      code: "const UserShape = Schema.Struct({}); type UserShape = typeof UserShape.Type;",
      errors: [affixError],
      output: "const User = Schema.Struct({}); type User = typeof User.Type;",
    },
    {
      code: "interface _IUser {} let user: _IUser;",
      errors: [affixError],
      output: "interface _User {} let user: _User;",
    },
    // A single rename fixes both the casing and the affix.
    {
      code: "interface I_user {} let user: I_user;",
      errors: [
        {
          data: {
            affix: "I",
            casing: "PascalCase",
            expected: "User",
            name: "I_user",
            position: "prefix",
          },
          messageId: "casingAndKindAffix",
        },
      ],
      output: "interface User {} let user: User;",
    },
    {
      code: "const User_Shape = 1; console.log(User_Shape);",
      errors: [{ messageId: "casingAndKindAffix" }],
      output: "const User = 1; console.log(User);",
    },
    // A conversion to camelCase lowercases the prefix, leaving no affix behind.
    {
      code: "let IUser = 1; IUser += 1;",
      errors: [error],
      output: "let iUser = 1; iUser += 1;",
    },
    // The name without the affix already exists. The author must choose a new name.
    {
      code: "interface IUser {} class User implements IUser {}",
      errors: [affixError],
      output: null,
    },
    { code: "export interface IUser {}", errors: [affixError], output: null },
  ],
  valid: [
    "interface IOError {} type ETL = string; interface IPAddress {} type ID = string;",
    "type IPv4Address = string; interface IFrameProps {} type ETagHeader = string;",
    "interface Effect {} type Entity = {}; interface Item {}",
    "type Shape = {}; type UI = {}; class AppUI {} type PhaseII = 2;",
    "let rowI = 0; const userShapes = [];",
    "function f<EIn, IItem>(error: EIn, item: IItem) {}",
    "type Copy<T> = { [IIndex in keyof T]: T[IIndex] };",
    // The exporting module chooses imported names.
    "import type { IUser, UserShape } from 'x';",
  ],
});
