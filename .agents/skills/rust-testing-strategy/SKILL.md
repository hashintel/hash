---
name: rust-testing-strategy
description: HASH Rust testing strategy. Use when writing Rust unit, integration, or snapshot tests, or choosing assertion and test-organization patterns.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - rust test
      - cargo nextest
      - insta
      - similar_asserts
    intent-patterns:
      - "\\b(write|add|run|fix)\\b.*?\\b(rust|cargo)\\b.*?\\btest"
      - "\\b(nextest|snapshot test|insta)\\b"
---

# Rust Testing Strategy

## Verification Commands

- When modifying Rust code, run clippy to detect issues:

  ```bash
  cargo clippy --all-features --all-targets --workspace --no-deps
  ```

- Use `cargo doc --no-deps --all-features` to check documentation

## Test Execution

- Use `cargo-nextest` for running unit and integration tests
- Use the default test runner for documentation tests
- For comprehensive verification, run the complete test suite
- Database seeding can be performed using yarn commands in the project's package.json

## Test Design Principles

- Test both happy paths and error conditions for each function
- For each error case in your code, write a corresponding test
- Test boundary conditions and edge cases explicitly
- Include tests for invalid or malformed inputs
- For streaming encoders/decoders, test partial data handling and buffer management
- Aim for high test coverage but prioritize test quality over quantity
- Structure tests following the Arrange-Act-Assert pattern

## Assertion Standards

- Use descriptive assertion messages that explain the expected behavior
- All assertion messages (including `expect()`, `unwrap()` and `assert*()`) should follow the "should..." format:

  ```rust
  // Good examples:
  value.expect("should contain a valid configuration");
  assert_eq!(result, expected, "Result should match the expected value");
  ```

- Use `expect()` or `expect_err()` with clear messages instead of `unwrap()` or `unwrap_err()`
- Prefer `assert_eq!` with custom messages over bare assertions when comparing values
- When testing errors, assert on specific error types or message contents, not just that an error occurred
- Balance assertions to verify functionality without creating brittle tests

## Test Organization

- Group related tests into appropriate modules
- Use helper functions to avoid code duplication in tests
- Consider using parameterized tests for testing similar functionality with different inputs

## Test Naming

A test name is a short label with the shape `<subject>_<case>[_<variant>]`:

- `<subject>` is the operation, type or function under test. It does not repeat the name of the enclosing module, because the test path already carries that.
- `<case>` is what distinguishes this test from its siblings under the same subject: an operand shape, an input class or a code path.
- `<variant>` narrows the case further when two tests share one, and is otherwise absent.

The shape buys two things. Tests of one subject share a prefix, so a module's test list reads as a table of subject × case and `cargo nextest run -E 'test(<subject>_)'` selects the family. And the name says what the test covers while the doc comment says what it asserts and why, so neither repeats the other.

What a name never carries:

- A `test_` prefix, an article, a narration verb (`should`, `works`, `correctly`) or a `when`/`with`/`that` clause. The story a sentence-name would tell belongs in the test's doc comment and its assertion messages.
- More than about six words. Three to five is the norm, and a longer name is a test doing too much, where the fix is one test per case.
- The rejection, for a negative case. The name is the input class (`ice_invalid_subscript_type`, `rank_positions_short`, `rows_out_of_domain`), with no `err_` prefix or `_err` suffix. An outcome word is the final token only when the case alone is ambiguous (`eq_same_type_accepted`).

Where the shape meets a test framework:

- A property test, or an `rstest` case set, takes its name from the property it tests (`lattice_laws`, `solve_anti_symmetry`, `condensation_is_dag`).
- Renaming a snapshot test renames the snapshot files derived from its name in the same change.

```rust
// Before: a sentence, three cases in one test, the outcome in the name.
async fn rank_pair_tampers_name_their_own_variants() { /* … */ }
async fn short_node_identity_table_refuses() { /* … */ }

// After: one label per case, the outcome in the doc comment.
/// Open refuses a reverse rank permutation short of the code column, under `Columns`.
async fn rank_positions_short() { /* … */ }
/// Open refuses a reverse rank permutation that is no permutation, under `RankInverse`.
async fn rank_positions_constant() { /* … */ }
/// Open refuses a node identity table short of the code column, under `Identities`.
async fn node_identities_short() { /* … */ }
```

## Test Code Quality

- Follow the same code quality standards in test code as in production code
- Add appropriate assertions for array/slice access to avoid clippy warnings
- Document test scenarios with clear comments explaining:
  - The setup (input and environment)
  - The action being tested
  - The expected outcome
  - Why the outcome is expected
- Consider adding custom test utilities to simplify common testing patterns
- Use the `json!` macro from `serde_json` instead of constructing JSON as raw strings

```rust
// Bad:
let json_str = "{\"name\":\"value\",\"nested\":{\"key\":42}}";

// Good:
use serde_json::json;
let json_value = json!({
    "name": "value",
    "nested": {
        "key": 42
    }
});
```
