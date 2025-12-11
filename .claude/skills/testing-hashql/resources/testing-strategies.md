# HashQL Testing Strategies Guide

This guide helps you choose the right testing approach for HashQL code. Each strategy has specific strengths and ideal use cases.

---

## Decision Matrix

| Question | Compiletest | Unit Tests | Insta Snapshots |
|----------|-------------|------------|-----------------|
| Testing error messages/diagnostics? | ✅ **Best** | ❌ | ⚠️ Possible |
| Testing compiler pipeline stages? | ✅ **Best** | ❌ | ⚠️ Possible |
| Testing internal function logic? | ❌ | ✅ **Best** | ❌ |
| Testing parser output structure? | ⚠️ Possible | ⚠️ Possible | ✅ **Best** |
| Need to verify exact output format? | ✅ **Best** | ❌ | ✅ **Best** |
| Testing edge cases in isolation? | ❌ | ✅ **Best** | ⚠️ Possible |
| Files live in source directory? | ❌ | ✅ | ✅ |
| Files live in `tests/ui/` directory? | ✅ | ❌ | ❌ |

---

## 1. Compiletest (UI Tests)

**The default for HashQL**. Use for testing the complete compiler pipeline with emphasis on diagnostics.

### When to Use

- Testing **error messages** and **diagnostic formatting**
- Testing **multi-stage compilation** (parsing → lowering → type checking → evaluation)
- Verifying **user-facing compiler output**
- Testing **error recovery** and multiple errors in one file
- Testing behavior across **compilation phases** (AST, HIR, MIR, eval)

### Structure

```text
crate/tests/ui/
  category/
    .spec.toml        # Suite specification
    test-name.jsonc   # Test input (J-Expr)
    test-name.stderr  # Expected errors (if run: fail)
    test-name.stdout  # Expected output (if run: pass)
```

### Example: Error Message Test

From [`libs/@local/hashql/ast/tests/ui/lowering/type-extractor/definition/duplicate-fields.jsonc`](file:///Users/bmahmoud/Sync/projects/contribution/hash/libs/@local/hashql/ast/tests/ui/lowering/type-extractor/definition/duplicate-fields.jsonc):

```jsonc
//@ run: fail
//@ description: Tests error handling for structs with multiple duplicate fields
[
  "type",
  "BadRecord",
  {
    "#struct": {
      "field": "Number",
      //~^ ERROR Field `field` first defined here
      "field": "String",
      "another": "Boolean",
      //~^ ERROR Field `another` first defined here
      "another": "Number",
      "unique": "String"
    }
  },
  "_"
]
```

The `//~^` annotations verify that specific errors appear at specific locations.

### Example: Pipeline Output Test

From [`libs/@local/hashql/hir/tests/ui/lower/graph-hoisting/hoist.jsonc`](file:///Users/bmahmoud/Sync/projects/contribution/hash/libs/@local/hashql/hir/tests/ui/lower/graph-hoisting/hoist.jsonc):

```jsonc
//@ run: pass
//@ description: Tests graph hoisting transformation
[
  "let", "a", { "#literal": true },
  ["::graph::tail::collect", ...]
]
```

The corresponding `.stdout` file captures the HIR before and after transformations, verifying the compiler pass behavior.

### Commands

```bash
# Run all UI tests
cargo run -p hashql-compiletest run

# Filter by test name
cargo run -p hashql-compiletest run --filter "test(duplicate-fields)"

# Update expected outputs
cargo run -p hashql-compiletest run --bless
```

---

## 2. Unit Tests

Standard Rust `#[test]` functions for testing isolated components.

### When to Use

- Testing **internal functions** and **helper utilities**
- Testing **state transitions** and **edge cases**
- Testing **error handling logic** (not error messages)
- Testing **data structure operations**
- When you need **fine-grained control** over test setup

### Structure

Unit tests live alongside the code in `#[cfg(test)]` modules:

```rust
// In src/component.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn my_test() {
        // ...
    }
}
```

### Example: State Machine Testing

From [`libs/@local/hashql/syntax-jexpr/src/parser/state.rs`](file:///Users/bmahmoud/Sync/projects/contribution/hash/libs/@local/hashql/syntax-jexpr/src/parser/state.rs#L362-L405):

```rust
#[test]
fn peek_returns_token_without_consuming() {
    bind_context!(let context = "42");
    bind_state!(let mut state from context);

    let token = state
        .peek()
        .expect("should not fail")
        .expect("should have token");
    assert_eq!(token.kind, number("42"));

    // Token should not be consumed
    let token2 = state
        .peek()
        .expect("should not fail")
        .expect("should have token");
    assert_eq!(token2.kind, number("42"));
}

#[test]
fn advance_consumes_token() {
    bind_context!(let context = "42 true");
    bind_state!(let mut state from context);

    let token = state.advance(SyntaxKind::Number).expect("should not fail");
    assert_eq!(token.kind, number("42"));

    // Next token should be available
    let token2 = state.peek().expect("should not fail").expect("should have token");
    assert_eq!(token2.kind, TokenKind::Bool(true));
}
```

These tests verify specific state machine behavior with explicit assertions.

### Commands

```bash
# Run unit tests for a package
cargo nextest run --package hashql-syntax-jexpr

# Run specific test
cargo nextest run --package hashql-syntax-jexpr -- state::tests::peek_returns_token

# Run doc tests
cargo test --package hashql-syntax-jexpr --doc
```

---

## 3. Insta Snapshot Tests

Uses the `insta` crate to capture and compare structured output.

### When to Use

- Testing **parser output** (AST structure, syntax dumps)
- Testing **formatter output**
- When output is **complex but deterministic**
- When you want **easy visual diffing** of changes
- When tests should **live near the source code**

### Structure

Snapshots are stored in `snapshots/` directories adjacent to test files:

```text
src/parser/
  string/
    type.rs           # Contains tests
    snapshots/        # Snapshot files
      hashql_...__tests__single_field_struct.snap
```

### Example: Parser Output Testing

From [`libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs`](file:///Users/bmahmoud/Sync/projects/contribution/hash/libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs#L430-L512):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::string::test::{bind_parser, test_cases};

    bind_parser!(SyntaxDump; fn parse_type_test(parse_type));

    test_cases!(parse_type_test;
        // Tuple types
        empty_tuple("()") => "Empty tuple",
        single_element_tuple("(Int,)") => "Single-element tuple with trailing comma",
        
        // Struct types
        single_field_struct("(name: String)") => "Single-field struct",
        
        // Error cases
        unclosed_tuple("(Int, String") => "Unclosed tuple",
        missing_colon("(name: String, age Int)") => "Missing field type",
    );
}
```

The `test_cases!` macro generates individual tests that capture output as snapshots.

### Example: Manual Snapshot Test

From [`libs/@local/hashql/syntax-jexpr/src/parser/array/mod.rs`](file:///Users/bmahmoud/Sync/projects/contribution/hash/libs/@local/hashql/syntax-jexpr/src/parser/array/mod.rs#L253-L275):

```rust
#[test]
fn parse_basic_function_call() {
    let result = run_array(r##"["add", {"#literal": 1}, {"#literal": 2}]"##)
        .expect("should parse successfully");

    with_settings!({
        description => "Parses a basic function call with proper literal syntax"
    }, {
        assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
    });
}

#[test]
fn parse_empty_array() {
    let error = run_array("[]").expect_err("should fail on empty array");

    with_settings!({
        description => "Empty arrays are not valid J-Expr function calls"
    }, {
        assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
    });
}
```

### Snapshot File Format

From a snapshot file:

```yaml
---
source: libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs
description: Single-field struct
expression: "(name: String)"
info:
  kind: Ok
---
Type#4294967040@6
  TypeKind (Struct)
    StructType#4294967040@6
      StructField#4294967040@5 (name: name)
        Type#4294967040@4
          TypeKind (Path)
            Path#4294967040@4 (rooted: false)
              PathSegment#4294967040@3 (name: String)
```

### Commands

```bash
# Run tests (will show diff for failing snapshots)
cargo insta test --package hashql-syntax-jexpr

# Review pending snapshot changes interactively
cargo insta review

# Accept all pending changes
cargo insta accept

# Reject all pending changes
cargo insta reject
```

---

## Choosing the Right Approach: Examples

### Scenario 1: New error message for invalid syntax

**Use Compiletest.** You want to verify:

- The error message is user-friendly
- The span points to the correct location
- Help text is appropriate

```jsonc
//@ run: fail
//@ description: Error when using reserved keyword as identifier
["let", "type", {"#literal": 1}, "type"]
//~^ ERROR `type` is a reserved keyword
```

### Scenario 2: Testing a utility function

**Use Unit Tests.** You're testing internal logic:

```rust
#[test]
fn symbol_table_lookup_returns_none_for_undefined() {
    let table = SymbolTable::new();
    assert!(table.lookup("undefined").is_none());
}
```

### Scenario 3: New parser production rule

**Use Insta Snapshots.** You want to verify AST structure:

```rust
test_cases!(parse_new_syntax;
    basic_case("new-syntax-here") => "Basic new syntax",
    with_options("new-syntax option1 option2") => "With options",
);
```

### Scenario 4: Testing a compiler transformation

**Use Compiletest with `run: pass`.** You want to verify transformation output:

```jsonc
//@ run: pass
//@ description: Tests new optimization pass
["let", "x", {"#literal": 1}, ["add", "x", "x"]]
```

The `.stdout` captures the before/after transformation.

---

## Hybrid Approaches

Sometimes you need multiple approaches:

1. **Insta for parser + Compiletest for errors**: Parser tests use snapshots for valid syntax, but error message tests use compiletest for invalid syntax.

2. **Unit tests for logic + Compiletest for integration**: Test helper functions in isolation, but test their integration into the compiler pipeline with compiletest.

---

## Summary

| Approach | Files Location | Update Command | Best For |
|----------|---------------|----------------|----------|
| Compiletest | `tests/ui/` | `--bless` | Diagnostics, pipeline testing |
| Unit Tests | `src/*.rs` | N/A | Isolated logic |
| Insta | `src/*/snapshots/` | `cargo insta accept` | Parser output, complex structures |

**Default choice for HashQL: Compiletest** — unless you're testing internal functions (unit tests) or parser output structure (insta).
