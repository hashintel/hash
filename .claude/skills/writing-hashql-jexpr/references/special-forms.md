# J-Expr Special Forms Reference

Special forms are syntactic constructs with special evaluation semantics. Unlike regular function calls, special forms control evaluation order and introduce bindings.

## Overview

HashQL has 10 special forms:

| Form | Arity | Purpose |
| ---- | ----- | ------- |
| `if` | 2, 3 | Conditional branching |
| `let` | 3, 4 | Variable binding |
| `fn` | 4 | Function/closure definition |
| `as` | 2 | Type assertion |
| `type` | 3 | Type alias definition |
| `newtype` | 3 | Nominal type wrapper |
| `use` | 3 | Module imports |
| `input` | 2, 3 | Host input declaration |
| `access` | 2 | Field access (alias: `.`) |
| `index` | 2 | Index access (alias: `[]`) |

## if - Conditional

Evaluates condition and branches.

**if/2** - Without else branch (result wrapped in `Option`):

```jsonc
["if", condition, then_expr]
// Returns Option<T>: Some(then_expr) if true, None if false
```

**if/3** - With else branch:

```jsonc
["if", condition, then_expr, else_expr]
```

**Examples:**

```jsonc
// Without else
["if", [">", "x", {"#literal": 0}],
  {"#literal": "positive"}]

// With else
["if", [">", "x", {"#literal": 0}],
  {"#literal": "positive"},
  {"#literal": "non-positive"}]

// Nested conditionals
["if", [">", "value", {"#literal": 0}],
  ["if", ["<", "value", {"#literal": 100}],
    {"#literal": "in range"},
    {"#literal": "too high"}],
  {"#literal": "too low"}]
```

## let - Variable Binding

Binds a value to a name in the body expression. Binds in the **value namespace** only.

**let/3** - Without type annotation:

```jsonc
["let", "name", value_expr, body_expr]
```

**let/4** - With type annotation (equivalent to `let/3` with `["as", value, type]`):

```jsonc
["let", "name", type_expr, value_expr, body_expr]
// Equivalent to: ["let", "name", ["as", value_expr, type_expr], body_expr]
```

**Examples:**

```jsonc
// Simple binding
["let", "x", {"#literal": 10},
  ["add", "x", {"#literal": 5}]]

// With type annotation
["let", "x", "Int", {"#literal": 10},
  ["add", "x", {"#literal": 5}]]

// Nested bindings
["let", "a", {"#literal": 1},
  ["let", "b", {"#literal": 2},
    ["add", "a", "b"]]]

// Binding a computed value
["let", "sum", ["add", {"#literal": 1}, {"#literal": 2}],
  ["multiply", "sum", {"#literal": 3}]]
```

## fn - Function Definition

Defines a closure/function with generic parameters, typed parameters, and return type.

**Syntax:**

```jsonc
["fn", generics, params, return_type, body]
```

**Components:**

- `generics`: Type parameters
  - **Tuple form** `{"#tuple": [...]}`: Unbounded type parameters
  - **Struct form** `{"#struct": {...}}`: Type parameters with bounds (`{name: bound}`)
- `params`: Struct of `{name: type}` pairs (always a struct)
- `return_type`: Type expression or `"_"` for inference
- `body`: Function body expression

**Examples:**

```jsonc
// Simple function, inferred types
["fn", {"#tuple": []}, {"#struct": {"x": "_"}}, "_",
  ["add", "x", {"#literal": 1}]]

// With explicit types
["fn", {"#tuple": []}, {"#struct": {"x": "Int", "y": "Int"}}, "Int",
  ["add", "x", "y"]]

// With generic parameters - tuple form (unbounded)
["fn", {"#tuple": ["T"]}, {"#struct": {"x": "T"}}, "T",
  "x"]

// With generic parameters - struct form (with bounds)
["fn", {"#struct": {"T": "Comparable"}}, {"#struct": {"a": "T", "b": "T"}}, "Boolean",
  [">", "a", "b"]]

// Unbounded in struct form (use "_" for no bound)
["fn", {"#struct": {"T": "_", "U": "Clone"}}, {"#struct": {"x": "T", "y": "U"}}, "_",
  body_expr]

// Filter predicate
["fn", {"#tuple": []}, {"#struct": {"entity": "_"}}, "_",
  ["==", "entity.draft_id", {"#literal": null}]]
```

## as - Type Assertion

Asserts that a value conforms to a type.

**Syntax:**

```jsonc
["as", value_expr, type_expr]
```

**Examples:**

```jsonc
["as", {"#literal": 42}, "Int"]
["as", "some_value", "String"]
["as", ["get_result"], "Option<Int>"]
```

## type - Type Alias

Defines a type alias scoped to the body expression. Binds in the **type namespace** only.

**Syntax:**

```jsonc
["type", "Name<constraints>", type_expr, body]
```

**Examples:**

```jsonc
// Simple alias
["type", "UserId", "String",
  ["let", "id", {"#literal": "abc"}, "id"]]

// Generic alias
["type", "Pair<T>", {"#tuple": ["T", "T"]},
  body_expr]

// With constraints
["type", "ComparablePair<T: Comparable>", {"#tuple": ["T", "T"]},
  body_expr]
```

## newtype - Nominal Type Wrapper

Creates a new nominal type wrapping an existing type structure. Binds in **both namespaces**:

- Type namespace: The new type itself
- Value namespace: A constructor function

**Syntax:**

```jsonc
["newtype", "Name<constraints>", type_expr, body]
```

**Examples:**

```jsonc
// Simple newtype - brings `UserId` type and `UserId(String)` constructor
["newtype", "UserId", "String",
  ["UserId", {"#literal": "abc-123"}]]  // Use constructor

// Generic newtype
["newtype", "Wrapper<T>", "T",
  body_expr]

// Unit-like newtype (Null value = no-argument constructor)
["newtype", "Marker", "Null",
  ["Marker"]]  // Constructor takes no arguments
```

**Difference from `type`:**

- `type`: Structural alias (type namespace only), types are interchangeable
- `newtype`: Nominal wrapper (both namespaces), creates a distinct type with constructor

## use - Module Import

Imports items from a module path.

**Syntax:**

```jsonc
["use", "path", imports, body]
```

**Import forms:**

- `"*"` - Glob import (all items)
- `{"#tuple": ["name1", "name2"]}` - Named imports
- `{"#struct": {"name": "_", "alias": "original"}}` - Imports with aliases

**Examples:**

```jsonc
// Glob import
["use", "::core::math", "*",
  ["add", {"#literal": 1}, {"#literal": 2}]]

// Named imports (tuple)
["use", "::core::types", {"#tuple": ["String", "Int"]},
  body_expr]

// Named imports with aliases (struct)
["use", "::core::types", {"#struct": {"Str": "String", "Integer": "Int"}},
  body_expr]

// Self-named import
["use", "::graph::head", {"#struct": {"entities": "_"}},
  ["entities", ["::graph::tmp::decision_time_now"]]]
```

## input - Host Input Declaration

Declares an input parameter from the host environment.

**input/2** - Required input:

```jsonc
["input", "name", type_expr]
```

**input/3** - With default value:

```jsonc
["input", "name", type_expr, default_expr]
```

**Examples:**

```jsonc
// Required input
["input", "userId", "String"]

// With default
["input", "limit", "Int", {"#literal": 100}]

// Complex type
["input", "filters", {"#struct": {"status": "String", "active": "Boolean"}}]
```

## access - Field Access

Accesses a field on a value. Alias: `.`

**Syntax:**

```jsonc
["access", value_expr, field]
[".", value_expr, field]
```

**Field types:**

- Identifier: Named field access
- Integer literal: Tuple index access

**Examples:**

```jsonc
// Named field
["access", "entity", "properties"]
[".", "entity", "properties"]

// Tuple index
["access", "pair", {"#literal": 0}]
[".", "tuple", {"#literal": 1}]

// Chained access (typically via path strings)
"entity.properties.name"  // Preferred for chained access
```

## index - Index Access

Accesses an element by index. Alias: `[]`

**Syntax:**

```jsonc
["index", collection_expr, index_expr]
["[]", collection_expr, index_expr]
```

**Shortcut syntax (preferred):** Index access can be embedded in path strings:

```jsonc
"items[0]"              // Literal index
"matrix[i]"             // Variable index
"data[0][1]"            // Chained index
"entity.items[0].name"  // Mixed field and index access
```

**Examples:**

```jsonc
// Prefer shortcut syntax when possible
"items[0]"

// Explicit form for computed indices
["index", "items", ["add", "i", {"#literal": 1}]]

// Mixed access via string
"entity.properties[0].value"
```

## Namespaces

Special forms bind names in different namespaces:

| Form | Value Namespace | Type Namespace |
| ---- | --------------- | -------------- |
| `let` | ✓ | - |
| `type` | - | ✓ |
| `newtype` | ✓ (constructor) | ✓ (type) |
| `use` | ✓ | ✓ |
| `fn` | ✓ (parameters) | ✓ (generics) |

## Common Patterns

### Enum via Newtype Union

Create sum types by combining newtypes with union types:

```jsonc
// Define enum variants as newtypes
["newtype", "None", "Null",
  ["newtype", "Some<T>", "T",
    // Define the Option type as a union
    ["type", "Option<T>", "None | Some<T>",
      // Use the constructors
      ["let", "value", ["Some", {"#literal": 42}],
        ["if", ["==", "value", ["None"]],
          {"#literal": "empty"},
          {"#literal": "has value"}]]]]]
```

### Status Enum Pattern

```jsonc
["newtype", "Pending", "Null",
  ["newtype", "Active", "Null",
    ["newtype", "Completed", "Null",
      ["type", "Status", "Pending | Active | Completed",
        body_expr]]]]
```

### Entity Query with Filter

```jsonc
["let", "entities",
  ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
  ["filter", "entities",
    ["fn", {"#tuple": []}, {"#struct": {"e": "_"}}, "_",
      ["==", "e.archived", {"#literal": false}]]]]
```

### Type-safe Input Processing

```jsonc
["let", "userId", ["input", "userId", "String"],
  ["let", "limit", ["input", "limit", "Int", {"#literal": 50}],
    ["fetch_user_items", "userId", "limit"]]]
```

### Module Import Pattern

```jsonc
["use", "::graph::head", {"#struct": {"entities": "_"}},
  ["use", "::graph::tmp", {"#struct": {"decision_time_now": "_"}},
    ["entities", ["decision_time_now"]]]]
```

## Error Handling

### Argument Count Errors

Each special form has specific arity requirements:

```jsonc
// ✗ Error - if needs 2 or 3 arguments
["if", "condition"]

// ✗ Error - let needs 3 or 4 arguments  
["let", "x", {"#literal": 1}]

// ✗ Error - fn needs exactly 4 arguments
["fn", {"#tuple": []}, {"#struct": {"x": "_"}}]
```

### Labeled Arguments Not Supported

Special forms don't accept labeled arguments:

```jsonc
// ✗ Error - labeled argument in special form
["if", {":condition": "x"}, "then", "else"]
```

### Binding Name Errors

Binding names must be simple identifiers:

```jsonc
// ✗ Error - qualified path as binding name
["let", "module::x", {"#literal": 1}, body]
```

## Source Files

- Definition: `libs/@local/hashql/core/src/module/std_lib/kernel/special_form.rs`
- Lowering: `libs/@local/hashql/ast/src/lowering/special_form_expander/mod.rs`
- Name resolution: `libs/@local/hashql/ast/src/lowering/pre_expansion_name_resolver.rs`
