# HashQL Compiletest Guide

A comprehensive test harness for HashQL that executes test cases and verifies their behavior against expected outputs. This tool helps ensure that the HashQL language implementation behaves correctly by testing parsing, type checking, execution, and error reporting.

Heavily influenced by the Rust compiler's [compiletest](https://github.com/rust-lang/rust/tree/master/src/tools/compiletest) tool.

## Table of Contents

- [Running Tests](#running-tests)
- [Directory Structure](#directory-structure)
- [Authoring Test Cases](#authoring-test-cases)
- [Test Directives](#test-directives)
- [Diagnostic Annotations](#diagnostic-annotations)
- [Available Test Suites](#available-test-suites)
- [Debugging Failures](#debugging-failures)
- [Extending Test Suites](#extending-test-suites)
- [Best Practices](#best-practices)

---

## Running Tests

### Basic Commands

```bash
# Run all UI tests
cargo run -p hashql-compiletest run

# List all available tests without running
cargo run -p hashql-compiletest list
```

### Filtering Tests

Uses [nextest filter syntax](https://nexte.st/docs/filtersets/):

```bash
# Run tests in a specific namespace
cargo run -p hashql-compiletest run --filter "test(some_namespace::test_name)"

# Run all tests in a package
cargo run -p hashql-compiletest run --filter "package(some_package)"

# Combine filters with &
cargo run -p hashql-compiletest run --filter "package(some_package) & test(error_handling)"
```

### Updating Expected Outputs

When you make intentional changes that affect test outputs:

```bash
cargo run -p hashql-compiletest run --bless
```

This updates `.stdout` and `.stderr` files for all tests with their actual outputs.

---

## Directory Structure

Tests are organized under `tests/ui/` in each HashQL crate. The directory **must** be in a workspace member crate.

```text
package_name/
  tests/
    ui/
      namespace1/
        .spec.toml        # Test suite specification
        test_case1.jsonc  # J-Expr test file
        test_case1.stdout # Expected output
        test_case1.stderr # Expected diagnostics
      namespace2/
        .spec.toml
        another_test.jsonc
        another_test.stdout
        another_test.stderr
```

### Test Components

| File | Purpose | Required |
|------|---------|----------|
| `.jsonc` | J-Expr test code | ✅ Yes |
| `.spec.toml` | Test suite specification | ✅ Yes (in dir or parent) |
| `.stdout` | Expected standard output | Optional (empty if none) |
| `.stderr` | Expected diagnostics | Optional (empty if none) |

---

## Authoring Test Cases

### Step 1: Create the Test File

Create a `.jsonc` file with your test code:

```jsonc
// example_test.jsonc
["let", "x", {"#literal": 42},
  "x"
]
```

### Step 2: Create or Verify .spec.toml

Ensure there's a `.spec.toml` file in the directory or a parent:

```toml
suite = "parse/syntax-dump"
```

The harness searches upward from the test file to find `.spec.toml`, stopping at `tests/ui/`. This allows:

- Shared specs at directory roots
- Overrides for specific subdirectories

### Step 3: Generate Expected Outputs

Run with `--bless` to generate initial reference files:

```bash
cargo run -p hashql-compiletest run --filter "test(example_test)" --bless
```

---

## Test Directives

Directives control test behavior. They **must** be at the start of the file.

```jsonc
//@ run: pass      // Test should pass (no errors expected)
//@ run: fail      // Test should fail (default if omitted)
//@ run: skip      // Skip this test
//@ run: skip reason=Not implemented yet

//@ name: custom_test_name  // Override the default name
```

### Run Modes

| Mode | Behavior |
|------|----------|
| `pass` | Test must succeed with no errors |
| `fail` | Test must produce errors (default) |
| `skip` | Test is skipped entirely |

**Important:** If you don't specify `//@ run:`, the test defaults to `fail` mode.

---

## Diagnostic Annotations

Annotations verify that specific diagnostics appear at expected locations.

### Basic Syntax

```jsonc
"undefined_variable" //~ ERROR unknown variable
```

### Components

- `//~` - Annotation marker
- Severity: `ERROR`, `WARNING`, `INFO`, `DEBUG`, or `CRITICAL`
- Optional error code: `[ast:typchk::mismatch]`
- Message fragment to match

### Full Example

```jsonc
["+", {"#literal": "string"}, {"#literal": 42}] //~ ERROR[ast:typchk::mismatch] cannot add
```

### Line References

| Syntax | Meaning |
|--------|---------|
| `//~ ERROR msg` | Current line |
| `//~^ ERROR msg` | Previous line (1 line above) |
| `//~^^ ERROR msg` | 2 lines above |
| `//~^^^ ERROR msg` | 3 lines above |
| `//~v ERROR msg` | Next line (1 line below) |
| `//~vv ERROR msg` | 2 lines below |
| `//~vvv ERROR msg` | 3 lines below |
| `//~\| ERROR msg` | Same line as previous annotation |
| `//~? ERROR msg` | Unknown/any line |

### Multi-Annotation Example

```jsonc
["let", "x",          //~^ ERROR first error on the let line
  ["invalid"]         //~ ERROR error on this line
]                     //~| ERROR another error on same line as previous
```

---

## Available Test Suites

| Suite Name | Description |
|------------|-------------|
| `parse/syntax-dump` | Parses input and dumps AST structure |

Specify the suite in `.spec.toml`:

```toml
suite = "parse/syntax-dump"
```

---

## Debugging Failures

When a test fails, the harness shows:

1. Test name and location
2. Expected vs. actual output diff
3. Unfulfilled annotations (expected errors that didn't appear)
4. Unexpected diagnostics (errors that appeared but weren't expected)

### Resolution Steps

1. **Real bug:** Fix the code
2. **Intentional change:** Run `--bless` to update expected outputs
3. **Annotation mismatch:** Update `//~` annotations to match new messages

---

## Extending Test Suites

To add a new test suite:

1. Create a struct implementing `Suite` trait
2. Add to `SUITES` array in `suite/mod.rs`
3. Implement the `run` method

```rust
struct MyTestSuite;

impl Suite for MyTestSuite {
    fn name(&self) -> &'static str {
        "my/test-suite"
    }

    fn run(
        &self,
        expr: Expr<'_>,
        diagnostics: &mut Vec<SuiteDiagnostic>
    ) -> Result<String, SuiteDiagnostic> {
        // Process expression
        // Return Ok(String) for stdout
        // Return Err(diagnostic) for fatal errors
        // Add non-fatal diagnostics to the vector
    }
}
```

---

## Best Practices

1. **Keep tests focused** - Each test should verify a specific behavior
2. **Use descriptive file names** - Names should indicate what's being tested
3. **Group related tests** - Use directories to organize by feature
4. **Test error conditions** - Include tests that verify error messages
5. **Run --bless after changes** - Update expected outputs for intentional changes
6. **Structure specs wisely** - Place common `.spec.toml` at roots, override where needed
7. **Use annotations** - Verify specific error messages, not just failure

---

## Quick Command Reference

```bash
# Run all tests
cargo run -p hashql-compiletest run

# List tests
cargo run -p hashql-compiletest list

# Filter by test name
cargo run -p hashql-compiletest run --filter "test(name)"

# Filter by package
cargo run -p hashql-compiletest run --filter "package(pkg)"

# Combined filter
cargo run -p hashql-compiletest run --filter "package(pkg) & test(name)"

# Update expected outputs
cargo run -p hashql-compiletest run --bless

# Update specific test
cargo run -p hashql-compiletest run --filter "test(name)" --bless
```
