# J-Expr Syntax Reference

Complete reference for J-Expr (JSON Expression Language), derived from the parser source code at `libs/@local/hashql/syntax-jexpr/`.

---

## Expression Forms

J-Expr has exactly three top-level expression forms:

| JSON Type | Interpretation |
|-----------|----------------|
| String | Path expression (identifier, qualified path, field/index access) |
| Array | Function call |
| Object | Data constructor (must have `#`-prefixed key) |

---

## Function Calls (Arrays)

A **non-empty array** is always a function call. The first element is the function, and remaining elements are arguments.

### Syntax

```
[function, arg1, arg2, ...]
```

### Positional Arguments

```jsonc
["add", {"#literal": 1}, {"#literal": 2}]
["+", "x", "y"]
["if", "condition", "thenExpr", "elseExpr"]
```

### Labeled Arguments

Two syntaxes for labeled (named) arguments:

**Object syntax** — `{":label": value}`:

```jsonc
["greet", {":name": {"#literal": "Alice"}}, {":age": {"#literal": 30}}]
```

**Shorthand syntax** — `":label"` (passes variable with same name):

```jsonc
["greet", ":name"]  // equivalent to {":name": "name"}
```

### Rules

- Empty array `[]` is **invalid** (not a function call)
- Each labeled argument object must have exactly one key starting with `:`
- The key after `:` must be a valid identifier

---

## Data Constructors (Objects)

Objects represent data constructors using special `#`-prefixed keys.

### Valid Top-Level Keys

| Key | Value Type | Purpose |
|-----|------------|---------|
| `#literal` | JSON primitive | Primitive value |
| `#struct` | Object | Named field record |
| `#list` | Array | Homogeneous list |
| `#tuple` | Array | Heterogeneous tuple |
| `#dict` | Object or Array | Key-value dictionary |
| `#type` | String | Type annotation (combinable with above) |

### Rules

- Empty objects `{}` are **invalid**
- Only one expression key (`#literal`, `#struct`, `#list`, `#tuple`, `#dict`) per object
- `#type` can be combined with any expression key
- Unknown keys cause parse errors

---

## `#literal` — Primitive Values

Wraps JSON primitives as J-Expr values.

### Syntax

```jsonc
{"#literal": <primitive>}
{"#literal": <primitive>, "#type": "<type>"}
```

### Valid Primitives

| JSON Type | Examples |
|-----------|----------|
| Number (integer) | `{"#literal": 42}`, `{"#literal": -100}` |
| Number (float) | `{"#literal": 3.14}`, `{"#literal": 1e10}` |
| String | `{"#literal": "hello"}` |
| Boolean | `{"#literal": true}`, `{"#literal": false}` |
| Null | `{"#literal": null}` |

### Invalid Values

Objects, arrays, and other complex types are **not valid** as `#literal` values:

```jsonc
// INVALID:
{"#literal": {"key": "value"}}  // Use #struct or #dict instead
{"#literal": [1, 2, 3]}         // Use #list or #tuple instead
```

---

## `#struct` — Named Field Records

Creates a struct (record) with named fields.

### Syntax

```jsonc
{"#struct": {<field>: <expr>, ...}}
{"#struct": {...}, "#type": "<type>"}
```

### Examples

```jsonc
{"#struct": {}}                                          // empty struct
{"#struct": {"name": {"#literal": "Alice"}}}             // one field
{"#struct": {
  "name": {"#literal": "Alice"},
  "age": {"#literal": 30},
  "active": {"#literal": true}
}}
{"#struct": {"point": {"#struct": {"x": {"#literal": 0}, "y": {"#literal": 0}}}}}  // nested
```

### Field Name Rules

Field names must be valid identifiers (parsed as identifiers, not arbitrary strings):

- XID_START followed by XID_CONTINUE characters
- Or symbol identifiers

---

## `#list` — Homogeneous Lists

Creates a list of elements (all same type).

### Syntax

```jsonc
{"#list": [<expr>, ...]}
{"#list": [...], "#type": "<type>"}
```

### Examples

```jsonc
{"#list": []}                                            // empty list
{"#list": [{"#literal": 1}, {"#literal": 2}]}            // integers
{"#list": [{"#struct": {"x": {"#literal": 0}}}]}         // list of structs
```

---

## `#tuple` — Heterogeneous Tuples

Creates a tuple with positional elements (can be different types).

### Syntax

```jsonc
{"#tuple": [<expr>, ...]}
{"#tuple": [...], "#type": "<type>"}
```

### Examples

```jsonc
{"#tuple": []}                                           // empty tuple (unit)
{"#tuple": [{"#literal": 1}]}                            // single element
{"#tuple": [{"#literal": 1}, {"#literal": "text"}, {"#literal": true}]}  // mixed types
```

---

## `#dict` — Key-Value Dictionaries

Creates a dictionary mapping keys to values. Supports two formats.

### Object Format (String Keys Only)

```jsonc
{"#dict": {<key>: <expr>, ...}}
```

Keys are converted to string literals:

```jsonc
{"#dict": {"a": {"#literal": 1}, "b": {"#literal": 2}}}
```

### Array Format (Expression Keys)

```jsonc
{"#dict": [[<keyExpr>, <valueExpr>], ...]}
```

Allows arbitrary expressions as keys:

```jsonc
{"#dict": [
  [{"#literal": "key1"}, {"#literal": "value1"}],
  [["computeKey"], {"#literal": "value2"}]
]}
```

### Examples

```jsonc
{"#dict": {}}                    // empty dict (object format)
{"#dict": []}                    // empty dict (array format)
{"#dict": {"x": {"#literal": 1}, "y": {"#literal": 2}}}  // object format
{"#dict": [[{"#literal": true}, {"#literal": 1}]]}      // array format with boolean key
```

---

## `#type` — Type Annotations

Adds a type annotation to any data constructor.

### Syntax

```jsonc
{"#<constructor>": <value>, "#type": "<type>"}
```

### Examples

```jsonc
{"#literal": 42, "#type": "Int"}
{"#literal": "hello", "#type": "String"}
{"#struct": {"name": {"#literal": "Alice"}}, "#type": "Person"}
{"#list": [], "#type": "List<Int>"}
{"#tuple": [{"#literal": 1}, {"#literal": "x"}], "#type": "(Int, String)"}
{"#dict": {}, "#type": "Dict<String, Int>"}
```

---

## String Expressions

Strings are parsed as path expressions with optional access operations.

### Path Syntax

```
path = [rooted] segment ("::" segment)*
rooted = "::"
segment = identifier [generics]
generics = "<" (argument | constraint) ("," (argument | constraint))* ">"
```

### Examples

```jsonc
"x"                              // simple identifier
"myVariable"                     // camelCase identifier
"std::collections::HashMap"      // qualified path
"::graph::head::entities"        // rooted path (absolute)
"Vec<Int>"                       // generic type
"HashMap<String, Vec<Int>>"      // nested generics
"Result<T, E>"                   // multiple type parameters
```

### Access Operations

After a path, you can chain field and index access:

```jsonc
"foo.bar"                        // field access
"foo.0"                          // tuple index (numeric field)
"foo[0]"                         // list/index access
"foo.bar.baz"                    // chained field access
"foo[0][1]"                      // chained index access
"foo.bar[0].baz[1].qux"          // mixed access chain
```

### Underscore Expression

The string `"_"` represents an underscore (wildcard/infer):

```jsonc
"_"                              // underscore expression
```

---

## Identifier Syntax

Identifiers appear in paths, struct fields, and bindings.

### Lexical Identifiers

Unicode XID_START followed by XID_CONTINUE:

```
foo, myVariable, camelCase, 标识符, café
```

### Underscore Identifiers

Start with `_`:

```
_, _temp, _unused
```

### Symbol Identifiers

Punctuation and operator characters:

```
+, -, *, /, <, >, <=, >=, ==, !=, |, &, ^, !, ., ?, @, #, $, %, \, ~, [, ]
```

### Escaped Identifiers

Backtick-wrapped symbols (for disambiguation):

```
`+`, `<=>`, `?`, `§¶†‡`
```

### URL Identifiers

Backtick-wrapped HTTP(S) URLs ending with `/`:

```
`https://example.com/`, `http://api.hash.ai/`
```

---

## Type Syntax

Type annotations are strings with this grammar:

```abnf
infer       = "_"
path-type   = path
tuple       = "()" / "(" type ("," type)+ [","] ")"
struct      = "(:)" / "(" ident ":" type ("," ident ":" type)* [","] ")"
paren       = "(" type ")"
atom        = path-type / tuple / struct / infer / paren
union       = atom ("|" atom)*
intersection = union ("&" union)*
type        = intersection
```

### Type Examples

```
Int                              // simple type path
Option<T>                        // generic type
Result<Value, Error>             // multiple type params
Vec<Option<Int>>                 // nested generics

()                               // empty tuple (unit type)
(Int,)                           // single-element tuple (trailing comma required)
(Int, String, Boolean)           // multi-element tuple

(:)                              // empty struct type
(name: String)                   // single-field struct
(name: String, age: Int)         // multi-field struct

Int | String                     // union type
Int | String | Null              // multi-union

Int & Serializable               // intersection type

_                                // type inference

(Int, String) | Null             // union of tuple
((name: String), Int)            // tuple containing struct
```

### Precedence

1. Atoms (paths, tuples, structs, parenthesized)
2. Union (`|`) — lower precedence
3. Intersection (`&`) — lowest precedence

```
Int & String | Boolean           // parsed as: (Int & String) | Boolean
Int | String & Boolean           // parsed as: Int | (String & Boolean)
```

---

## Special Forms

These are not syntax features but common function patterns:

### `let` — Variable Binding

```jsonc
["let", "<name>", <valueExpr>, <bodyExpr>]
["let", "<name>", "<type>", <valueExpr>, <bodyExpr>]
```

```jsonc
["let", "x", {"#literal": 10}, ["+", "x", {"#literal": 5}]]
["let", "result", "Integer", ["+", "a", "b"], "result"]
```

### `fn` — Function Definition

```jsonc
["fn", <generics>, <params>, <returnType>, <body>]
```

- `generics`: `{"#tuple": []}` or `{"#struct": {"T": "Bound"}}`
- `params`: `{"#struct": {"param": "Type", ...}}`
- `returnType`: type string or `"_"` for inference
- `body`: expression

```jsonc
["fn",
  {"#tuple": []},
  {"#struct": {"a": "Integer", "b": "Integer"}},
  "Integer",
  ["+", "a", "b"]]

["fn",
  {"#struct": {"T": "Number"}},
  {"#struct": {"a": "T", "b": "T"}},
  "Boolean",
  [">=", "a", "b"]]
```

### `if` — Conditional

```jsonc
["if", <condition>, <thenExpr>, <elseExpr>]
```

```jsonc
["if", ["<=", {"#literal": 2}, {"#literal": 3}],
  {"#literal": "yes"},
  {"#literal": "no"}]
```

### `input` — External Input Declaration

```jsonc
["input", "<name>", "<type>"]                    // required input
["input", "<name>", "<type>", <defaultValue>]    // with default
```

```jsonc
["input", "userId", "String"]
["input", "limit", "Integer", {"#literal": 10}]
```

---

## Comments

J-Expr uses JSONC (JSON with Comments):

```jsonc
// Single-line comment
["add", {"#literal": 1}, {"#literal": 2}]

/* Multi-line
   comment */
{"#struct": {
  "name": {"#literal": "Alice"}  // inline comment
}}
```

---

## Complete Examples

### Struct with Field Access

```jsonc
["let", "person",
  {"#struct": {
    "name": {"#literal": "Alice"},
    "age": {"#literal": 30}
  }},
  "person.name"]
```

### List with Index Access

```jsonc
["let", "items",
  {"#list": [{"#literal": 1}, {"#literal": 2}, {"#literal": 3}]},
  "items[0]"]
```

### Tuple with Positional Access

```jsonc
["let", "pair",
  {"#tuple": [{"#literal": "first"}, {"#literal": "second"}]},
  "pair.0"]
```

### Function with Generic Parameter

```jsonc
["let", "max",
  ["fn",
    {"#struct": {"T": "Number"}},
    {"#struct": {"a": "T", "b": "T"}},
    "T",
    ["if", [">=", "a", "b"], "a", "b"]],
  ["max", {"#literal": 10}, {"#literal": 20}]]
```

### Nested Conditional

```jsonc
["if", ["<=", {"#literal": 2}, {"#literal": 3}],
  ["if", ["==", {"#literal": 1}, {"#literal": 1}],
    {"#literal": "both true"},
    {"#literal": "outer true, inner false"}],
  {"#literal": "outer false"}]
```

### Graph Query Pattern

```jsonc
["::graph::tail::collect",
  ["::graph::body::filter",
    ["::graph::head::entities",
      ["input", "axis", "::graph::QueryTemporalAxes"]],
    ["fn",
      {"#tuple": []},
      {"#struct": {"vertex": "_"}},
      "_",
      ["==", "vertex.id.entity_uuid", {"#literal": "..."}]]]]
```

---

## Error Cases

### Invalid: Empty Array

```jsonc
[]  // ERROR: empty array is not a valid function call
```

### Invalid: Empty Object

```jsonc
{}  // ERROR: empty object is not valid
```

### Invalid: Unknown Key

```jsonc
{"unknown": 42}  // ERROR: expected #literal, #struct, etc.
```

### Invalid: Multiple Expression Keys

```jsonc
{"#literal": 42, "#list": []}  // ERROR: only one expression key allowed
```

### Invalid: Non-Primitive in #literal

```jsonc
{"#literal": {"nested": "object"}}  // ERROR: expected primitive value
```

### Invalid: Missing Colon in Labeled Arg

```jsonc
{"name": {"#literal": "Alice"}}  // ERROR in call context: labels must start with :
```

---

## Parser Implementation

The J-Expr parser is implemented at:

- `libs/@local/hashql/syntax-jexpr/src/`
- Lexer: `src/lexer/` — tokenizes JSON with comments
- Parser: `src/parser/` — builds AST from tokens
- String parser: `src/parser/string/` — parses path/type expressions in strings

Test files with real examples:

- `libs/@local/hashql/*/tests/ui/**/*.jsonc`
