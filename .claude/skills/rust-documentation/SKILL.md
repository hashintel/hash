---
name: rust-documentation
description: Rust documentation practices for HASH codebase. Use when writing doc comments, documenting functions and types, creating error documentation sections, using intra-doc links, documenting traits and modules, writing examples, or following rustdoc conventions.
---

# Rust Documentation Practices

## Purpose

This skill provides comprehensive guidance on documenting Rust code in the HASH repository, following rustdoc conventions and best practices for clear, maintainable API documentation.

## When This Skill Activates

Automatically activates when:

- Writing or updating doc comments in Rust
- Documenting public APIs (functions, types, traits, modules)
- Creating `# Errors`, `# Panics`, or `# Examples` sections
- Using intra-doc links
- Writing module-level documentation
- Documenting error conditions
- Adding code examples to documentation

---

## Core Principles

**HASH documentation follows high-quality standards like `time`, `jiff`, and `serde`:**

✅ **DO:**

- Begin every doc comment with single-line summary
- Use intra-doc links for all type references
- Document all error conditions with `# Errors`
- Include practical examples for public APIs
- Link standard library types: [`Vec`], [`HashMap`], etc.
- Use inline parameter descriptions for simple functions (0-2 params)
- Describe return values in main text, not separate sections

❌ **DON'T:**

- Document standard trait implementations (`Debug`, `Display`, `From`)
- Add separate `# Returns` sections (inline instead)
- Mention variable types already in signatures
- Use comments on same line as code
- Skip error documentation for fallible functions

---

## Quick Reference

### Basic Doc Comment

```rust
/// Retrieves an entity by its UUID.
///
/// Loads the entity from the store and verifies access permissions.
/// Returns the [`Entity`] if found and accessible.
///
/// # Errors
///
/// - [`NotFound`] if the entity doesn't exist
/// - [`AuthorizationError`] if access is denied
///
/// [`NotFound`]: EntityError::NotFound
/// [`AuthorizationError`]: EntityError::Authorization
pub fn get_entity(&self, id: EntityId) -> Result<Entity, Report<EntityError>> {
```

### Intra-Doc Links

```rust
/// Updates the [`User`] using [`UserUpdateStrategy`].
///
/// See [`validation::user`] for validation rules.
///
/// [`validation::user`]: crate::validation::user
```

---

## Documentation Patterns

### For Simple Functions (0-2 params)

Describe parameters inline in the main description:

```rust
/// Processes the `input` elements and returns filtered results.
///
/// Takes a collection of `input` elements, applies the `filter_fn`,
/// and returns a [`Vec`] containing only matching elements.
```

### For Complex Functions (3+ params)

Use explicit `# Arguments` section:

```rust
/// Merges multiple data sources with transformation rules.
///
/// # Arguments
///
/// * `sources` - Collection of data sources to merge
/// * `rules` - Transformation rules to apply
/// * `options` - Configuration controlling merge behavior
/// * `callback` - Optional function for each merged item
```

---

## Detailed Guides

Choose the guide matching your documentation task:

### [function-documentation.md](resources/function-documentation.md)

**Use when:** Documenting functions and methods

- Single-line summaries and descriptions
- Parameter documentation (inline vs. explicit)
- Return value descriptions
- Async function documentation
- When to document vs. skip

### [type-documentation.md](resources/type-documentation.md)

**Use when:** Documenting types, structs, enums, traits

- Struct and enum documentation
- Field-level doc comments
- Trait documentation and contracts
- When to skip trait implementations
- Type invariants

### [error-documentation.md](resources/error-documentation.md)

**Use when:** Documenting error conditions

- `# Errors` section format
- Linking error variants with intra-doc links
- Runtime errors vs. error enums
- Panic documentation with `# Panics`

### [examples-and-links.md](resources/examples-and-links.md)

**Use when:** Adding examples or using intra-doc links

- Writing compilable examples
- Hiding setup code with `#`
- Intra-doc link syntax and patterns
- Module-level documentation
- Performance notes

---

## Common Patterns

### Error Documentation

```rust
/// # Errors
///
/// - [`WebAlreadyExists`] if web ID is taken
/// - [`AuthorizationError`] if permission denied
///
/// [`WebAlreadyExists`]: WebError::WebAlreadyExists
/// [`AuthorizationError`]: WebError::Authorization
```

### Module Documentation

```rust
//! Entity management functionality.
//!
//! Main types:
//! - [`Entity`] - Core entity type
//! - [`EntityStore`] - Storage trait
//!
//! # Examples
//!
//! ```
//! use hash_graph::entity::Entity;
//! ```
```

### Examples with Error Handling

```rust
/// # Examples
///
/// ```rust
/// let entities = get_entities_by_type(type_id)?;
/// assert_eq!(entities.len(), 2);
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
```

---

## Verification

Check documentation builds correctly:

```bash
cargo doc --no-deps --all-features
```

---

## Related

- `.cursor/rules/rust-documentation.mdc` - Full documentation guidelines
- [rust-error-stack](../rust-error-stack/SKILL.md) - Error handling patterns
- [rust-coding-style](../rust-coding-style/SKILL.md) - Coding conventions

---

**Skill Status**: Production-ready following Anthropic best practices ✅
**Line Count**: < 200 (following 500-line rule) ✅
**Progressive Disclosure**: 4 detailed resource files ✅
