---
name: documenting-rust-code
description: Rust documentation practices for HASH codebase. Use when writing doc comments, documenting functions/types/traits/modules, creating error sections, using intra-doc links, or following rustdoc conventions.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - rustdoc
      - doc comment
      - documentation
      - intra-doc link
    intent-patterns:
      - "\\bdocument(ing|ation)?\\b.*?\\b(rust|function|type|struct|enum|trait|module)\\b"
      - "\\b(write|add|create)\\b.*?\\bdoc\\s*comment\\b"
      - "\\b#\\s*(Errors|Panics|Examples|Arguments)\\b"
---

# Rust Documentation Practices

Comprehensive guidance on documenting Rust code in the HASH repository following rustdoc conventions.

## Core Principles

**Follow high-quality standards like `time`, `jiff`, and `serde`:**

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

## Documentation Patterns

### Simple Functions (0-2 params)

Describe parameters inline:

```rust
/// Processes the `input` elements and returns filtered results.
///
/// Takes a collection of `input` elements, applies the `filter_fn`,
/// and returns a [`Vec`] containing only matching elements.
```

### Complex Functions (3+ params)

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

## Verification

```bash
cargo doc --no-deps --all-features
```

## References

- **[references/function-documentation.md](references/function-documentation.md)**: Functions and methods documentation patterns
- **[references/type-documentation.md](references/type-documentation.md)**: Types, structs, enums, and traits documentation
- **[references/error-documentation.md](references/error-documentation.md)**: Error conditions and panics documentation
- **[references/examples-and-links.md](references/examples-and-links.md)**: Examples and intra-doc links usage
