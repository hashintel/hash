---
name: writing-hashql-jexpr
description: 'HashQL J-Expr syntax for writing queries. Use when writing J-Expr code, using #literal/#struct/#list constructs, understanding function call syntax, or working with HashQL query files (.jsonc).'
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - J-Expr
      - jexpr
      - hashql query
      - hashql syntax
      - "#literal"
      - "#struct"
      - "#list"
      - "#tuple"
    intent-patterns:
      - "\\b(write|read|create|parse)\\b.*?\\b(j-?expr|hashql)\\b"
      - "\\b(hashql|jexpr)\\b.*?\\b(query|syntax|expression)\\b"
---

# Writing HashQL J-Expr

J-Expr is a JSON-based expression syntax for HashQL. It represents typed expressions using JSON primitives.

## Expression Types

J-Expr has three expression types:

| JSON Type | J-Expr Meaning |
| --------- | -------------- |
| String | Path/identifier/symbol |
| Array | Function call |
| Object | Data constructor (with `#` keys) |

## Paths (Strings)

Strings are parsed as paths or identifiers:

```jsonc
"x"                           // Simple variable
"vertex.id.entity_id"         // Dotted path access
"::core::types::String"       // Namespaced/rooted path
"::graph::head::entities"     // Graph function path
```

## Function Calls (Arrays)

Arrays represent function calls: `[function, arg1, arg2, ...]`

```jsonc
// Basic function call
["add", {"#literal": 1}, {"#literal": 2}]

// Namespaced function
["::graph::head::entities", ["::graph::tmp::decision_time_now"]]

// Labeled argument with :prefix in object
["greet", {":name": {"#literal": "Alice"}}]

// Shorthand labeled argument (string with :prefix)
["func", ":name"]
```

## Data Constructors (Objects with # Keys)

Objects with special `#` keys construct data:

| Key | Purpose | Example |
| --- | ------- | ------- |
| `#literal` | Primitive values | `{"#literal": 42}` |
| `#struct` | Named fields | `{"#struct": {"x": ...}}` |
| `#list` | Variable-size ordered | `{"#list": [...]}` |
| `#tuple` | Fixed-size ordered | `{"#tuple": [...]}` |
| `#dict` | Key-value map | `{"#dict": {"k": ...}}` |
| `#type` | Type annotation | Used with other keys |

### Literals

```jsonc
{"#literal": 42}
{"#literal": "hello"}
{"#literal": true}
{"#literal": null}
{"#literal": 3.14, "#type": "Float"}
```

### Struct

```jsonc
{"#struct": {"name": {"#literal": "Alice"}, "age": {"#literal": 30}}}
{"#struct": {"x": {"#literal": 1}}, "#type": "Point"}
```

### List and Tuple

```jsonc
{"#list": [{"#literal": 1}, {"#literal": 2}]}
{"#tuple": [{"#literal": 1}, {"#literal": "text"}]}
```

### Dict

```jsonc
{"#dict": {"key": {"#literal": "value"}}}
```

## Common Patterns

### Let Binding

```jsonc
["let", "varName", {"#literal": 10}, ["add", "varName", {"#literal": 5}]]
```

### Function Definition

```jsonc
["fn", {"#tuple": []}, {"#struct": {"vertex": "_"}}, "_", body_expr]
```

### Conditionals

```jsonc
["if", condition_expr, then_expr, else_expr]
```

### Comparison

```jsonc
["==", "left", "right"]
[">", {"#literal": 5}, {"#literal": 3}]
```

## Do

- Use `#literal` for all primitive values (numbers, strings, booleans, null)
- Use `::` prefix for namespaced paths
- Use `:` prefix for labeled arguments
- Combine `#type` with other constructors for type annotations

## Don't

- Don't use bare JSON numbers/booleans - wrap in `{"#literal": ...}`
- Don't confuse `#list` (variable-size) with `#tuple` (fixed-size)
- Don't use `#` prefix for labeled arguments (use `:`)
- Don't nest `#` keys incorrectly - each object should have one primary `#` key

## Examples

**Entity query:**

```jsonc
["::graph::head::entities", ["::graph::tmp::decision_time_now"]]
```

**Filtering with comparison:**

```jsonc
["filter", "entities", 
  ["fn", {"#tuple": []}, {"#struct": {"entity": "_"}}, "_",
    ["==", "entity.draft_id", {"#literal": null}]]]
```

**Struct with type:**

```jsonc
{"#struct": {"value": {"#literal": 100}}, "#type": "Amount"}
```

## References

- [Syntax Reference](references/syntax-reference.md) - Paths, function calls, operators
- [Special Forms](references/special-forms.md) - Language constructs (`if`, `let`, `fn`, `type`, `use`, etc.)
- [Data Constructors](references/data-constructors.md) - Typed data (`#literal`, `#struct`, `#tuple`, `#list`, `#dict`, `#type`)
- [Type DSL](references/type-dsl.md) - Embedded type annotation syntax
- Parser: `libs/@local/hashql/syntax-jexpr/src/parser/`
- Object forms: `libs/@local/hashql/syntax-jexpr/src/parser/object/`
- Type DSL: `libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs`
