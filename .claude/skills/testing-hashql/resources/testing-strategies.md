# HashQL Testing Strategies Guide

This guide helps you choose the right testing approach for HashQL code.

---

## Decision Matrix

| Question | compiletest | Unit Tests | insta Snapshots |
|----------|-------------|------------|-----------------|
| Testing error messages/diagnostics? | ✅ **Best** | ❌ | ⚠️ Possible |
| Testing compiler pipeline stages? | ✅ **Best** | ❌ | ⚠️ Possible |
| Testing internal function logic? | ❌ | ✅ **Best** | ❌ |
| MIR/HIR pass integration (end-to-end)? | ✅ **Best** | ❌ | ❌ |
| MIR/HIR pass edge cases (isolated)? | ⚠️ Noisy | ❌ | ✅ **Best** |
| Testing parser output structure? | ⚠️ Possible | ⚠️ Possible | ✅ **Best** |
| Need to verify exact output format? | ✅ **Best** | ❌ | ✅ **Best** |
| Testing edge cases in isolation? | ❌ | ✅ **Best** | ⚠️ Possible |

---

## 1. compiletest (UI Tests)

**The default for HashQL**. Use for testing the complete compiler pipeline with emphasis on diagnostics.

### When to Use

- Testing **error messages** and **diagnostic formatting**
- Testing **multi-stage compilation** (parsing → lowering → type checking → evaluation)
- Verifying **user-facing compiler output**
- Testing **error recovery** and multiple errors in one file

### Structure

```text
crate/tests/ui/
  category/
    .spec.toml        # Suite specification
    test-name.jsonc   # Test input (J-Expr)
    test-name.stderr  # Expected errors (if run: fail)
    test-name.stdout  # Expected output (if run: pass)
    test-name.aux.svg # Auxiliary output (some suites)
```

### Example: Error Message Test

From `libs/@local/hashql/ast/tests/ui/lowering/type-extractor/definition/duplicate-fields.jsonc`:

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

From `libs/@local/hashql/hir/tests/ui/lower/graph-hoisting/hoist.jsonc`:

```jsonc
//@ run: pass
//@ description: TODO
[
  "let", "a", { "#literal": true },
  ["let", "b", { "#literal": true },
    ["::graph::tail::collect",
      ["::graph::body::filter",
        ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
        ["fn", { "#tuple": [] }, { "#struct": { "vertex": "_" } }, "_",
          ["==", "a", "b"]]]]]
]
```

The corresponding `.stdout` file captures the HIR before and after transformations.

### Commands

```bash
cargo run -p hashql-compiletest run                              # Run all
cargo run -p hashql-compiletest run --filter "test(duplicate-fields)"  # Filter
cargo run -p hashql-compiletest run --bless                      # Update expected
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

From `libs/@local/hashql/syntax-jexpr/src/parser/state.rs`:

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

### Commands

```bash
cargo nextest run --package hashql-syntax-jexpr
cargo nextest run --package hashql-syntax-jexpr -- state::tests::peek_returns_token
cargo test --package hashql-syntax-jexpr --doc
```

---

## 3. insta Snapshot Tests

Uses the `insta` crate for snapshot-based output when compiletest is infeasible. **Three categories exist:**

| Category | Crates | Snapshot Location | Rationale |
|----------|--------|-------------------|-----------|
| **Pipeline Crates** | mir, hir, ast | `tests/ui/<category>/*.snap` | Colocate with compiletest tests |
| **Core** | hashql-core | Default insta (`src/**/snapshots/`) | Separate from pipeline; prefer unit tests |
| **Syntax** | syntax-jexpr | `src/*/snapshots/` | Macro-based for parser fragments |

### Pipeline Crates (mir, hir, ast)

Snapshots colocate with compiletest UI tests. Test code lives in `src/**/tests.rs`, snapshots go in the appropriate `tests/ui/<category>/` directory.

**Example from** `libs/@local/hashql/mir/src/pass/transform/ssa_repair/tests.rs`:

```rust
let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
let mut settings = Settings::clone_current();
settings.set_snapshot_path(dir.join("tests/ui/pass/ssa_repair")); // matches test category
settings.set_prepend_module_to_snapshot(false);

let _drop = settings.bind_to_scope();
assert_snapshot!(name, value);
```

Categories vary: `reify/`, `lower/`, `pass/ssa_repair/`, etc.

### Core

`hashql-core` is separate from the compilation pipeline, so it uses default insta directories. Prefer unit tests; only use snapshots where necessary.

### Syntax (syntax-jexpr)

Syntax crates predate compiletest and use macro-based test harnesses for testing parser fragments directly.

**Example from** `libs/@local/hashql/syntax-jexpr/src/parser/string/test.rs`:

```rust
pub(crate) macro test_cases($parser:ident; $($name:ident($source:expr) => $description:expr,)*) {
    $(
        #[test]
        fn $name() {
            assert_parse!($parser, $source, $description);
        }
    )*
}
```

Snapshots stored at: `hashql-syntax-jexpr/src/parser/*/snapshots/*.snap`

**Usage in** `libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs`:

```rust
#[cfg(test)]
mod tests {
    bind_parser!(SyntaxDump; fn parse_type_test(parse_type));

    test_cases!(parse_type_test;
        empty_tuple("()") => "Empty tuple",
        single_element_tuple("(Int,)") => "Single-element tuple with trailing comma",
        single_field_struct("(name: String)") => "Single-field struct",
        unclosed_tuple("(Int, String") => "Unclosed tuple",
    );
}
```

### Commands

```bash
cargo insta test --package hashql-mir
cargo insta review     # Interactive review
cargo insta accept     # Accept all pending
cargo insta reject     # Reject all pending
```

---

## Choosing the Right Approach: Examples

### Scenario 1: New error message for invalid syntax

**Use compiletest.** You want to verify:

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

### Scenario 3: New MIR transformation pass

**Use compiletest for pipeline integration** — verifying the pass works end-to-end:

```jsonc
//@ run: pass
//@ description: Tests new optimization pass integrates correctly
["let", "x", {"#literal": 1}, ["add", "x", "x"]]
```

**Use insta for isolated edge cases** — exercising specific scenarios that are rarely hit in normal pipeline tests, or where compiletest would create too much noise:

```rust
#[test]
fn edge_case_irreducible_cfg() {
    scaffold!(heap, interner, builder);
    // ... construct specific edge case MIR ...
    assert_pass("irreducible_cfg", body, context);
}
```

### Scenario 4: New parser production rule

**Use insta snapshots (syntax-jexpr pattern).** You want to verify AST structure:

```rust
test_cases!(parse_new_syntax;
    basic_case("new-syntax-here") => "Basic new syntax",
    with_options("new-syntax option1 option2") => "With options",
);
```

---

## Summary

| Approach | Test Location | Snapshot Location | Update Command | Best For |
|----------|--------------|-------------------|----------------|----------|
| compiletest | `tests/ui/*.jsonc` | `tests/ui/*.stdout/stderr` | `--bless` | Diagnostics, pipeline, pass integration |
| Unit tests | `src/*.rs` | N/A | N/A | Isolated logic |
| insta (pipeline) | `src/**/tests.rs` | `tests/ui/<category>/` | `cargo insta accept` | Pass edge cases |
| insta (core) | `src/**/tests` | `src/**/snapshots/` | `cargo insta accept` | Core crate |
| insta (syntax-jexpr) | `src/*/tests` | `src/*/snapshots/` | `cargo insta accept` | Parser fragments |

**Default choice: compiletest** for end-to-end pipeline testing; **insta** for isolated edge cases where compiletest would be noisy.
