# HashQL compiletest Guide

A comprehensive test harness for HashQL that executes test cases and verifies their behavior against expected outputs. This tool helps ensure that the HashQL language implementation behaves correctly by testing parsing, type checking, execution, and error reporting.

Heavily influenced by the Rust compiler's [compiletest](https://github.com/rust-lang/rust/tree/master/src/tools/compiletest) tool.

## Table of Contents

- [Running Tests](#running-tests)
- [Directory Structure](#directory-structure)
- [Test Directives](#test-directives)
- [Diagnostic Annotations](#diagnostic-annotations)
- [Discovering Test Suites](#discovering-test-suites)
- [Adding New Tests](#adding-new-tests)
- [Updating Expected Output](#updating-expected-output)
- [Debugging Failures](#debugging-failures)
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
# Run tests matching a name pattern
cargo run -p hashql-compiletest run --filter "test(some_test_name)"

# Run all tests in a package
cargo run -p hashql-compiletest run --filter "package(some_package)"

# Combine filters with &
cargo run -p hashql-compiletest run --filter "package(some_package) & test(error_handling)"
```

### Updating Expected Outputs

When you make intentional changes that affect test outputs:

```bash
# Update all tests
cargo run -p hashql-compiletest run --bless

# Update specific test
cargo run -p hashql-compiletest run --filter "test(name)" --bless
```

This updates `.stdout` and `.stderr` files to match actual outputs.

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
| ---- | ------- | -------- |
| `.jsonc` | J-Expr test code | ✅ Yes |
| `.spec.toml` | Test suite specification | ✅ Yes (in dir or parent) |
| `.stdout` | Expected standard output | Optional (empty if none) |
| `.stderr` | Expected diagnostics | Optional (empty if none) |
| `.aux.<ext>` | Auxiliary/secondary output | Suite-dependent |

The harness searches upward from the test file to find `.spec.toml`, stopping at `tests/ui/`. This allows shared specs at directory roots with overrides for specific subdirectories.

### Auxiliary Files

Some test suites produce **auxiliary outputs** beyond stdout/stderr. These are stored with the pattern `test_name.aux.<extension>`.

**Example:** The `mir/reify` suite generates SVG diagrams:

```text
mir/tests/ui/reify/
  nested-if.jsonc
  nested-if.stdout
  nested-if.aux.svg     # CFG diagram
```

Suites declare their auxiliary extensions via the `secondary_file_extensions()` method:

```rust
impl Suite for MirReifySuite {
    fn secondary_file_extensions(&self) -> &[&str] {
        &["svg"]
    }
    // ...
}
```

When running `--bless`, auxiliary files are also updated alongside stdout/stderr.

---

## Test Directives

Directives control test behavior. They **must** be at the start of the file, before any test code.

### Supported Directives

```jsonc
//@ run: pass                      // Test should pass (no errors expected)
//@ run: fail                      // Test should fail with errors (DEFAULT)
//@ run: skip                      // Skip this test
//@ run: skip reason=Not implemented yet

//@ name: custom_test_name         // Override the default test name
//@ description: Tests that...     // Describe test purpose (ENCOURAGED)
//@ suite#key: value               // Suite-specific directive (TOML value)
```

### Run Modes

| Mode | Behavior |
| ---- | -------- |
| `pass` | Test must succeed with no errors |
| `fail` | Test must produce errors (**default if omitted**) |
| `skip` | Test is skipped entirely |

**Important:** If you don't specify `//@ run:`, the test defaults to `fail` mode. Always use `//@ run: pass` explicitly for tests that should succeed.

### Suite-Specific Directives

The `//@ suite#key: value` syntax passes configuration to specific suites. Values are parsed as TOML:

```jsonc
//@ suite#timeout: 30
//@ suite#features: ["experimental"]
```

---

## Diagnostic Annotations

Annotations verify that specific diagnostics appear at expected locations.

### Basic Syntax

```jsonc
"undefined_variable" //~ ERROR unknown variable
```

### Components

- `//~` - Annotation marker
- Line reference (optional): `^`, `v`, `|`, `?`
- Severity: `ERROR`, `WARNING`, `NOTE`, `DEBUG`, or `CRITICAL`
- Optional error code: `[category::subcategory]`
- Message fragment to match

### Line Reference Types

| Syntax | Meaning | Example |
| ------ | ------- | ------- |
| `//~ ERROR msg` | Current line | Error on this exact line |
| `//~^ ERROR msg` | Previous line (1 up) | Error on line above |
| `//~^^ ERROR msg` | 2 lines above | |
| `//~^^^ ERROR msg` | 3 lines above | |
| `//~v ERROR msg` | Next line (1 down) | Error on line below |
| `//~vv ERROR msg` | 2 lines below | |
| `//~vvv ERROR msg` | 3 lines below | |
| `//~\| ERROR msg` | Same line as previous | Multiple errors, same location |
| `//~? ERROR msg` | Unknown/any line | Use sparingly |

### Error Codes

Include optional error codes in brackets:

```jsonc
["+", "string", 42] //~ ERROR[category::subcategory] cannot add
```

### Multi-Annotation Example

```jsonc
["let", "x",          //~^ ERROR first error on the let line
  ["invalid"]         //~ ERROR error on this line
]                     //~| ERROR another error on same line as previous
                      //~| NOTE additional context
```

### Severity Levels

| Level | Use Case |
| ----- | -------- |
| `CRITICAL` | Unrecoverable errors |
| `ERROR` | Standard errors |
| `WARNING` | Non-fatal warnings |
| `NOTE` | Informational notes |
| `DEBUG` | Debug output |

---

## Discovering Test Suites

List all available suites and their descriptions:

```bash
# Human-readable list with descriptions
cargo run -p hashql-compiletest suites

# Machine-readable NDJSON output
cargo run -p hashql-compiletest suites --json
```

### Suite Categories

- `parse/*` - Parsing tests (e.g., `parse/syntax-dump`)
- `ast/lowering/*` - AST lowering phases
- `hir/lower/*` - HIR lowering phases
- `hir/reify` - HIR generation from AST
- `mir/*` - MIR passes and generation
- `eval/*` - Evaluation tests

### Specifying a Suite

In `.spec.toml`:

```toml
suite = "parse/syntax-dump"
```

---

## Adding New Tests

### Step 1: Create the Test File

Create a `.jsonc` file with your test code and directives:

```jsonc
//@ description: Verifies that undefined variables produce an error
//@ run: fail

["let", "x", {"#literal": 42},
  "undefined_var"  //~ ERROR unknown variable
]
```

### Step 2: Create or Verify .spec.toml

Ensure there's a `.spec.toml` file in the directory or a parent:

```toml
suite = "parse/syntax-dump"
```

### Step 3: Generate Expected Outputs

Run with `--bless` to generate initial reference files:

```bash
cargo run -p hashql-compiletest run --filter "test(your_test)" --bless
```

### Step 4: Review Generated Files

Check the generated `.stdout` and `.stderr` files to ensure they contain expected output.

---

## Updating Expected Output

When intentional changes affect test outputs, use `--bless`:

```bash
# Update all failing tests
cargo run -p hashql-compiletest run --bless

# Update specific test
cargo run -p hashql-compiletest run --filter "test(name)" --bless
```

**When to use --bless:**

- After intentionally changing error messages
- After adding new diagnostic information
- When output format changes
- When adding new test cases

**When NOT to use --bless:**

- When debugging unexpected failures (investigate first)
- Without reviewing the diff

---

## Debugging Failures

When a test fails, the harness shows:

1. Test name and location
2. Expected vs. actual output diff
3. Unfulfilled annotations (expected errors that didn't appear)
4. Unexpected diagnostics (errors that appeared but weren't expected)

### Common Failure Types

**Output mismatch:**

- Compare diff between expected and actual
- Check if the change is intentional → use `--bless`
- Check if it's a bug → fix the code

**Unfulfilled annotation:**

- Expected error didn't appear at the specified location
- Check line references (`^`, `v`, `|`) are correct
- Verify the error message fragment matches

**Unexpected diagnostic:**

- An error appeared that wasn't annotated
- Add missing `//~` annotation
- Or fix the code if the error is a bug

### Resolution Steps

1. **Real bug:** Fix the implementation code
2. **Intentional change:** Run `--bless` to update expected outputs
3. **Annotation mismatch:** Update `//~` annotations to match new messages/locations
4. **Missing annotation:** Add `//~` for legitimate new diagnostics

---

## Best Practices

1. **Always include `//@ description:`** - Document what behavior is being tested
2. **Default is `fail` mode** - Explicitly use `//@ run: pass` for passing tests
3. **Keep tests focused** - Each test should verify a specific behavior
4. **Use descriptive file names** - Names should indicate what's being tested
5. **Group related tests** - Use directories to organize by feature
6. **Use annotations precisely** - Verify specific error messages, not just failure
7. **Avoid `//~?`** - Unknown line annotations make tests brittle
8. **Review --bless changes** - Don't blindly accept new outputs
9. **Structure specs wisely** - Place common `.spec.toml` at roots, override where needed

---

## Quick Command Reference

```bash
# Run all tests
cargo run -p hashql-compiletest run

# List tests
cargo run -p hashql-compiletest list

# List available suites
cargo run -p hashql-compiletest suites

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
