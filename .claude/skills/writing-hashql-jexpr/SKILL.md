---
name: writing-hashql-jexpr
description: HashQL J-Expr syntax patterns for writing JSON Expression Language queries. Use when working with J-Expr function calls, data constructors, literals, let bindings, functions, or type annotations.
---

# HashQL J-Expr Syntax

## Purpose

J-Expr (JSON Expression Language) is a syntax for writing HashQL queries using JSON. It supports function calls, data constructors, type annotations, and string-embedded expressions.

## When This Skill Activates

- Writing or reading J-Expr/HashQL queries
- Working with `#literal`, `#struct`, `#list`, `#tuple`, `#dict` constructs
- Defining function calls in JSON array format
- Using paths, operators, or type annotations

---

## Core Syntax

### Expressions

J-Expr has three top-level expression forms:

| Form | Syntax | Purpose |
|------|--------|---------|
| String | `"path::segment"` | Path expressions, identifiers, field access |
| Array | `[fn, arg1, arg2]` | Function calls |
| Object | `{"#literal": value}` | Data constructors with special keys |

---

## Function Calls (Arrays)

**Any non-empty array is a function call.** First element is the callee; rest are arguments.

```jsonc
["+", {"#literal": 1}, {"#literal": 2}]      // 1 + 2
["if", "cond", "thenExpr", "elseExpr"]       // conditional
["let", "x", {"#literal": 10}, "x"]          // let binding
```

### Labeled Arguments

Use `{":name": value}` or shorthand `":name"`:

```jsonc
["greet", {":name": {"#literal": "Alice"}}]  // labeled argument
["greet", ":name"]                            // shorthand: passes `name` variable as :name
```

---

## Data Constructors (Objects)

Objects use special `#`-prefixed keys. Empty objects are invalid.

### `#literal` — Primitive Values

```jsonc
{"#literal": 42}              // integer
{"#literal": 3.14}            // float
{"#literal": "hello"}         // string
{"#literal": true}            // boolean
{"#literal": null}            // null
```

### `#struct` — Named Fields

```jsonc
{"#struct": {"name": {"#literal": "Alice"}, "age": {"#literal": 30}}}
{"#struct": {}}               // empty struct allowed
```

### `#list` — Homogeneous Sequence

```jsonc
{"#list": [{"#literal": 1}, {"#literal": 2}, {"#literal": 3}]}
{"#list": []}                 // empty list allowed
```

### `#tuple` — Heterogeneous Sequence

```jsonc
{"#tuple": [{"#literal": 1}, {"#literal": "text"}, {"#literal": true}]}
{"#tuple": []}                // empty tuple allowed
```

### `#dict` — Key-Value Mapping

Object format (string keys only):

```jsonc
{"#dict": {"key1": {"#literal": "value1"}, "key2": {"#literal": 42}}}
```

Array format (expression keys):

```jsonc
{"#dict": [[{"#literal": "key1"}, {"#literal": "value1"}],
           [{"#literal": "key2"}, {"#literal": 42}]]}
```

### `#type` — Type Annotation

Combine with any data constructor:

```jsonc
{"#literal": 42, "#type": "Int"}
{"#struct": {"name": {"#literal": "Alice"}}, "#type": "Person"}
{"#list": [], "#type": "List<Int>"}
```

---

## String Expressions (Paths & Access)

Bare strings are parsed as path expressions with optional access chains:

```jsonc
"x"                    // simple identifier
"std::collections"     // qualified path
"::graph::head"        // rooted path (starts with ::)
"foo.bar"              // field access
"foo.0"                // tuple index access
"foo[0]"               // list/index access
"foo.bar[0].baz"       // chained access
"_"                    // underscore (ignored/infer)
```

### Identifiers

| Type | Pattern | Examples |
|------|---------|----------|
| Lexical | XID_START + XID_CONTINUE | `foo`, `myVar`, `标识符` |
| Underscore | `_` + XID_CONTINUE | `_`, `_temp`, `_unused` |
| Symbol | Punctuation chars | `+`, `-`, `<=`, `>=`, `==` |
| Escaped | `` `symbol` `` | `` `+` ``, `` `<=>` `` |
| URL | `` `https://.../ `` | `` `https://example.com/` `` |

---

## Type Syntax

Types are strings parsed with this grammar:

```
atom       = path | "_" | tuple | struct
tuple      = "()" | "(" type "," ... ")"
struct     = "(:)" | "(" name ":" type "," ... ")"
union      = atom ("|" atom)*
intersection = union ("&" union)*
type       = intersection
```

### Examples

```
Int                          // simple type
Option<T>                    // generic
(Int, String)                // tuple type
(name: String, age: Int)     // struct type
Int | String                 // union
Int & Serializable           // intersection
_                            // infer
```

---

## Special Forms

### `let` — Variable Binding

```jsonc
["let", "name", valueExpr, bodyExpr]
["let", "x", "Type", valueExpr, bodyExpr]   // with type annotation
```

### `fn` — Function Definition

```jsonc
["fn", generics, params, returnType, body]
// generics: {"#tuple": []} or {"#struct": {"T": "Number"}}
// params: {"#struct": {"a": "Int", "b": "Int"}}
// returnType: "Int" or "_"
// body: expression
```

Example:

```jsonc
["fn",
  {"#tuple": []},
  {"#struct": {"a": "Integer", "b": "Integer"}},
  "_",
  ["if", ["<=", "a", "b"], "b", "a"]]
```

### `if` — Conditional

```jsonc
["if", condition, thenExpr, elseExpr]
```

### `input` — External Input

```jsonc
["input", "name", "Type"]                    // required
["input", "name", "Type", defaultValue]      // with default
```

---

## Examples

### Arithmetic with Let

```jsonc
["let", "x", {"#literal": 10},
  ["let", "y", {"#literal": 5},
    ["+", "x", "y"]]]
```

### Conditional

```jsonc
["if", ["<=", {"#literal": 2}, {"#literal": 3}],
  {"#literal": "yes"},
  {"#literal": "no"}]
```

### Struct Field Access

```jsonc
["let", "person",
  {"#struct": {"name": {"#literal": "Alice"}, "age": {"#literal": 30}}},
  "person.name"]
```

### Function Definition and Call

```jsonc
["let", "double",
  ["fn", {"#tuple": []}, {"#struct": {"x": "Integer"}}, "Integer",
    ["*", "x", {"#literal": 2}]],
  ["double", {"#literal": 5}]]
```

---

## Key Rules

✅ **DO:**

- Use `{"#literal": value}` for all primitive values
- Use arrays `[fn, args...]` for function calls
- Use `#`-prefixed keys for data constructors
- Use strings for paths and identifiers

❌ **DON'T:**

- Use bare JSON values as expressions (no `42`, use `{"#literal": 42}`)
- Use empty arrays `[]` as function calls (empty array is invalid)
- Use unknown keys in objects (only `#literal`, `#struct`, etc.)
- Mix `#`-key types in one object (no `{"#literal": 1, "#list": []}`)

---

## Related Resources

- [Syntax Reference](resources/syntax-reference.md) — comprehensive grammar and details
- `libs/@local/hashql/syntax-jexpr/` — parser implementation
