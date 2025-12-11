# J-Expr Syntax Reference

Core syntax reference for J-Expr, the JSON expression syntax for HashQL.

## Expression Types

J-Expr maps JSON types to expression semantics:

| JSON Type | J-Expr Meaning |
|-----------|----------------|
| String | Path/identifier |
| Array | Function call |
| Object | Data constructor (with `#` keys) |

## Paths (String Expressions)

Strings are parsed as paths or identifiers.

### Simple Identifiers

```jsonc
"x"
"myVariable"
"entity"
```

### Dotted Paths

Access nested fields:

```jsonc
"vertex.id"
"vertex.id.entity_id"
"entity.properties.name"
```

### Namespaced Paths

Use `::` for namespacing:

```jsonc
"Std::String"
"Std::Collections::HashMap"
```

**Rooted paths** start with `::` (absolute reference):

```jsonc
"::core::types::String"
"::graph::head::entities"
"::graph::tmp::decision_time_now"
```

## Function Calls (Array Expressions)

Arrays represent function calls: `[function, arg1, arg2, ...]`

### Basic Calls

```jsonc
["add", {"#literal": 1}, {"#literal": 2}]
["not", {"#literal": true}]
["concat", {"#literal": "hello"}, {"#literal": " world"}]
```

### Namespaced Functions

```jsonc
["::graph::head::entities", ["::graph::tmp::decision_time_now"]]
["::core::math::sqrt", {"#literal": 16}]
```

### Nested Calls

```jsonc
["add", 
  ["multiply", {"#literal": 2}, {"#literal": 3}],
  {"#literal": 4}]
```

### Labeled Arguments

Use `:` prefix for named/labeled arguments.

**Object syntax:**

```jsonc
["greet", {":name": {"#literal": "Alice"}, ":greeting": {"#literal": "Hello"}}]
```

**Shorthand string syntax:**

```jsonc
["func", ":varName"]  // References variable "varName" as labeled argument
```

## Operators

### Comparison

```jsonc
["==", "left", "right"]
["!=", "left", "right"]
[">", {"#literal": 5}, {"#literal": 3}]
["<", "a", "b"]
[">=", "x", {"#literal": 0}]
["<=", "y", {"#literal": 100}]
```

### Logical

```jsonc
["and", {"#literal": true}, {"#literal": false}]
["or", "condition1", "condition2"]
["not", "flag"]
```

### Arithmetic

```jsonc
["add", {"#literal": 1}, {"#literal": 2}]
["sub", {"#literal": 5}, {"#literal": 3}]
["multiply", {"#literal": 2}, {"#literal": 3}]
["div", {"#literal": 10}, {"#literal": 2}]
```

## Graph Query Patterns

### Fetching Entities

```jsonc
["::graph::head::entities", ["::graph::tmp::decision_time_now"]]
```

### Filtering

```jsonc
["filter", "entities",
  ["fn", {"#tuple": []}, {"#struct": {"entity": "_"}}, "_",
    ["==", "entity.draft_id", {"#literal": null}]]]
```

### Property Access

Use dotted paths:

```jsonc
"vertex.id.entity_id"
"entity.properties.name"
```

## Complete Examples

### Entity Query with Filter

```jsonc
["let", "entities",
  ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
  ["filter", "entities",
    ["fn", {"#tuple": []}, {"#struct": {"e": "_"}}, "_",
      ["==", "e.archived", {"#literal": false}]]]]
```

### Nested Conditional

```jsonc
["let", "value", {"#literal": 42},
  ["if", [">", "value", {"#literal": 0}],
    ["if", ["<", "value", {"#literal": 100}],
      {"#literal": "in range"},
      {"#literal": "too high"}],
    {"#literal": "too low"}]]
```

### Multiple Variable Bindings

```jsonc
["let", "x", {"#literal": 1},
  ["let", "y", {"#literal": 2},
    ["let", "z", ["add", "x", "y"],
      ["multiply", "z", {"#literal": 2}]]]]
```

## See Also

- [Special Forms](special-forms.md) - Control flow (`if`, `let`, `fn`, `type`, `use`, etc.)
- [Data Constructors](data-constructors.md) - Typed data (`#literal`, `#struct`, `#tuple`, `#list`, `#dict`)
- [Type DSL](type-dsl.md) - Type annotation syntax

## Source Files

- Expression parser: `libs/@local/hashql/syntax-jexpr/src/parser/`
- String/path parser: `libs/@local/hashql/syntax-jexpr/src/parser/string/`
- Array parser: `libs/@local/hashql/syntax-jexpr/src/parser/array/`
