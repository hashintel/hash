---
name: testing-hashql
description: HashQL testing strategies including compiletest (UI tests), unit tests, and snapshot tests. Use when writing tests for HashQL code, using //~ annotations, running --bless, debugging test failures, or choosing the right testing approach.
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
- Using diagnostic annotations (`//~`) or directives (`//@`)
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

**Test Directives (must be at file start):**

```jsonc
//@ run: pass                  // Should pass (no errors)
//@ run: fail                  // Should fail with errors (DEFAULT)
//@ run: skip                  // Skip this test
//@ run: skip reason=...       // Skip with reason
//@ name: custom_name          // Custom test name
//@ description: ...           // Test description (ENCOURAGED)
//@ suite#key: value           // Suite-specific directive (TOML value)
```

**Diagnostic Annotations:**

```jsonc
"undefined_var"  //~ ERROR unknown variable
["bad", "expr"]  //~ ERROR[category::subcategory] type error

//~^ ERROR message    // Previous line
//~^^ ERROR message   // 2 lines above
//~v ERROR message    // Next line
//~vvv ERROR message  // 3 lines below
//~| ERROR message    // Same line as previous annotation
//~? ERROR message    // Unknown line (use sparingly)
```

**Severity levels:** `ERROR`, `WARNING`, `NOTE`, `DEBUG`, `CRITICAL`

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

---

## Discovering Available Suites

Rather than relying on a hardcoded list (suites change), discover them:

```bash
# List suite names from the codebase
grep -r 'fn name(&self)' libs/@local/hashql/compiletest/src/suite/*.rs

# Or check existing .spec.toml files for examples
find libs/@local/hashql -name '.spec.toml' -exec cat {} \;
```

**Suite categories:**

- `parse/*` - Parsing tests (e.g., `parse/syntax-dump`)
- `ast-lowering/*` - AST lowering phases
- `hir-lower/*` - HIR lowering phases
- `mir-*` - MIR passes
- `eval/*` - Evaluation tests

---

## Common Workflows

### Creating a New UI Test

1. Create `.jsonc` file with test code
2. Add `//@ description: ...` explaining what's being tested
3. Use `//@ run: pass` for passing tests (default is `fail`)
4. Ensure `.spec.toml` exists in directory (or parent)
5. Run `cargo run -p hashql-compiletest run --filter "test(name)" --bless`
6. Review generated `.stdout` and `.stderr` files

### Updating Tests After Changes

```bash
# UI tests - update expected outputs
cargo run -p hashql-compiletest run --bless

# Snapshot tests - review and accept
cargo insta test && cargo insta review
```

---

## Best Practices

1. **Always include `//@ description:`** - Document what behavior is being tested
2. **Default is `fail` mode** - Explicitly use `//@ run: pass` for passing tests
3. **Keep tests focused** - One behavior per test file
4. **Use descriptive file names** - Names should indicate what's being tested
5. **Use annotations** - Verify specific error messages with `//~`, not just failure

---

## Test Selection Guide

| Scenario | Test Type |
|----------|-----------|
| Parser/syntax errors | Compiletest |
| Type checker errors | Compiletest |
| Error message formatting | Compiletest |
| Internal logic/functions | Unit tests |
| Complex output structures | Snapshot tests |

---

## Need More Details?

- **Choosing the right testing approach** → See [resources/testing-strategies.md](resources/testing-strategies.md)
- **Compiletest deep dive** → See [resources/compiletest-guide.md](resources/compiletest-guide.md)
