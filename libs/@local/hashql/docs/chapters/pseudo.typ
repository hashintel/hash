== Specification Syntax <pseudo-syntax>

HashQL is a frontend agnostic language, over a functional, side-effect free language core. Currently the frontend implemented are J-Expr a derivative of S-Expr (citation needed), which is primarily geared towards authoring through machines. It therefore overly verbose, and lacks legibility.

The syntax used in this specification therefore uses a more human-readable syntax, which is easier to understand, it is derived from the current pretty-printed output of the HIR of the compiler, and may change over time. It is not authoritative, and only used as a reference. Inspiration has been taken from existing languages and their syntax, such as Typst, Nix and Rust.

This guide will not cover the full syntax of HashQL, and it's part. It is assumed that the reader is already familiar with the language core.

=== Reading conventions <pseudo-conventions>

We use $bb(e)_n$ inside of code blocks to denote arbitrary expressions, with $bb(e)^"form"_n$ denoting an expression of a specific form.

We use lowercase identifiers to denote variables, and uppercase identifiers to denote types. Generics use single letter uppercase identifiers (e.g. `T`, `U`), while types use `PascalCase` (e.g. `Integer`, `String`).

$dots$ is used to omit elements, and has no specific meaning outside of it, it may not be removed, but instead be used to indicate that the element is omitted (as it isn't part of the expression that is to be examined).

---

Thea: please derive the syntax from the HIR pretty-printer (and syntax highlighting for it).

The specification notation follows the expression forms of the high-level intermediate representation (HIR) pretty-printer. Examples use descriptive names in place of compiler-generated identifiers and abbreviate expanded types where the surrounding text defines the abbreviation. These conventions expose the expression structure without defining a concrete frontend grammar.

=== Reading conventions <pseudo-conventions>

Schematic forms use `e`, `e1` and `e2` for expressions, `x` for a local name, and `T` and `U` for types. An ellipsis `...` marks omitted elements rather than an operation. Parentheses make grouping explicit, while indentation and line breaks organize longer expressions for reading. Explanatory comments begin with `//`; they are annotations added to examples, not part of the printer's output.

=== Values and access <pseudo-values>

Primitive values use `null`, `true`, `false`, decimal numbers and double-quoted strings. String escapes follow the printer's display notation, including `\n`, `\"`, `\\` and `\u{3bb}`. Aggregate values retain distinct delimiters for positional elements, named fields and key-value pairs:

#table(
  columns: (auto, 1fr),
  table.header([Form], [Notation]),
  [Tuple], [`()`, `(e,)`, `(e1, e2)`],
  [Struct], [`(:)`, `(name: e)`, `(name: e1, active: e2)`],
  [List], [`[]`, `[e1, e2]`],
  [Dictionary], [`{}`, `{e1: e2}`],
  [Field access], [`e.name`],
  [Index access], [`e1[e2]`],
)

The trailing comma distinguishes the single-element tuple `(e,)` from the grouped expression `(e)`. A struct labels each field with a name, whereas a dictionary associates a key expression with a value expression. Field access uses a dot; index access encloses its index in brackets. Parentheses group compound receivers, as in `(if test then left else right).name`.

```hashql
(name: "Ada", active: true)
{"Ada": 37, "Grace": 40}
[2, 3, 5]
(2,)
```

=== Names and calls <pseudo-calls>

A local reference uses a name such as `x`; a qualified name uses a leading `::` and separates path segments with `::`. Calls append a parenthesized argument list to the function expression. Type arguments, when shown, occur between the name and the argument list:

```hashql
f(x, y)
::core::math::add(left, right)
::core::math::add<Number>(left, right)
```

A reference such as `f<T>` does not include a value-argument list. The form `f()` denotes a call with no value arguments. Type constructors use the same call shape, with the constructor's name in the function position.

=== Bindings and conditionals <pseudo-bindings>

A binding expression has the form `let x = e1 in e2`. A comma-separated binding list shares one `let` and a single `in` before the body. A conditional has the form `if test then e1 else e2`; both branches occupy expression positions. The following example combines these forms with field access:

```hashql
let person = (name: "Ada", age: 37),
    minimum = 18
in
if person.age >= minimum then person.name else "unavailable"
```

=== Closures and thunks <pseudo-closures>

A closure consists of typed parameters, a result type and an expression body: `(x: T): U -> e`. The colon after the parameter list introduces the result type, and `->` introduces the body. Generic parameters precede the parameter list; a bound follows the corresponding parameter after a colon.

```hashql
(value: Integer): Boolean -> value >= 18
<T>(value: T): T -> value
<T: Number>(left: T, right: T): T ->
    ::core::math::add<T>(left, right)
```

A zero-parameter closure retains its parameter list, as in `(): Integer -> 2`. Compiler-transformation examples use `thunk -> e` for the distinct HIR thunk form. These two forms remain distinguishable even when their bodies are identical.

=== Operators and type notation <pseudo-types>

Binary operations appear between their operands. The printer exposes comparison operators `==`, `!=`, `<`, `<=`, `>` and `>=`, together with Boolean operators `&&` and `||`. Unary forms place `!`, `-` or `~` before the operand. Arithmetic examples use calls such as `::core::math::add(x, y)`.

```hashql
(x >= lower) && (x < upper)
!(x == y)
value as Number
value as! Number
```

Nested operator expressions use parentheses rather than relying on an implicit precedence table. The spellings `e as T` and `e as! T` distinguish non-forcing and forcing type assertions. They identify the HIR assertion forms without defining a runtime conversion or failure behavior.

Type expressions use the following forms. The same tuple and struct delimiters apply, with types in place of value expressions. A closure type contains parameter types without parameter names, which distinguishes `(T) -> U` from the closure expression `(x: T): U -> e`.

#table(
  columns: (auto, 1fr),
  table.header([Form], [Notation]),
  [Primitive type], [`Boolean`, `Integer`, `Number`, `String`, `Null`],
  [Tuple type], [`()`, `(T,)`, `(T, U)`],
  [Struct type], [`(:)`, `(name: T, active: Boolean)`],
  [List type], [`List<T>`],
  [Dictionary type], [`Dict<T, U>`],
  [Union], [`T | U`],
  [Intersection], [`T & U`],
  [Closure type], [`(T, U) -> T`],
  [Never type], [`!`],
  [Unknown type], [`?`],
)

Named types use their names, with qualification where needed. Parentheses retain grouping in nested type expressions, as in `(T | U) & V`. The type position distinguishes `!` and `?` from expression-level operators and input prefixes.

=== Query inputs <pseudo-inputs>

Input operations refer to parameters by name. The printer writes a required load as `$name`, a non-required load as `?name`, and a presence test as `$exists(name)`. The following form uses the presence test to choose between a load and a default expression:

```hashql
if $exists(limit) then ?limit else (10 as Integer)
```

The non-required prefix is `?`, not `$?`. Its spelling is distinct from the standalone unknown type `?` in @pseudo-types. The example tests presence before the load and makes no assumption about a non-required load from an absent input.

=== Graph reads <pseudo-graph>

A specialized HIR graph read consists of a head, zero or more body stages and a tail. The printer separates these stages with `|>` and retains their qualified names. The following example abbreviates the entity type as `Entity`, with `axis` standing for the head's temporal-axis argument:

```hashql
::graph::head::entities(axis)
|> ::graph::body::filter((entity: Entity): Boolean ->
    !entity.metadata.archived
)
|> ::graph::tail::collect
```

The filter takes a closure, whereas the collect tail has no explicit argument list. The pipeline makes the graph-read structure visible without nesting each stage inside the next stage's call. This use of `|>` is specific to the graph-read form rather than a general function-composition operator.

=== Relationship to compiler output <pseudo-diagnostics>

Compiler output can contain mangled local names such as `x:0`, generated locals such as `%0`, generic parameter identifiers such as `?30`, and inference variables such as `_0`. Specification examples replace these identifiers with descriptive names and keep distinct bindings distinct. Generic parameters therefore appear as `T` or `U` rather than compiler-assigned numbers.

The type printer can also expose opaque representations, substitutions and recursive-type truncation. Examples omit these diagnostic expansions unless the expansion is the subject of the discussion. Literal compiler-output excerpts retain the original identifiers and expansions; the simplified examples are explanatory notation rather than text intended for round-trip parsing.
