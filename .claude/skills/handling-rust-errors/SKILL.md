---
name: handling-rust-errors
description: HASH error handling patterns using error-stack crate. Use when working with Result types, Report types, defining custom errors, propagating errors with change_context, adding context with attach, implementing Error trait, or documenting error conditions in Rust code.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - error
      - Result
      - Report
      - error-stack
      - change_context
      - attach
      - ResultExt
    intent-patterns:
      - "\\b(handle|create|define|propagate|convert)\\b.*?\\berror\\b"
      - "\\bReport<.*>\\b"
---

# Rust Error-Stack Patterns

HASH-specific error handling patterns using the `error-stack` crate for consistent, debuggable error handling across the Rust codebase.

## Core Principles

**HASH uses `error-stack` exclusively for error handling:**

✅ **DO:**

- Use `Report<MyError>` for all error types
- Use concrete error types: `Report<MyError>`
- Import `Error` from `core::error::` (not `std::error::`)
- Import `ResultExt as _` for trait methods

❌ **DON'T:**

- Use `anyhow` or `eyre` crates
- Use `Box<dyn Error>` (except in tests/prototyping)
- Use `Report<Box<dyn Error>>`
- Use `thiserror` (use `derive_more` instead)

## HashQL Compiler Exception

**HashQL compiler code uses a different error handling approach.**

Code in `libs/@local/hashql/*` uses the `hashql-diagnostics` crate instead of `error-stack`. This is because compiler errors require rich formatting capabilities:

- Source spans pointing to exact code locations
- Multiple labeled regions within the same diagnostic
- Fix suggestions with replacement text
- Severity levels (error, warning, hint)

**Which approach to use:**

| Location                                | Error Handling                                                                                            |
|-----------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `libs/@local/hashql/*` (compiler code)  | Use `hashql-diagnostics` → See [writing-hashql-diagnostics](../writing-hashql-diagnostics/SKILL.md) skill |
| Everywhere else                         | Use `error-stack` patterns from this skill                                                                |

Traditional `error-stack` patterns still apply for HashQL infrastructure code (CLI, file I/O, configuration) that doesn't involve compiler diagnostics.

## Quick Start Guide

Choose the reference that matches your current task:

### Defining Errors

**Use when:** Creating new error types or error enums

- Define error types with `derive_more`
- Error enum patterns and variants
- Implement the `Error` trait
- Error type hierarchies

### Propagating Errors

**Use when:** Handling `Result` types, using `?` operator

- Convert errors with `.change_context()` and `.change_context_with()`
- Add context with `.attach()` and `.attach_with()`
- Error conversion patterns

### Documenting Errors

**Use when:** Writing doc comments for fallible functions

- `# Errors` section format
- Link error variants
- Document runtime errors
- Test error conditions

## Common Quick Patterns

### Creating an Error

```rust
use error_stack::Report;

return Err(Report::new(MyError::NotFound))
    .attach(format!("ID: {}", id));
```

### Propagating with Context

```rust
use error_stack::ResultExt as _;

some_result
    .change_context(MyError::OperationFailed)
    .attach("Additional context")?;
```

### Lazy Context (for expensive operations)

```rust
use error_stack::ResultExt as _;

expensive_operation()
    .change_context(MyError::OperationFailed)
    .attach_with(|| format!("Debug info: {:?}", expensive_computation()))?;
```

## References

- [Defining Errors](references/defining-errors.md) - Creating new error types or error enums
- [Propagating Errors](references/propagating-errors.md) - Handling `Result` types, using `?` operator
- [Documenting Errors](references/documenting-errors.md) - Writing doc comments for fallible functions
