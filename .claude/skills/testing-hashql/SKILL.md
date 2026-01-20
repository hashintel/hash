---
name: testing-hashql
description: HashQL testing strategies including compiletest (UI tests), unit tests, and snapshot tests. Use when writing tests for HashQL code, using //~ annotations, running --bless, debugging test failures, or choosing the right testing approach.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - hashql test
      - compiletest
      - ui test
      - snapshot test
      - insta test
      - //~ annotation
      - --bless
    intent-patterns:
      - "\\b(write|create|run|debug|add|fix)\\b.*?\\b(hashql|compiletest)\\b.*?\\btest\\b"
      - "\\b(test|verify)\\b.*?\\b(diagnostic|error message|mir|hir|ast)\\b"
---

# HashQL Testing Strategies

HashQL uses three testing approaches. **compiletest is the default** for testing compiler behavior.

## Quick Reference

| Scenario | Test Type | Location |
| -------- | --------- | -------- |
| Diagnostics/error messages | compiletest | `tests/ui/` |
| Compiler pipeline phases | compiletest | `tests/ui/` |
| MIR/HIR/AST pass integration | compiletest | `tests/ui/` |
| MIR/HIR/AST pass edge cases | insta | `tests/ui/<category>/` |
| MIR pass unit tests | MIR builder | `src/**/tests.rs` |
| Core crate (where needed) | insta | `src/**/snapshots/` |
| Parser fragments (syntax-jexpr) | insta | `src/*/snapshots/` |
| Internal functions/logic | Unit tests | `src/*.rs` |

## compiletest (UI Tests)

Test parsing, type checking, and error reporting using J-Expr files with diagnostic annotations.

**Structure:**

```text
package/tests/ui/
  category/
    .spec.toml        # Suite specification (required)
    test.jsonc        # Test input
    test.stdout       # Expected output (run: pass)
    test.stderr       # Expected errors (run: fail)
    test.aux.svg      # Auxiliary output (some suites)
```

**Commands:**

```bash
cargo run -p hashql-compiletest run                           # Run all
cargo run -p hashql-compiletest run --filter "test(name)"     # Filter
cargo run -p hashql-compiletest run --bless                   # Update expected
```

**Test file example:**

```jsonc
//@ run: fail
//@ description: Tests duplicate field detection
["type", "Bad", {"#struct": {"x": "Int", "x": "String"}}, "_"]
//~^ ERROR Field `x` first defined here
```

**Directives** (`//@` at file start):

- `run: pass` / `run: fail` (default) / `run: skip`
- `description: ...` (encouraged)
- `name: custom_name`

**Annotations** (`//~` for expected diagnostics):

- `//~ ERROR msg` - current line
- `//~^ ERROR msg` - previous line
- `//~v ERROR msg` - next line
- `//~| ERROR msg` - same as previous annotation

📖 **Full Guide:** [references/compiletest-guide.md](references/compiletest-guide.md)

## Unit Tests

Standard Rust `#[test]` functions for testing internal logic.

**Location:** `#[cfg(test)]` modules in source files

**Example from** `hashql-syntax-jexpr/src/parser/state.rs`:

```rust
#[test]
fn peek_returns_token_without_consuming() {
    bind_context!(let context = "42");
    bind_state!(let mut state from context);

    let token = state.peek().expect("should not fail").expect("should have token");
    assert_eq!(token.kind, number("42"));
}
```

**Commands:**

```bash
cargo nextest run --package hashql-<package>
cargo test --package hashql-<package> --doc    # Doc tests
```

## insta Snapshot Tests

Use `insta` crate for snapshot-based output when compiletest (the preferred method) is infeasible. Three categories exist:

| Category | Crates | Snapshot Location | Rationale |
| -------- | ------ | ----------------- | --------- |
| **Pipeline Crates** | mir, hir, ast | `tests/ui/<category>/*.snap` | Colocate with compiletest tests |
| **Core** | hashql-core | Default insta (`src/**/snapshots/`) | Separate from pipeline; prefer unit tests |
| **Syntax** | syntax-jexpr | `src/*/snapshots/` | Macro-based for parser fragments |

### Pipeline Crates (mir, hir, ast)

Snapshots colocate with compiletest UI tests. Test code lives in `src/**/tests.rs`, snapshots go in the appropriate `tests/ui/<category>/` directory.

```rust
// Example: hashql-mir/src/pass/transform/ssa_repair/tests.rs
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

```rust
// hashql-syntax-jexpr/src/parser/string/test.rs
pub(crate) macro test_cases($parser:ident; $($name:ident($source:expr) => $description:expr,)*) {
    $(
        #[test]
        fn $name() {
            assert_parse!($parser, $source, $description);
        }
    )*
}
```

Snapshots: `hashql-syntax-jexpr/src/parser/*/snapshots/*.snap`

### Commands

```bash
cargo insta test --package hashql-<package>
cargo insta review     # Interactive review
cargo insta accept     # Accept all pending
```

## MIR Builder Tests

For testing MIR transformation and analysis passes directly with programmatically constructed MIR bodies.

**Location:** `hashql-mir/src/pass/**/tests.rs`

**When to use:**

- Testing MIR passes in isolation with precise CFG control
- Edge cases requiring specific MIR structures hard to produce from source
- Benchmarking pass performance

**Key features:**

- Transform passes return `Changed` enum (`Yes`, `No`, `Unknown`) to indicate modifications
- Test harness captures and includes `Changed` value in snapshots for verification
- Snapshot format: before MIR → `Changed: Yes/No/Unknown` separator → after MIR

### Important: Missing Macro Features

The `body!` macro does not support all MIR constructs. If you need a feature that is not supported, **do not work around it manually** - instead, stop and request that the feature be added to the macro.

### Quick Example (using `body!` macro)

```rust
use hashql_core::{heap::Heap, r#type::environment::Environment};
use hashql_mir::{builder::body, intern::Interner};

let heap = Heap::new();
let interner = Interner::new(&heap);
let env = Environment::new(&heap);

let body = body!(interner, env; fn@0/1 -> Int {
    decl x: Int, cond: Bool;

    bb0() {
        cond = load true;
        if cond then bb1() else bb2();
    },
    bb1() {
        goto bb3(1);
    },
    bb2() {
        goto bb3(2);
    },
    bb3(x) {
        return x;
    }
});
```

📖 **Full Guide:** [references/mir-builder-guide.md](references/mir-builder-guide.md)

## References

- [compiletest Guide](references/compiletest-guide.md) - Detailed UI test documentation
- [Testing Strategies](references/testing-strategies.md) - Choosing the right approach
- [MIR Builder Guide](references/mir-builder-guide.md) - `body!` macro for MIR construction in tests
- [MIR Fluent Builder](references/mir-fluent-builder.md) - Programmatic builder API (for advanced cases)
