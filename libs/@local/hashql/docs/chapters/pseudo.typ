#set text(lang: "en", region: "GB")
#import "../template/grammar.typ": grammar
#import "../template/lib.typ": note, rule, schematic

#let definitions = json("../syntax/pseudo-grammar.json")
#let syntax(..names) = grammar(definitions, names.pos())

== Specification syntax <pseudo-syntax>

HashQL is a frontend-agnostic, side-effect-free functional programming language with no canonical syntax. Its current frontend uses J-Expr, a derivative of S-expressions intended primarily for machine authoring through programming-language SDKs. This machine-oriented notation is verbose and difficult to read in handwritten examples.

We therefore introduce an illustrative syntax for this specification, derived from the output of the high-level intermediate representation (HIR) pretty-printer. The grammar defines notation for examples without claiming that its productions are unambiguous or suitable for direct parser generation. Implementing a compiler for this syntax is outside the scope of the specification.

The grammar uses Augmented Backus-Naur Form (ABNF) from RFC 5234, with the case-sensitive string extension from RFC 7405 @rfc5234 @rfc7405.

=== Conventions <pseudo-conventions>

The metavariable $bb(e)_n$ denotes an arbitrary valid HashQL expression. An optional superscript restricts its form: $bb(e)^"call"_n$ denotes a valid HashQL call expression. An ellipsis ($dots$) can also stand for an arbitrary valid HashQL expression.

==== Identifier <pseudo-identifier>

An identifier names a value or type. HashQL itself permits a broader range of identifiers, but this specification restricts their spelling to ASCII names.

#syntax("identifier", "identifier-start", "identifier-continue")

The unprefixed spellings `let`, `type`, `newtype`, `in`, `if`, `then`, `else`, `match`, `is`, `as`, `true`, `false`, and `null` are reserved keywords. Prefixing a keyword with `r#` permits its use as an identifier, as in `r#let`.

The specification uses the following naming conventions:
+ *Values*: `lowercase`.
+ *Types*: `PascalCase`.
+ *Type parameters*: a single uppercase letter, such as `T`.

==== Primitive literal <pseudo-literal>

Primitive literals represent integers, floats, strings, booleans and null.

#syntax("literal", "primitive-literal")

```hashql
null
true
37
2.5e3
"Ada"
```

==== Aggregate literal <pseudo-aggregates>

Tuples and structs use parentheses to delimit statically specified positions and field names, respectively. Lists use square brackets, and dictionaries use braces. List and dictionary types do not prescribe a fixed number of elements.

#syntax(
  "tuple-literal",
  "struct-literal",
  "field-initializer",
  "list-literal",
  "dictionary-literal",
  "dictionary-entry",
  "dictionary-spread",
  "expression-list",
)

The empty tuple is `()`, and the empty struct is `(:)`. A single-element tuple retains a comma:

#schematic("(", $bb(e)_1$, ",)")

Empty lists use `[]`, and empty dictionaries use `{}`. No other aggregate form admits a trailing comma.

A dictionary literal may end with a spread, written `...dict`, which contributes the entries of an existing dictionary. Explicit entries take precedence over entries from the spread. Thus, `{key: value, ...dict}` inserts `key` or replaces its existing value without mutating `dict`.

```hashql
(name: "Ada", active: true)
{"Ada": 37, "Grace": 40}
[2, 3, 5]
(2,)
```

=== Expression <pseudo-expression>

HashQL is an expression language: a convergent expression produces a value. Ordinary queries exclude divergent evaluation. A potentially divergent primitive exposes a convergence obligation, which must be justified at its use rather than making divergence an admissible query result. Literals denote data, while calls express computation. Special forms provide additional binding and evaluation rules.

#syntax(
  "expression",
  "operand",
  "reference-expression",
  "path",
  "relative-path",
  "apostrophe-identifier",
  "grouped-expression",
)

A path is either relative, as in `value` or `math::add`, or absolute, beginning with `::`. A reference may carry type arguments without a call: `identity<Integer>` refers to a callable instantiated with `Integer`. Supplying a value argument, as in `identity<Integer>(37)`, invokes that callable.

A leading apostrophe is permitted in a value identifier. The examples conventionally use it for recursive bindings, such as `'loop`, while `loop` names a bounded wrapper. The apostrophe does not make a binding recursive; the `'let` special form determines that behaviour (@pseudo-recursive-binding). This convention does not prescribe an internal compiler identifier.

Dedicated syntax for special forms and selected operations abbreviates their call forms. Parentheses group expressions to control the order of operations.

=== Call expression <pseudo-call>

A call expression has a callable as its first operand and arguments as its remaining operands. We write calls with a parenthesised argument list after the callable rather than as S-expressions:

#schematic($bb(e)_0$, "(", $bb(e)_1$, ", ", $dots$, ")\n", $bb(e)_0$, "()")

#syntax("call-expression", "call-argument-list", "call-argument", "labelled-argument")

Arguments use either unlabelled `value` syntax or labelled `label: value` syntax.

#rule("call.labels")[
  A labelled argument matches the closure parameter at its written position. Its label must match that parameter's declared name.
]

The shorthand `label:` expands to `label: label`.

```hashql
compare(left: first, right: second)
compare(left:, right:)
```

==== Input expression <pseudo-input>

The `input` special form requests a named, typed value from the caller. It provides a dependency-injection mechanism for external inputs and capabilities. `input` has an arity of two or three: an input identifier, a type and, optionally, a default value.

```hashql
input(limit, Integer)
input(limit, Integer, 10)
```

=== Value binding <pseudo-binding>

The `let` special form binds a value and evaluates a body in the resulting scope.

#rule("binding.scope")[
  Bindings are introduced in written order. Each binding is visible to subsequent bindings and to the body. Reusing a name shadows the existing binding in that scope.
]

#syntax(
  "let-expression",
  "binding",
  "binding-pattern",
  "tuple-binding-pattern",
  "struct-binding-pattern",
  "field-binding-pattern",
  "binding-pattern-list",
)

#schematic("let value = ", $bb(e)_1$, " in ", $bb(e)_2$)

```hashql
let person = (name: "Ada", age: 37),
    minimum = input(minimum, Integer, 18)
in
person.age >= minimum
```

The binder may be a path or a pattern that is irrefutable in the binding's context (@pseudo-match). Branch refinements contribute to that context: after excluding an empty dictionary, `{key: value, rest @ ..}` can extract one entry and its remainder. In a struct pattern, `field:` abbreviates `field: field`.

```hashql
let (name:, age:) = (name: "Ada", age: 37)
in ...

// is conceptually equivalent to:

let
  _1 = (name: "Ada", age: 37),
  name = _1.name,
  age = _1.age
in ...
```

#note[
  Destructuring is part of the illustrative notation and is not currently supported by HashQL.
]

==== Recursive value binding <pseudo-recursive-binding>

The `'let` special form introduces a recursive binding group. Unlike `let`, it makes every name in the group available within every initialising expression, including expressions that precede the name's declaration. The initialising expressions need not be closures.

#rule("binding.recursive-scope")[
  Every recursive binding is in scope in every initialising expression of its group and in the body. Each binding denotes a thunk that is invoked when the binding is referenced. Evaluation must satisfy the convergence requirements in @iteration.
]

#syntax("recursive-let-expression")

#note[
  Recursive value bindings are conceptual and are not planned for user programs. Their notation describes the iteration definitions in @iteration.
]

=== Type binding <pseudo-type-binding>

The `type` special form binds a type alias to an identifier within its body. The alias names an existing type without introducing a new nominal identity. A parameter list after its name introduces type parameters for the right-hand side, using the bounds defined in @pseudo-type.

#syntax("type-expression", "type-binding")

```hashql
type Age = Integer in
  input(age, Age)

type Pair<T> = (T, T) in
  input(pair, Pair<Integer>)
```

=== Newtype binding <pseudo-newtype-binding>

HashQL is structurally typed by default, with nominal typing available through `newtype`. This special form introduces a distinct nominal type and a constructor under the same name within its body. The constructor takes one value of the underlying type, except when that type is `Null`, in which case it takes no arguments. As with a type alias, parameters declared after the name are in scope in the underlying type.

#syntax("newtype-expression")

```hashql
newtype UserId = Integer in
  UserId(37)
newtype Marker = Null in
  Marker()
newtype Continue<T> = T in
  Continue(37)
```

=== Conditional <pseudo-conditional>

A conditional evaluates a boolean condition and selects one of two branches. Only the selected branch is evaluated, and its value is the result of the expression.

#syntax("if-expression")

#schematic("if ", $bb(e)_1$, " then ", $bb(e)_2$, " else ", $bb(e)_3$)

```hashql
if person.age >= minimum then person.name else "unavailable"
```

#rule("conditional.omitted-else")[
  Omitting the `else` branch gives an `Option` result. When the condition is true, the result is `Some` of the selected branch's value. When the condition is false, the result is `None()`.
]

```hashql
if person.age >= minimum then person.name
// is equivalent to
if person.age >= minimum then Some(person.name) else None()
```

=== Pattern matching <pseudo-match>

A `match` expression evaluates its scrutinee once and considers the arms in written order. Each arm has a pattern, an optional guard introduced by `if`, and a result expression. A guard is evaluated only after its pattern matches. The first arm whose pattern matches and whose guard, if present, is true supplies the result. If the scrutinee refers to a binding, the pattern narrows that binding's type within the arm's guard and result expression. A pattern binding with the same name shadows the outer binding.

An arm may match alternative patterns separated by `|`, but may not use intersection syntax (`&`). Each alternative must introduce the same binding names. Those bindings are available in the arm's guard and result expression. A pattern is irrefutable for a type when it matches every value of that type. At a binding site, established branch refinements may further restrict the possible values.

#syntax(
  "match-expression",
  "match-arm",
  "arm-indentation",
  "pattern",
  "pattern-primary",
  "tuple-pattern",
  "struct-pattern",
  "field-pattern",
  "pattern-list",
  "constructor-pattern",
  "list-pattern",
  "rest-pattern",
  "dictionary-pattern",
  "dictionary-entry-pattern",
)

#rule("match.exhaustive")[
  The `match` expression must cover every value permitted by the scrutinee's type.
]

#rule("match.wildcard")[
  The `_` pattern matches any value and does not introduce any bindings.
]

#note[
  Pattern matching is part of the illustrative notation and is not currently supported by HashQL.
]

==== Collection patterns <pseudo-collection-patterns>

A list pattern without `..` matches a list of exactly the written length. A rest pattern at either end matches the remaining elements, so `[head, rest @ ..]` extracts the first element and `[rest @ .., tail]` extracts the last. The `name @ ..` form binds the remainder as a list; bare `..` leaves it unbound. In both cases, a pattern with one written element requires a nonempty list.

The empty dictionary pattern `{}` matches only an empty dictionary. The pattern `{key: value, rest @ ..}` selects one entry from a nonempty dictionary, binds its key and value, and binds the dictionary without that entry as `rest`. Selection has no prescribed order. These patterns support the shrinking-remainder traversals in @iteration without imposing an order on dictionaries.

==== Binding pattern <pseudo-binding-condition>

When a pattern test is the whole `if` condition, the `then` branch refines the scrutinee to the values that match the pattern and the `else` branch to those that do not. The test may use a constructor or collection pattern; its bindings are available only where the test is known to have succeeded.

#syntax("is-expression", "exclusion-pattern")

```hashql
// foo: Some<T> | None
if foo is Some(item) then ... else ...
// is equivalent to
match foo
  Some(item) -> ...     // foo: Some<T>, item: T
  foo \ Some(_) -> ...  // foo: None
```

The schematic pattern `foo \ Some(_)` matches values in `foo`'s type that do not match `Some(_)`. The same exclusion applies to other unions:

```hashql
// foo: Continue<T> | Break<U>
if foo is Continue(value)
then value // foo: Continue<T>, value: T
else foo.0 // foo: Break<U>
```

#note[
  This binding form and the `\` type-exclusion operator are not currently supported by HashQL.
]

A successful pattern test on the left of `&&` makes its bindings and refinement available on the right.

For an `if` condition `(foo is Some(item)) && other`, the `then` branch can use `item` and knows that `foo` matched `Some` because both operands must be true. In the `else` branch, either operand may be false, so the pattern alone cannot narrow `foo`:

```hashql
// foo: Some<Integer> | None
if (foo is Some(item)) && (item > 2)
then ... // foo: Some<Integer>, item: Integer
else ... // foo: Some<Integer> | None

// is equivalent to:

match foo
  Some(item) if item > 2 -> ...
  _ -> ...
```

For an `if` condition `(foo is Some(item)) || other`, the `then` branch cannot use `item` or assume that `foo` matched `Some` because `other` can make the condition true. In the `else` branch, both operands were false, so the pattern's exclusion still holds.

An `is` test evaluates to a `Boolean`. Refinement for the `then` and `else` branches requires the test to appear directly in the `if` condition, including as a grouped operand of `&&` or `||`. Storing the Boolean result does not preserve its pattern bindings or refinement facts for later use.

=== Closure <pseudo-closure>

A closure declares value parameters and a body expression. Parameter and result types may be written explicitly or inferred from context. Its body may refer to the arguments and bindings from the surrounding scope. Generic parameters, when present, precede the value-parameter list.

#syntax("closure-expression", "parameter-list", "parameter")

```hashql
<T>(value: T): T -> value
(value) -> value
```

Parameters may use irrefutable patterns to directly destructure (@pseudo-match). A parameter may carry `#[requires_convergence]` to transfer the enclosing call's convergence obligation to the caller (@pseudo-annotation). A closure with no value parameters must use the empty parameter list `()`:

```hashql
(): Integer -> 67
```

=== Annotation <pseudo-annotation>

A convergence assertion qualifies the expression immediately following it. Before `let`, `'let`, `type` or `newtype` (@pseudo-binding, @pseudo-recursive-binding, @pseudo-type-binding, @pseudo-newtype-binding), it instead qualifies the right-hand side of the first binding. A call argument may carry the same assertion. The separate `#[requires_convergence]` annotation qualifies a closure parameter rather than an expression.

```hashql
#[unsafe(converges = "justification")]
let foo = first,
    bar = second
in
  ...

// is equivalent to:

let
  #[unsafe(converges = "justification")]
  foo = first,
  bar = second
in
  ...

// is equivalent to:

let
  foo = #[unsafe(converges = "justification")] first,
  bar = second
in
  ...
```

#syntax("annotated-expression", "attribute", "convergence-attribute", "requires-convergence-attribute")

The reference defines two annotations:
- `#[unsafe(converges = "justification")]` asserts that the applicable convergence obligation holds, records the justification and places responsibility for the assertion on the author.
- `#[requires_convergence]` on a closure parameter transfers the associated convergence obligation for the enclosing call to the caller. If the compiler cannot discharge it for the supplied arguments, the caller must justify it with `#[unsafe(converges = "justification")]` on the corresponding argument.

The obligation concerns convergence of the enclosing call, not merely each invocation of a supplied callback. The `'loop` definition and its conditional convergence proof in @iteration demonstrate this distinction. The form of a machine-checked proof language remains outside this notation.

#note[
  Annotations are part of the illustrative notation and are not currently supported by HashQL.
]

=== Type assertion <pseudo-assertion>

The `as` form guides type inference or broadens a value's static type. Type assertions are rarely required in HashQL.

#rule("assertion.subtype")[
  In `value as T`, the type inferred for `value` must be a subtype of `T`. The assertion leaves the value unchanged and does not permit unchecked retyping.
]

#syntax("assertion-expression")

```hashql
37 as Number
```

=== Operator <pseudo-operator>

Unary operators use prefix notation, while binary operators use infix notation. Operands may be non-operator expressions or grouped expressions. Nested prefix or infix applications must be parenthesised because this specification defines no precedence hierarchy for these operators. The pipe operator retains the lower precedence defined in @pseudo-pipeline.

#syntax("operator-expression", "operator-operand", "unary-operator", "binary-operator")

#rule("operator.evaluation")[
  Operators evaluate their operands except where short-circuiting applies. Conjunction (`&&`) evaluates its right operand only when the left operand is true. Disjunction (`||`) evaluates its right operand only when the left operand is false.
]

Operators are syntactic sugar for the function invocations below. Symbolic calls such as `+(lhs, rhs)` and `-(value)` use the same operations. Both forms retain the #link("#rule-operator.evaluation")[[operator.evaluation]] rules, including short-circuiting.

#table(
  columns: (auto, 1fr),
  table.header([Operator expression], [Function invocation]),
  [`!value`], [`::core::bool::not(value)`],
  [`-value`], [`::core::math::neg(value)`],
  [`~value`], [`::core::bits::not(value)`],
  [`lhs + rhs`], [`::core::math::add(lhs, rhs)`],
  [`lhs - rhs`], [`::core::math::sub(lhs, rhs)`],
  [`lhs * rhs`], [`::core::math::mul(lhs, rhs)`],
  [`lhs / rhs`], [`::core::math::div(lhs, rhs)`],
  [`lhs % rhs`], [`::core::math::rem(lhs, rhs)`],
  [`lhs %% rhs`, `lhs ⟲ rhs`], [`::core::math::mod(lhs, rhs)`],
  [`lhs ** rhs`, `lhs ↑ rhs`], [`::core::math::pow(lhs, rhs)`],
  [`lhs && rhs`], [`::core::bool::and(lhs, rhs)`],
  [`lhs || rhs`], [`::core::bool::or(lhs, rhs)`],
  [`lhs ^ rhs`], [`::core::bits::xor(lhs, rhs)`],
  [`lhs & rhs`], [`::core::bits::and(lhs, rhs)`],
  [`lhs | rhs`], [`::core::bits::or(lhs, rhs)`],
  [`lhs << rhs`], [`::core::bits::shl(lhs, rhs)`],
  [`lhs >> rhs`], [`::core::bits::shr(lhs, rhs)`],
  [`lhs == rhs`], [`::core::cmp::eq(lhs, rhs)`],
  [`lhs != rhs`], [`::core::cmp::ne(lhs, rhs)`],
  [`lhs < rhs`], [`::core::cmp::lt(lhs, rhs)`],
  [`lhs <= rhs`], [`::core::cmp::lte(lhs, rhs)`],
  [`lhs > rhs`], [`::core::cmp::gt(lhs, rhs)`],
  [`lhs >= rhs`], [`::core::cmp::gte(lhs, rhs)`],
  [`lhs ++ rhs`], [`::core::list::concat(lhs, rhs)`],
  [`value |> func(arg)`], [`func(value, arg)`],
  [`lhs.field`], [`.(lhs, field)`],
  [`lhs[rhs]`], [`[](lhs, rhs)`],
)

==== Pipeline <pseudo-pipeline>

#rule("pipeline.application")[
  The pipe operator `|>` supplies its left operand as the first argument of the call on its right. Any written arguments follow it in their existing order. Pipelines associate to the left.
]

#syntax("pipeline-expression", "pipe-input")

```hashql
foo |> bar(2)
```

This expression is equivalent to `bar(foo, 2)`. The same rule applies to labelled arguments: `foo |> bar(count:)` abbreviates `bar(foo, count: count)`. An empty argument list may be omitted: both `foo |> bar` and `foo |> bar()` are equivalent to `bar(foo)`.

A pipeline is an ordinary expression and may occur wherever an expression is permitted. The pipe operator has lower precedence than calls, other operators and type assertions.

=== Field and index access <pseudo-access>

Field access selects a struct field by name or a tuple element by position. The selector is a constant: an identifier for a struct field or a non-negative integer for a tuple element. A newtype constructed with a payload exposes that value through `.0`. Type checking verifies that the selected field, element or payload exists in the receiver's type.

Index access selects an element from a dynamic container, such as a list or dictionary. Unlike a field selector, the index can be computed from a value expression at run time:

#schematic($bb(e)_1$, "[", $bb(e)_2$, "]")

#syntax("field-expression", "index-expression")

```hashql
person.name
pair.0
people[index]
((name: "Ada"),).0.name
```

Index access on lists and dictionaries returns `Option`: `Some(value)` when the requested element or entry exists, and `None()` otherwise. The iteration examples in @iteration use this result to distinguish successful access from a missing element or key.

Both forms have equivalent special-form calls: `person.name` abbreviates `.(person, name)`, while `people[index]` abbreviates `[](people, index)`.

=== Type notation <pseudo-type>

Type references use paths, with `Integer`, `Number`, `Boolean`, `String` and `Null` naming primitive types. Dynamic collections use the opaque types `List<T^+>` and `Dict<K^0, V^+>`.

#rule("type.variance")[
  Generic type arguments may be covariant (`+`), contravariant (`-`), or invariant (`0`). The variance of a generic type argument is determined by the position in which it appears. Type arguments are covariant by default, whereas closure parameter types are contravariant. HashQL does not currently provide syntax for explicitly specifying variance. Within this specification, variance may be indicated using a superscript: $T^+$ denotes a covariant type argument, $T^-$ denotes a contravariant type argument, and $T^0$ denotes an invariant type argument.
]

#syntax("type", "type-primary", "type-reference", "type-list", "tuple-type", "struct-type", "type-field")

Unions and intersections combine primary types. Nested unions and intersections are permitted when the same operator is used throughout because both operators are associative and commutative. Mixing the operators requires explicit grouping, as in `(T | U) & V`, because this specification defines no precedence between them.

#syntax("union-type", "intersection-type", "closure-type", "generic-type")

Angle brackets declare type parameters on closures and generic types, with optional bounds on each parameter. At a reference site, angle brackets instead supply type arguments. Either list must be nonempty when its angle brackets are present.

#syntax("type-parameters", "type-parameter", "type-arguments")

=== Addendum <pseudo-lexical>

These productions define standalone fragments, literal spellings, trivia and the ABNF core rules used above.

==== Fragments <pseudo-fragments>

An example may contain a complete expression or a sequence of declarations with the final body omitted.

#syntax("fragment", "declaration-block", "declaration")

==== Literal syntax <pseudo-lexical-literals>

#syntax(
  "number-literal",
  "integer-part",
  "fraction",
  "exponent",
  "string-literal",
  "string-character",
  "escape",
  "unicode-escape",
)

==== Trivia <pseudo-whitespace>

#syntax("ws", "gap", "separator", "line-break", "line-comment")

==== Core <pseudo-abnf-core>

#syntax("ALPHA", "DIGIT", "HEXDIG", "DQUOTE", "SP", "HTAB", "CR", "LF", "CRLF")
