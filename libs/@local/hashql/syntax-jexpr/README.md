# hashql-syntax-jexpr

J-Expr (JSON Expression Language) is a JSON-based syntax for writing HashQL queries. It represents typed expressions using JSON primitives.

## Expression Types

J-Expr maps JSON types to expression semantics:

| JSON Type | J-Expr Meaning |
| --------- | -------------- |
| String | Path/identifier |
| Array | Function call |
| Object | Data constructor (with `#` keys) |

## Paths (Strings)

Strings are parsed as paths or identifiers:

```jsonc
"x"                           // Simple variable
"vertex.id.entity_id"         // Dotted path access
"::core::types::String"       // Namespaced/rooted path
```

### Symbol Grammar

```abnf
symbol = symbol-safe / operator
symbol-safe = regular / ignore / operatorSafe

regular = XID_START *XID_CONTINUE
ignore = "_" *XID_CONTINUE

operator = "+" / "-" / "*" / "/" / "|" / "&" / "^" / "==" / "!=" / ">" / ">=" / "<" / "<="
operatorSafe = "`" operator "`"
```

## Function Calls (Arrays)

Arrays represent function calls: `[function, arg1, arg2, ...]`

```jsonc
["add", {"#literal": 1}, {"#literal": 2}]
["::graph::head::entities", ["::graph::tmp::decision_time_now"]]
```

### Labeled Arguments

Use `:` prefix for named arguments:

```jsonc
["greet", {":name": {"#literal": "Alice"}}]
["func", ":varName"]  // Shorthand: references variable as labeled argument
```

## Data Constructors (Objects with # Keys)

Objects with special `#` keys construct typed data:

| Key | Purpose | Example |
| --- | ------- | ------- |
| `#literal` | Primitive values | `{"#literal": 42}` |
| `#struct` | Named fields | `{"#struct": {"x": ...}}` |
| `#list` | Variable-size ordered | `{"#list": [...]}` |
| `#tuple` | Fixed-size ordered | `{"#tuple": [...]}` |
| `#dict` | Key-value map | `{"#dict": {"k": ...}}` |
| `#type` | Type annotation | Used with other keys |

### Examples

```jsonc
// Literals
{"#literal": 42}
{"#literal": "hello"}
{"#literal": 3.14, "#type": "Float"}

// Struct with type
{"#struct": {"name": {"#literal": "Alice"}}, "#type": "Person"}

// List and tuple
{"#list": [{"#literal": 1}, {"#literal": 2}]}
{"#tuple": [{"#literal": 1}, {"#literal": "text"}]}
```

**Important:** Use `#literal` for all primitive values—bare JSON numbers/booleans are not allowed.

## Special Forms

Special forms are syntactic constructs with special evaluation semantics:

| Form | Arity | Purpose |
| ---- | ----- | ------- |
| `if` | 2, 3 | Conditional branching |
| `let` | 3, 4 | Variable binding |
| `fn` | 4 | Function definition |
| `as` | 2 | Type assertion |
| `type` | 3 | Type alias definition |
| `newtype` | 3 | Nominal type wrapper |
| `use` | 3 | Module imports |
| `input` | 2, 3 | Host input declaration |
| `access` / `.` | 2 | Field access |
| `index` / `[]` | 2 | Index access |

### Common Patterns

```jsonc
// Let binding
["let", "x", {"#literal": 10}, ["add", "x", {"#literal": 5}]]

// Function definition
["fn", {"#tuple": []}, {"#struct": {"x": "_", "y": "_"}}, "_",
  ["add", "x", "y"]]

// Conditional
["if", [">", "x", {"#literal": 0}],
  {"#literal": "positive"},
  {"#literal": "non-positive"}]

// Entity query with filter
["let", "entities",
  ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
  ["filter", "entities",
    ["fn", {"#tuple": []}, {"#struct": {"e": "_"}}, "_",
      ["==", "e.archived", {"#literal": false}]]]]
```

## Testing

This crate uses a macro-based test harness for testing parser fragments, with insta snapshots stored alongside the parser code.

### Structure

```text
src/parser/
  string/
    test.rs           # Test harness macros
    type.rs           # Parser with tests
    snapshots/        # insta snapshots
      *.snap
```

### Example

```rust
#[cfg(test)]
mod tests {
    bind_parser!(SyntaxDump; fn parse_type_test(parse_type));

    test_cases!(parse_type_test;
        empty_tuple("()") => "Empty tuple",
        single_field_struct("(name: String)") => "Single-field struct",
        unclosed_tuple("(Int, String") => "Unclosed tuple",
    );
}
```

### Commands

```bash
cargo nextest run --package hashql-syntax-jexpr
cargo insta test --package hashql-syntax-jexpr
cargo insta review  # Interactive review
```
