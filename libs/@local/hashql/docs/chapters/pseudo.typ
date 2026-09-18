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

#import "../template/grammar.typ": grammar
#import "../template/lib.typ": schematic

#let definitions = json("../syntax/pseudo-grammar.json")
#let lexical-tokens = ("IDENTIFIER", "NUMBER_LITERAL", "STRING_LITERAL")
#let syntax(..names) = grammar(definitions, names.pos(), tokens: lexical-tokens)

The following extended BNF (EBNF) defines the notation used in specification examples. Its expression forms follow the high-level intermediate representation (HIR) pretty-printer, with readable names in place of compiler-assigned identifiers. The grammar presentation adapts the Rust Reference's distinction between terminals, productions and repetition operators @rust-reference-notation.

=== Grammar notation <pseudo-grammar-notation>

A production associates a name with its permitted forms through `::=`. Monospace text denotes a terminal, linked names denote productions or lexical tokens, and adjacent items form a sequence. The following operators extend BNF with optional and repeated groups:

#table(
  columns: (auto, 1fr),
  table.header([Notation], [Meaning]),
  [`x y`], [A sequence containing `x` followed by `y`.],
  [`x | y`], [Either `x` or `y`.],
  [`x?`], [Zero or one occurrence of `x`.],
  [`x*`], [Zero or more occurrences of `x`.],
  [`x+`], [One or more occurrences of `x`.],
  [`(x)`], [A group in the grammar, rather than a literal parenthesis.],
)

Postfix repetition binds more tightly than sequence, and sequence binds more tightly than alternation. Alternatives describe permitted forms without prescribing a parser's choice order. Each production has an expandable railroad diagram: rounded rectangles denote terminals, square rectangles denote references, bypass paths denote optionality, and return paths denote repetition.

The expression metavariables from @pseudo-conventions can occur inside schematic code:

#schematic("let x = ", $bb(e)_1$, " in ", $bb(e)_2$)

The two metavariables stand for complete expressions rather than identifier tokens. Ordinary code examples retain their literal spelling, including underscores in identifiers and strings.

The lexical tokens below describe readable example text. Whitespace and `//` comments may separate tokens, but do not occur inside an identifier or number. Input prefixes and type-argument lists adjoin the names they qualify: `$limit`, `?limit` and `f<T>`.

#table(
  columns: (auto, 1fr),
  table.header([Token], [Spelling]),
  [#html.span(id: "grammar-IDENTIFIER")[`IDENTIFIER`]],
  [An ASCII letter or `_`, followed by ASCII letters, digits or `_`. The words `let`, `in`, `if`, `then`, `else`, `thunk`, `as`, `true`, `false` and `null` are excluded.],
  [#html.span(id: "grammar-NUMBER_LITERAL")[`NUMBER_LITERAL`]],
  [A decimal integer part, optionally followed by a fractional part and an exponent. The integer part is `0` or a nonzero digit followed by digits; the fractional part is `.` followed by digits; the exponent is `e` or `E`, an optional sign, and digits. A leading minus is a unary operator.],
  [#html.span(id: "grammar-STRING_LITERAL")[`STRING_LITERAL`]],
  [A double-quoted string containing printable ASCII characters other than `"` and `\`, or escape sequences. Escapes are `\t`, `\r`, `\n`, `\'`, `\"`, `\\` and `\u{h}`, where `h` is one to six hexadecimal digits denoting a Unicode scalar value.],
)

The identifier alphabet is a readability convention for this notation, not a restriction on frontend names. String escapes retain the printer's display convention. Literal compiler-output excerpts may contain diagnostic spellings outside these lexical tokens.

=== Expressions <pseudo-expressions>

An expression is a binding, conditional, closure, thunk, graph read or operation. Operands combine a primary expression with field access, index access or calls. Parentheses admit an arbitrary expression in a primary position: `(if test then left else right).name` uses a conditional as its receiver.

#syntax("Expression", "Operand", "PrimaryExpression", "GroupedExpression")

=== Literals and aggregates <pseudo-values>

Aggregate delimiters distinguish positional elements, named fields and key-value pairs. The empty struct is `(:)`, the empty tuple is `()`, and a single-element tuple retains its comma. Other comma-separated forms omit a trailing comma, as in the printer's output.

#syntax(
  "LiteralExpression",
  "ExpressionList",
  "TupleExpression",
  "StructExpression",
  "FieldInitializer",
  "ListExpression",
  "DictionaryExpression",
  "DictionaryEntry",
)

```hashql
(name: "Ada", active: true)
{"Ada": 37, "Grace": 40}
[2, 3, 5]
(2,)
```

=== Names, calls and access <pseudo-calls>

A path is either a local name or a fully qualified name beginning with `::`. A reference can carry type arguments without being called, as in `f<T>`. Postfix forms compose from left to right; `f(x).name` denotes field access on the call result, while `f()` retains an empty value-argument list.

#syntax("ReferenceExpression", "Path", "Postfix", "CallSuffix", "FieldSuffix", "IndexSuffix")

=== Bindings and conditionals <pseudo-bindings>

A `let` expression contains one or more bindings followed by a body. A conditional supplies both branch expressions. Type assertions attach to a binding's value rather than introducing a typed binding pattern.

#syntax("LetExpression", "Binding", "IfExpression")

```hashql
let person = (name: "Ada", age: 37),
    minimum = 18
in
if person.age >= minimum then person.name else "unavailable"
```

=== Closures and thunks <pseudo-closures>

A closure declares typed parameters and a result type before its body. Generic parameters precede the value-parameter list. The distinct `thunk` form retains the printer's keyword instead of sharing the syntax of a zero-parameter closure.

#syntax("ClosureExpression", "ParameterList", "Parameter", "ThunkExpression")

```hashql
<T: Number>(left: T, right: T): T ->
    ::core::math::add<T>(left, right)
```

=== Operators and inputs <pseudo-operations>

An operation takes operands rather than arbitrary ungrouped expressions. Nested operations therefore use parentheses, as in `(x >= lower) && (x < upper)`, without relying on an implicit precedence table. Arithmetic uses qualified calls such as `::core::math::add(x, y)`.

#syntax("OperationExpression", "UnaryOperator", "BinaryOperator", "AssertionOperator")

The assertion spellings distinguish non-forcing `as` from forcing `as!`. Input operations distinguish a required load, a non-required load and a presence test. The grammar states their spelling rather than their runtime failure or conversion behavior.

#syntax("InputExpression")

```hashql
if $exists(limit) then ?limit else (10 as Integer)
```

=== Types <pseudo-types>

Type references use the same path and type-argument notation as expression references. Primitive types have names such as `Boolean`, `Integer`, `Number`, `String` and `Null`; `List<T>` and `Dict<K, V>` use the generic reference form. The standalone terminals `!` and `?` denote the never and unknown types.

#syntax("Type", "TypePrimary", "TypeReference", "TypeList", "TupleType", "StructType", "TypeField")

Unions and intersections contain primary types. Mixing the two operators requires grouping, as in `(T | U) & V`. A closure type gives parameter types without parameter names; a generic type prefixes its body with type parameters.

#syntax("UnionType", "IntersectionType", "ClosureType", "GenericType")

Type parameters can carry bounds. Type arguments supply types at a reference site. Both lists are nonempty when their angle brackets are present.

#syntax("TypeParameters", "TypeParameter", "TypeArguments")

=== Graph reads <pseudo-graph>

A specialized graph read has a head, zero or more filter stages and a collect tail. The `|>` separators belong to these graph stages rather than introducing a general composition operator. Each filter receives an expression, which can be a closure literal or a reference to a predicate.

#syntax("GraphReadExpression", "GraphHead", "GraphFilter", "GraphTail")

The following example abbreviates the entity type as `Entity`, with `axis` standing for the head's temporal-axis argument. The collect tail has no explicit argument list. The pipeline retains the printer's qualified stage names.

```hashql
::graph::head::entities(axis)
|> ::graph::body::filter((entity: Entity): Boolean ->
    !entity.metadata.archived
)
|> ::graph::tail::collect
```

=== Relationship to compiler output <pseudo-diagnostics>

The grammar describes specification examples rather than a lossless serialization of HIR. Examples replace mangled names such as `x:0`, generated locals such as `%0`, generic identifiers such as `?30`, and inference variables such as `_0` with readable names. Distinct binding identities retain distinct names, and opaque representations or substitution annotations appear only when the example discusses them.

The printer receives a structured tree, whereas a written example must expose its own grouping. The grammar therefore requires parentheses around nested operator expressions and compound call or access receivers. Literal compiler-output excerpts retain their original identifiers and formatting instead of being rewritten to satisfy these presentation conventions.
