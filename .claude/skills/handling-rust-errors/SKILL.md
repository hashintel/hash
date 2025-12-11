---
name: handling-rust-errors
description: HASH error handling patterns using error-stack crate. Use when working with Result types, Report types, defining custom errors, propagating errors with change_context, adding context with attach, implementing Error trait, or documenting error conditions in Rust code.
---

# Rust Error-Stack Patterns

## Purpose

This skill provides HASH-specific error handling patterns using the `error-stack` crate. It ensures consistent, debuggable error handling across the Rust codebase.

## When This Skill Activates

Automatically activates when:

- Working with `Result` types or error handling
- Defining custom error types
- Using `Report`, `attach`, `change_context`
- Handling errors in async contexts
- Documenting error conditions

---

## Core Principles

**HASH uses `error-stack` exclusively for error handling:**

✅ **DO:**

- Use `Report<MyError>` for all error types
- Use concrete error types: `Report<MyError>`
- Import `Error` from `core::error::` (not `std::error::`)
- Import `ResultExt` as `ResultExt as _` for trait methods

❌ **DON'T:**

- Use `anyhow` or `eyre` crates
- Use `Box<dyn Error>` (except in tests/prototyping)
- Use `Report<Box<dyn Error>>`
- Use `thiserror` (use `derive_more` instead)

---

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

---

## Quick Start Guide

Choose the resource that matches your current task:

### 📝 [Defining Errors](resources/defining-errors.md)

**Use when:** Creating new error types or error enums

- How to define error types with `derive_more`
- Error enum patterns and variants
- Implementing the `Error` trait
- Error type hierarchies

### 🔄 [Propagating Errors](resources/propagating-errors.md)

**Use when:** Handling `Result` types, using `?` operator

- Converting errors with `.change_context()` and `.change_context_with()`
- Adding context with `.attach()` and `.attach_with()`
- Error conversion patterns

### 📚 [Documenting Errors](resources/documenting-errors.md)

**Use when:** Writing doc comments for fallible functions

- `# Errors` section format
- Linking error variants
- Documenting runtime errors
- Testing error conditions

---

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

---

## Need More Details?

Load the specific resource file for your task:

- **Defining errors?** → See [defining-errors.md](resources/defining-errors.md)
- **Propagating errors?** → See [propagating-errors.md](resources/propagating-errors.md)
- **Documenting errors?** → See [documenting-errors.md](resources/documenting-errors.md)

---

## Related Guidelines

- `.cursor/rules/rust-error-handling.mdc` - Full error handling guidelines
- `.cursor/rules/rust-documentation.mdc` - Error documentation format
- `.cursor/rules/rust-testing-strategy.mdc` - Testing error conditions

---

**Skill Status**: Production-ready following Anthropic best practices ✅
**Line Count**: 127 (following 500-line rule) ✅
**Progressive Disclosure**: 3 detailed resource files ✅
