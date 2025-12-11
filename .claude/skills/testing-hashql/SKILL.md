---
name: testing-hashql
description: HashQL testing strategies including compiletest (UI tests), unit tests, and snapshot tests. Use when writing tests for HashQL code, working with .spec.toml files, using //~ annotations, running --bless, or debugging test failures.
---

# HashQL Testing Strategies

## Purpose

This skill covers the three main testing approaches used in HashQL:

1. **Compiletest (UI Tests)** - Testing parser, type checker, and error messages
2. **Unit Tests** - Standard Rust `#[test]` functions
3. **Snapshot Tests** - Using `insta` crate for output comparison

## When This Skill Activates

Automatically activates when:

- Writing or modifying HashQL tests
- Working with `tests/ui/` directories
- Using `.spec.toml` files or `//~` diagnostic annotations
- Running `--bless` to update expected outputs
- Debugging test failures in HashQL crates

---

## Quick Reference

### 1. Compiletest (UI Tests)

UI tests verify HashQL parsing, type checking, and error reporting using J-Expr files.

**Location:** `tests/ui/` directories in HashQL crates

**Structure:**

```text
package/tests/ui/
  namespace/
    .spec.toml        # Test suite specification
    test.jsonc        # J-Expr test file
    test.stdout       # Expected output
    test.stderr       # Expected diagnostics
```

**Commands:**

```bash
# Run all UI tests
cargo run -p hashql-compiletest run

# List tests without running
cargo run -p hashql-compiletest list

# Filter tests (nextest filter syntax)
cargo run -p hashql-compiletest run --filter "test(name)"
cargo run -p hashql-compiletest run --filter "package(pkg) & test(name)"

# Update expected outputs
cargo run -p hashql-compiletest run --bless
```

**Test Directives:**

```jsonc
//@ run: pass      // Should pass (no errors)
//@ run: fail      // Should fail with errors (default)
//@ run: skip      // Skip this test
//@ run: skip reason=Not implemented yet
//@ name: custom_name
```

**Diagnostic Annotations:**

```jsonc
"undefined_var"  //~ ERROR unknown variable
["bad", "expr"]  //~ ERROR[ast:typchk::mismatch] type error

//~^ ERROR message   // Previous line
//~^^^ ERROR message // 3 lines above
//~vvv ERROR message // 3 lines below
//~| ERROR message   // Same line as previous annotation
//~? ERROR message   // Unknown line
```

📖 **Full Guide:** [resources/compiletest-guide.md](resources/compiletest-guide.md)

---

### 2. Unit Tests

Standard Rust unit tests for isolated component testing.

**Location:** `tests.rs` or `test.rs` modules, or `#[cfg(test)]` blocks

**Commands:**

```bash
# Run unit tests for a package
cargo nextest run --package hashql-<package>

# Run doc tests
cargo test --package hashql-<package> --doc

# Run with all features
cargo nextest run --all-features --package hashql-<package>
```

**Pattern:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_specific_behavior() {
        // Arrange
        let input = ...;
        
        // Act
        let result = function_under_test(input);
        
        // Assert
        assert_eq!(result, expected);
    }
}
```

---

### 3. Snapshot Tests

Uses `insta` crate for snapshot-based testing.

**Location:** `snapshots/` directories alongside test modules

**Commands:**

```bash
# Run tests and review snapshots
cargo insta test --package hashql-<package>

# Review pending snapshots
cargo insta review

# Accept all pending snapshots
cargo insta accept
```

**Pattern:**

```rust
use insta::assert_snapshot;

#[test]
fn test_complex_output() {
    let result = generate_output();
    assert_snapshot!(result);
}

#[test]
fn test_with_name() {
    let result = generate_output();
    assert_snapshot!("descriptive_name", result);
}
```

---

## Common Workflows

### Creating a New UI Test

1. Create `.jsonc` file with test code
2. Ensure `.spec.toml` exists in directory (or parent)
3. Run `cargo run -p hashql-compiletest run --filter "test(name)" --bless`
4. Review generated `.stdout` and `.stderr` files

### Updating Tests After Changes

```bash
# UI tests - update expected outputs
cargo run -p hashql-compiletest run --bless

# Snapshot tests - review and accept
cargo insta test && cargo insta review
```

### Debugging Test Failures

1. Check the diff between expected and actual output
2. For UI tests: verify `//~` annotations match diagnostics
3. For snapshots: use `cargo insta review` to see differences

---

## Test Selection Guide

| Scenario | Test Type |
|----------|-----------|
| Parser/syntax errors | Compiletest |
| Type checker errors | Compiletest |
| Error message formatting | Compiletest |
| Internal logic/functions | Unit tests |
| Complex output structures | Snapshot tests |
| Edge cases and boundaries | Unit tests |

---

## Need More Details?

- **Compiletest deep dive** → See [resources/compiletest-guide.md](resources/compiletest-guide.md)

---

**Skill Status**: Production-ready ✅
**Line Count**: ~140 (following 500-line rule) ✅
**Progressive Disclosure**: 1 detailed resource file ✅
