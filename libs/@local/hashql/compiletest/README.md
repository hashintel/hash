# HashQL Compiletest

A comprehensive test harness for HashQL that executes test cases and verifies their behavior against expected outputs. This tool helps ensure that the HashQL language implementation behaves correctly by testing parsing, type checking, execution, and error reporting.

This tool has been heavily influenced by the Rust compiler's [compiletest](https://github.com/rust-lang/rust/tree/master/src/tools/compiletest) tool.

## Overview

HashQL Compiletest automates the process of:

- Running J-Expr test cases from any snapshot that's located in a `tests/ui` directory of a HashQL crate
- Verifying actual outputs against expected outputs
- Checking that diagnostic messages (errors, warnings) appear as expected
- Comparing stdout/stderr with reference files

## Running Tests

### Basic Usage

To run all tests:

```bash
cargo run -p hashql-compiletest run
```

To list all available tests without running them:

```bash
cargo run -p hashql-compiletest list
```

### Filtering Tests

You can run a subset of tests using the `--filter` option:

```bash
# Run tests in a specific namespace
cargo run -p hashql-compiletest run --filter "test(some_namespace::test_name)"

# Run all tests in a package
cargo run -p hashql-compiletest run --filter "package(some_package)"

# Run tests matching a pattern
cargo run -p hashql-compiletest run --filter "package(some_package) & test(error_handling)"
```

The filter patterns follow the [nextest filter syntax](https://nexte.st/docs/filtersets/).

### Updating Expected Outputs

When you make intentional changes that affect test outputs, you can update the expected output files:

```bash
cargo run -p hashql-compiletest run --bless
```

This will update `.stdout` and `.stderr` files for all tests with their actual outputs.

## Authoring Test Cases

### Directory Structure

Tests are organized under the `tests/ui` directory of each package. **Important**: The `tests/ui` directory must be nested in an actual crate that's part of the workspace - the test harness discovers tests by scanning workspace members.

```text
package_name/
  tests/
    ui/
      namespace1/
        .spec.toml        # Test suite specification
        test_case1.jsonc  # A J-Expr test file
        test_case1.stdout # Expected output for test_case1
        test_case1.stderr # Expected diagnostics for test_case1
      namespace2/
        .spec.toml
        another_test.jsonc
        another_test.stdout
        another_test.stderr
```

### Test Case Components

Each test consists of:

1. **J-Expr test file** (`.jsonc`): Contains the HashQL code to test, written in J-Expr syntax (JSON-based S-expressions)
2. **Test specification** (`.spec.toml`): Defines the test suite to use for execution
3. **Expected stdout** (`.stdout`): The expected standard output (optional if no output expected)
4. **Expected stderr** (`.stderr`): The expected standard error output (optional if no errors expected)

### Test Specification

The `.spec.toml` file defines which test suite to use:

```toml
suite = "parse/syntax-dump"
```

The test harness will search for the first `.spec.toml` file starting from the test file's directory and moving up through parent directories, until it hits the `test/ui` directory. This allows you to:

1. Place a `.spec.toml` at the root of a test directory to apply to all tests in subdirectories
2. Override the specification for specific subdirectories or individual tests by placing a `.spec.toml` closer to the test file

Every test file must have an associated `.spec.toml` in its directory or any parent directory, otherwise the test harness will panic.

### Creating a New Test

Create a `.jsonc` file with your test code:

```jsonc
// example_test.jsonc
["let", "x", {"#literal": 42},
  "x"
]
```

Ensure there's a `.spec.toml` file in the directory or a parent directory:

```toml
# .spec.toml
suite = "parse/syntax-dump"
```

Run the test with the `--bless` flag to generate initial reference files:

```bash
cargo run -p hashql-compiletest run --filter "test(example_test)" --bless
```

This will create `.stdout` and `.stderr` files with the actual output.

### Test Directives

You can add special directives to control test behavior:

```jsonc
//@ run: pass      // Test should pass
//@ run: fail      // Test should fail (default)
//@ run: skip      // Skip this test
//@ run: skip reason=Not implemented yet  // Skip with reason
//@ name: custom_test_name  // Set a custom name for the test
```

**Important**: If you don't specify a run mode with `//@ run:`, the test will default to `fail` mode, expecting the test to produce errors.

**Important**: Directives can only be placed at the beginning of the file, and must always be at the start of the file.

### Annotating Expected Diagnostics

For tests that should produce specific error messages or warnings, you can use diagnostic annotations:

```jsonc
"undefined_variable" //~ ERROR unknown variable

["+", {"#literal": "string"}, {"#literal": 42}] //~ ERROR[ast:typchk::mismatch] cannot add string and number
```

Annotation format:

- `//~` marks the beginning of an annotation
- Specify the severity: `ERROR`, `WARNING`, `INFO`, `DEBUG`, or `CRITICAL`
- Optionally specify the error code in brackets: `[ast::typchk::mismatch]`
- Include a message fragment that should be present in the error. The diagnostics labels (only those that point to the error), help, note and canonical name will be checked.

You can also use line references:

- `//~ ERROR message` annotates the current line
- `//~^ ERROR message` annotates the previous line
- `//~vvv ERROR message` annotates 3 lines above
- `//~^^^ ERROR message` annotates 3 lines below
- `//~| ERROR message` annotates the same line as the previous annotation
- `//~? ERROR message` references an unknown line

This is heavily inspired by the [Rust's UI compiletest](https://rustc-dev-guide.rust-lang.org/tests/ui.html#error-annotations).

## Available Test Suites

The following test suites are available:

- `parse/syntax-dump`: Parses the input and dumps the AST structure

## Debugging Test Failures

When a test fails, the tool shows:

- The test name and location
- The expected vs. actual output for stdout/stderr
- Any unfulfilled annotations (expected errors that didn't appear)
- Any unexpected diagnostics (errors that appeared but weren't expected)

To fix failing tests, you can:

1. Fix the code if the test is revealing a real bug
2. Update the expected output with `--bless` if the change is intentional
3. Update the test's annotations to match new/changed error messages

## Extending Test Suites

To add a new test suite:

1. Create a new struct that implements the `Suite` trait
2. Add your suite to the `SUITES` array in `suite/mod.rs`
3. Implement the `run` method to process the AST and produce output or diagnostics

```rust
struct MyTestSuite;

impl Suite for MyTestSuite {
    fn name(&self) -> &'static str {
        "my/test-suite"  // This is what you'll reference in .spec.toml
    }

    fn run(
        &self,
        expr: Expr<'_>,
        diagnostics: &mut Vec<SuiteDiagnostic>
    ) -> Result<String, SuiteDiagnostic> {
        // Process the expression and return:
        // - Ok(String) for successful execution with stdout
        // - Err(diagnostic) for fatal errors
        // - Add non-fatal diagnostics to the diagnostics vector
    }
}
```

## Best Practices

1. **Keep tests focused**: Each test should verify a specific behavior or edge case
2. **Write descriptive file names**: The file name should clearly indicate what's being tested
3. **Group related tests**: Use directories to organize tests by feature or behavior
4. **Test error conditions**: Include tests that explicitly verify error messages
5. **Update tests after changes**: Run with `--bless` after intentional changes to behavior
6. **Structure your spec files wisely**: Place common `.spec.toml` files at directory roots and only override where needed
