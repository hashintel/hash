# Error Documentation Guide

Complete guide for documenting error conditions in Rust functions.

---

## The `# Errors` Section

**Every fallible function** (returning `Result`) must document error conditions:

```rust
/// Creates a new web in the system.
///
/// Registers the web with the given parameters and ensures uniqueness.
///
/// # Errors
///
/// - [`WebAlreadyExists`] if a web with the same ID exists
/// - [`AuthorizationError`] if the account lacks permission
/// - [`DatabaseError`] if the database operation fails
///
/// [`WebAlreadyExists`]: WebError::WebAlreadyExists
/// [`AuthorizationError`]: WebError::Authorization
/// [`DatabaseError`]: WebError::Database
pub fn create_web(&mut self) -> Result<WebId, Report<WebError>> {
```

---

## Linking Error Variants

Use intra-doc links for error enum variants:

### Format

```rust
/// # Errors
///
/// - [`VariantName`] - when this happens
///
/// [`VariantName`]: ErrorType::VariantName
```

### Example

```rust
pub enum EntityError {
    NotFound,
    Validation,
    Database,
}

/// # Errors
///
/// - [`NotFound`] if entity doesn't exist
/// - [`Validation`] if data is invalid
///
/// [`NotFound`]: EntityError::NotFound
/// [`Validation`]: EntityError::Validation
```

---

## Runtime Errors

For errors created at runtime (not enum variants), use plain text:

```rust
/// Validates input values are unique.
///
/// # Errors
///
/// Returns a validation error if the input contains duplicates
pub fn validate_unique(values: &[String]) -> Result<(), Report<ValidationError>> {
```

---

## External Crate Errors

For errors from external crates, describe without links:

```rust
/// Parses JSON configuration from file.
///
/// # Errors
///
/// - Returns IO error if file cannot be read
/// - Returns parse error if JSON is malformed
pub fn load_config(path: &Path) -> Result<Config, Box<dyn Error>> {
```

---

## Panic Documentation

Use `# Panics` for functions that can panic:

```rust
/// Converts the entity ID to a UUID.
///
/// # Panics
///
/// Panics if the entity ID contains an invalid UUID format.
pub fn to_uuid(&self) -> Uuid {
    Uuid::parse_str(&self.id).expect("should be valid UUID")
}
```

**Note:** Prefer returning `Result` over panicking in library code.

---

## Complete Example

```rust
/// Updates entity properties with validation.
///
/// Applies the given `changes` to the entity after validating them
/// against the entity's type schema. Returns the updated entity.
///
/// # Errors
///
/// - [`NotFound`] if entity doesn't exist
/// - [`ValidationError`] if changes violate schema
/// - [`AuthorizationError`] if caller lacks write permission
/// - [`ConcurrencyError`] if entity was modified concurrently
/// - [`DatabaseError`] if the update operation fails
///
/// # Panics
///
/// Panics if `changes` is empty (use `has_changes()` to check first).
///
/// [`NotFound`]: EntityError::NotFound
/// [`ValidationError`]: EntityError::Validation
/// [`AuthorizationError`]: EntityError::Authorization
/// [`ConcurrencyError`]: EntityError::Concurrency
/// [`DatabaseError`]: EntityError::Database
pub fn update_entity(
    &mut self,
    id: EntityId,
    changes: PropertyChanges,
) -> Result<Entity, Report<EntityError>> {
    assert!(!changes.is_empty(), "changes must not be empty");
    // implementation
}
```

---

## Error Documentation Checklist

- [ ] `# Errors` section for all `Result`-returning functions
- [ ] Each error variant listed with bullet point
- [ ] Intra-doc links for enum variants
- [ ] Plain descriptions for runtime/external errors
- [ ] Link definitions at end of doc comment
- [ ] `# Panics` section if function can panic

---

## Common Patterns

### Multiple Error Types

```rust
/// # Errors
///
/// - [`IoError`] if file operations fail
/// - [`ParseError`] if data format is invalid
/// - [`ValidationError`] if data doesn't meet requirements
///
/// [`IoError`]: Error::Io
/// [`ParseError`]: Error::Parse
/// [`ValidationError`]: Error::Validation
```

### Optional Operations

```rust
/// Tries to load cached data, returns `None` if not cached.
///
/// # Errors
///
/// - [`CacheError`] if cache is corrupted
/// - [`IoError`] if cache file cannot be read
///
/// Returns `Ok(None)` if data is not in cache (not an error).
///
/// [`CacheError`]: Error::Cache
/// [`IoError`]: Error::Io
pub fn try_load_cached(&self) -> Result<Option<Data>, Report<Error>> {
```

### Async Functions

```rust
/// Fetches entity from remote store.
///
/// # Errors
///
/// - [`NetworkError`] if connection fails
/// - [`TimeoutError`] if request exceeds deadline
/// - [`NotFound`] if entity doesn't exist remotely
///
/// [`NetworkError`]: RemoteError::Network
/// [`TimeoutError`]: RemoteError::Timeout
/// [`NotFound`]: RemoteError::NotFound
pub async fn fetch_remote(&self, id: EntityId) -> Result<Entity, Report<RemoteError>> {
```

---

## Related

- [function-documentation.md](function-documentation.md) - Function docs
- [../rust-error-stack/SKILL.md](../../rust-error-stack/SKILL.md) - Error handling patterns
- [SKILL.md](../SKILL.md) - Overview
