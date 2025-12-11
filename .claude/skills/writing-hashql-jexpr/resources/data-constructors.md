# J-Expr Data Constructors Reference

Data constructors are JSON objects with `#` prefixed keys that construct typed data values in J-Expr.

## Overview

| Special Form | Purpose                          | Value Type           |
| ------------ | -------------------------------- | -------------------- |
| `#literal`   | Primitive values                 | JSON primitive       |
| `#struct`    | Named fields (record)            | JSON object          |
| `#tuple`     | Fixed-size ordered collection    | JSON array           |
| `#list`      | Variable-size ordered collection | JSON array           |
| `#dict`      | Key-value map                    | JSON object or array |
| `#type`      | Type annotation (modifier)       | String (type DSL)    |

## #literal - Primitive Values

Wraps JSON primitives (numbers, strings, booleans, null) as typed expressions.

**Syntax:**

```jsonc
{"#literal": <json-primitive>}
{"#literal": <json-primitive>, "#type": "<type>"}
```

**Accepted primitives:**

- Numbers: integers and floats
- Strings: quoted text
- Booleans: `true` / `false`
- Null: `null`

**Examples:**

```jsonc
{"#literal": 42}
{"#literal": 3.14}
{"#literal": "hello world"}
{"#literal": true}
{"#literal": null}
{"#literal": 42, "#type": "Int64"}
{"#literal": "2024-01-01", "#type": "Date"}
```

**Important:** Never use bare JSON primitives. Always wrap in `#literal`:

```jsonc
// ✗ Wrong - bare number
["add", 1, 2]

// ✓ Correct - wrapped literals
["add", {"#literal": 1}, {"#literal": 2}]
```

## #struct - Named Fields

Creates a record/struct with named fields. Keys are parsed as identifiers.

**Syntax:**

```jsonc
{"#struct": {<field>: <expr>, ...}}
{"#struct": {<field>: <expr>, ...}, "#type": "<type>"}
```

**Field names:** Must be valid identifiers (parsed by `parse_ident`). Snake_case and camelCase are valid.

**Examples:**

```jsonc
// Simple struct
{"#struct": {"name": {"#literal": "Alice"}, "age": {"#literal": 30}}}

// Empty struct
{"#struct": {}}

// With type annotation
{"#struct": {"x": {"#literal": 10}, "y": {"#literal": 20}}, "#type": "Point"}

// Nested structs
{"#struct": {
  "user": {"#struct": {"name": {"#literal": "Bob"}}},
  "role": {"#literal": "admin"}
}}

// With function call values
{"#struct": {
  "sum": ["add", {"#literal": 1}, {"#literal": 2}]
}}
```

**Invalid field names:**

```jsonc
// ✗ Wrong - numeric prefix
{"#struct": {"123field": {"#literal": 1}}}

// ✗ Wrong - hyphenated
{"#struct": {"my-field": {"#literal": 1}}}
```

## #tuple - Fixed-Size Ordered Collection

Creates a fixed-size ordered collection. Each position has a distinct type.

**Syntax:**

```jsonc
{"#tuple": [<expr>, ...]}
{"#tuple": [<expr>, ...], "#type": "<type>"}
```

**Examples:**

```jsonc
// Empty tuple (unit type)
{"#tuple": []}

// Pair
{"#tuple": [{"#literal": 1}, {"#literal": "text"}]}

// Triple
{"#tuple": [{"#literal": 1}, {"#literal": "a"}, {"#literal": true}]}

// With type annotation
{"#tuple": [{"#literal": 10}, {"#literal": "hello"}], "#type": "(Int, String)"}

// Nested tuples
{"#tuple": [
  {"#tuple": [{"#literal": 1}, {"#literal": 2}]},
  {"#literal": 3}
]}
```

**Use cases:**

- Return multiple values of different types
- Function parameters
- Coordinates/pairs
- Type parameters (often empty `{"#tuple": []}`)

## #list - Variable-Size Ordered Collection

Creates a homogeneous, variable-size collection. All elements share the same type.

**Syntax:**

```jsonc
{"#list": [<expr>, ...]}
{"#list": [<expr>, ...], "#type": "<type>"}
```

**Examples:**

```jsonc
// Empty list
{"#list": []}

// Numbers
{"#list": [{"#literal": 1}, {"#literal": 2}, {"#literal": 3}]}

// Empty list with type
{"#list": [], "#type": "List<Int>"}

// List of structs
{"#list": [
  {"#struct": {"id": {"#literal": 1}}},
  {"#struct": {"id": {"#literal": 2}}}
]}
```

**#list vs #tuple:**

- `#list`: Variable size, homogeneous types
- `#tuple`: Fixed size, heterogeneous types

```jsonc
// List of integers (any length, all Int)
{"#list": [{"#literal": 1}, {"#literal": 2}]}

// Tuple of (Int, String) - exactly 2 elements, different types
{"#tuple": [{"#literal": 1}, {"#literal": "a"}]}
```

## #dict - Key-Value Map

Creates a dictionary/map. Supports two formats: object format and array format.

### Object Format

Keys are always strings. Convenient for string-keyed maps.

**Syntax:**

```jsonc
{"#dict": {"<key>": <expr>, ...}}
```

**Examples:**

```jsonc
// Empty dict
{"#dict": {}}

// String keys
{"#dict": {
  "key1": {"#literal": "value1"},
  "key2": {"#literal": 42}
}}

// With type
{"#dict": {"name": {"#literal": "Alice"}}, "#type": "Dict<String, String>"}
```

### Array Format

Allows arbitrary expressions as keys. Each entry is `[key, value]`.

**Syntax:**

```jsonc
{"#dict": [[<key-expr>, <value-expr>], ...]}
```

**Examples:**

```jsonc
// Empty dict
{"#dict": []}

// Key-value pairs
{"#dict": [
  [{"#literal": "key1"}, {"#literal": "value1"}],
  [{"#literal": "key2"}, {"#literal": 42}]
]}

// Complex keys (computed)
{"#dict": [
  [["concat", {"#literal": "pre"}, {"#literal": "fix"}], {"#literal": "value"}]
]}
```

**When to use each:**

- **Object format:** Simple string keys, more readable
- **Array format:** Non-string keys, computed keys, complex key expressions

## #type - Type Annotation

Modifies other special forms to specify an explicit type. Uses the embedded type DSL.

**Syntax:** Always paired with another special form:

```jsonc
{"#literal": <value>, "#type": "<type>"}
{"#struct": {...}, "#type": "<type>"}
{"#tuple": [...], "#type": "<type>"}
{"#list": [...], "#type": "<type>"}
{"#dict": ..., "#type": "<type>"}
```

**Examples:**

```jsonc
{"#literal": 42, "#type": "Int64"}
{"#literal": 3.14, "#type": "Float"}
{"#struct": {"x": {"#literal": 0}}, "#type": "Origin"}
{"#list": [], "#type": "List<String>"}
{"#tuple": [], "#type": "()"}
{"#dict": {}, "#type": "Dict<String, Int>"}
```

See [type-dsl.md](type-dsl.md) for complete type syntax.

## Common Patterns

### Function Parameters

Empty tuple for type params, struct for named params:

```jsonc
["fn", {"#tuple": []}, {"#struct": {"x": "_"}}, "_", body_expr]
```

### Let Binding

```jsonc
["let", "varName", {"#literal": 10}, body_expr]
```

### Conditional

```jsonc
["if", condition, {"#literal": "then"}, {"#literal": "else"}]
```

### Entity Filtering

```jsonc
["filter", "entities",
  ["fn", {"#tuple": []}, {"#struct": {"e": "_"}}, "_",
    ["==", "e.archived", {"#literal": false}]]]
```

## Error Handling

### Duplicate Keys

Only one primary `#` key allowed:

```jsonc
// ✗ Error - duplicate primary key
{"#literal": 42, "#literal": 24}
```

### Empty Object

Empty objects are invalid:

```jsonc
// ✗ Error - must have a # key
{}
```

### Unknown Keys

Regular keys not allowed in special form objects:

```jsonc
// ✗ Error - unknown key
{"#literal": 42, "extra": "value"}
```

### Invalid Values

Each special form expects specific value types:

```jsonc
// ✗ Error - #literal expects primitive, not object
{"#literal": {"nested": "object"}}

// ✗ Error - #struct expects object, not array
{"#struct": ["not", "an-object"]}
```

## Source Files

- Parser entry: `libs/@local/hashql/syntax-jexpr/src/parser/object/initial.rs`
- Literal: `libs/@local/hashql/syntax-jexpr/src/parser/object/literal.rs`
- Struct: `libs/@local/hashql/syntax-jexpr/src/parser/object/struct.rs`
- Tuple: `libs/@local/hashql/syntax-jexpr/src/parser/object/tuple.rs`
- List: `libs/@local/hashql/syntax-jexpr/src/parser/object/list.rs`
- Dict: `libs/@local/hashql/syntax-jexpr/src/parser/object/dict.rs`
- Type: `libs/@local/hashql/syntax-jexpr/src/parser/object/type.rs`
