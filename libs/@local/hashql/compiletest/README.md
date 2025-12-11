# hashql-compiletest

A test harness for HashQL that executes test cases and verifies their behavior against expected outputs. Tests parsing, type checking, execution, and error reporting.

Heavily influenced by the Rust compiler's [compiletest](https://github.com/rust-lang/rust/tree/master/src/tools/compiletest) tool.

## Running Tests

```bash
cargo run -p hashql-compiletest run                           # Run all tests
cargo run -p hashql-compiletest list                          # List tests
cargo run -p hashql-compiletest run --filter "test(name)"     # Filter by name
cargo run -p hashql-compiletest run --filter "package(pkg)"   # Filter by package
cargo run -p hashql-compiletest run --bless                   # Update expected outputs
```

Filters use [nextest filter syntax](https://nexte.st/docs/filtersets/).

## Directory Structure

Tests live under `tests/ui/` in HashQL crates. The directory **must** be in a workspace member crate.

```text
package_name/
  tests/
    ui/
      category/
        .spec.toml        # Test suite specification (required)
        test_case.jsonc   # J-Expr test file
        test_case.stdout  # Expected output (run: pass)
        test_case.stderr  # Expected errors (run: fail)
        test_case.aux.svg # Auxiliary output (some suites)
```

### Test Components

| File | Purpose | Required |
| ---- | ------- | -------- |
| `.jsonc` | J-Expr test code | ✅ Yes |
| `.spec.toml` | Test suite specification | ✅ Yes (in dir or parent) |
| `.stdout` | Expected standard output | Optional |
| `.stderr` | Expected diagnostics | Optional |
| `.aux.<ext>` | Auxiliary/secondary output | Suite-dependent |

The harness searches upward from the test file to find `.spec.toml`, stopping at `tests/ui/`. This allows shared specs at directory roots with overrides for subdirectories.

### Auxiliary Files

Some suites produce auxiliary outputs beyond stdout/stderr, stored as `test_name.aux.<extension>`. For example, the `mir/reify` suite generates SVG diagrams. These are also updated when running `--bless`.

## Test Directives

Directives control test behavior and **must** appear at the start of the file:

```jsonc
//@ run: pass                      // Test should pass (no errors expected)
//@ run: fail                      // Test should fail with errors (DEFAULT)
//@ run: skip                      // Skip this test
//@ run: skip reason=Not implemented yet

//@ name: custom_test_name         // Override the default test name
//@ description: Tests that...     // Describe test purpose (encouraged)
//@ suite#key: value               // Suite-specific directive (TOML value)
```

**Important:** If you don't specify `//@ run:`, the test defaults to `fail` mode.

## Diagnostic Annotations

Annotations verify that specific diagnostics appear at expected locations:

```jsonc
"undefined_variable" //~ ERROR unknown variable

["+", {"#literal": "string"}, {"#literal": 42}] //~ ERROR[category::code] cannot add
```

### Annotation Format

- `//~` - Annotation marker
- Line reference (optional): `^`, `v`, `|`, `?`
- Severity: `ERROR`, `WARNING`, `NOTE`, `DEBUG`, or `CRITICAL`
- Optional error code: `[category::subcategory]`
- Message fragment to match

### Line References

| Syntax | Meaning |
| ------ | ------- |
| `//~ ERROR msg` | Current line |
| `//~^ ERROR msg` | Previous line (1 up) |
| `//~^^ ERROR msg` | 2 lines above |
| `//~^^^ ERROR msg` | 3 lines above |
| `//~v ERROR msg` | Next line (1 down) |
| `//~vv ERROR msg` | 2 lines below |
| `//~vvv ERROR msg` | 3 lines below |
| `//~\| ERROR msg` | Same line as previous annotation |
| `//~? ERROR msg` | Unknown/any line (use sparingly) |

### Example

```jsonc
["let", "x",          //~^ ERROR first error on the let line
  ["invalid"]         //~ ERROR error on this line
]                     //~| ERROR another error on same line
                      //~| NOTE additional context
```

## Discovering Test Suites

There are many test suites (24+). Discover them dynamically:

```bash
# Find suite names
grep -r 'fn name(&self)' libs/@local/hashql/compiletest/src/suite/*.rs

# See what suites existing tests use
find libs/@local/hashql -name '.spec.toml' -exec cat {} \;
```

### Specifying a Suite

In `.spec.toml`:

```toml
suite = "parse/syntax-dump"
```

## Adding New Tests

1. **Create the test file** (`.jsonc`) with directives and code
2. **Ensure `.spec.toml` exists** in the directory or parent
3. **Generate expected outputs**: `cargo run -p hashql-compiletest run --filter "test(name)" --bless`
4. **Review generated files** to ensure they contain expected output

## Debugging Failures

When a test fails, the harness shows:

- Test name and location
- Expected vs. actual output diff
- Unfulfilled annotations (expected errors that didn't appear)
- Unexpected diagnostics (errors that appeared but weren't expected)

### Resolution

| Failure Type | Action |
| ------------ | ------ |
| Real bug | Fix the implementation code |
| Intentional change | Run `--bless` to update expected outputs |
| Annotation mismatch | Update `//~` annotations to match new messages/locations |
| Missing annotation | Add `//~` for legitimate new diagnostics |

## Extending Test Suites

To add a new test suite:

1. Create a struct implementing the `Suite` trait
2. Add your suite to the `SUITES` array in `suite/mod.rs`
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
        // Return Ok(stdout) or Err(fatal_diagnostic)
        // Add non-fatal diagnostics to the vector
    }
}
```

## Best Practices

- **Always include `//@ description:`** - Document what behavior is being tested
- **Keep tests focused** - Each test should verify a specific behavior
- **Use descriptive file names** - Names should indicate what's being tested
- **Use annotations precisely** - Verify specific error messages, not just failure
- **Avoid `//~?`** - Unknown line annotations make tests brittle
- **Review `--bless` changes** - Don't blindly accept new outputs
