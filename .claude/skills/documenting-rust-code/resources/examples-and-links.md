# Examples and Intra-Doc Links Guide

Complete guide for writing examples and using intra-doc links in Rust documentation.

---

## Intra-Doc Links

### Why Use Them

Intra-doc links make documentation navigable and catch broken references at compile time.

**Link everything:**

- Types you mention
- Related functions
- Standard library types
- Error variants

### Basic Syntax

```rust
/// Updates the [`Entity`] using [`UserUpdateStrategy`].
///
/// Returns the updated [`Entity`] or [`EntityError`].
pub fn update(entity: Entity) -> Result<Entity, EntityError> {
```

### Linking Patterns

**Current module items:**

```rust
/// Uses the [`LocalType`] for processing.
```

**Other modules:**

```rust
/// See [`crate::validation::user`] for validation rules.
```

With link definition:

```rust
/// See [`validation::user`] for validation rules.
///
/// [`validation::user`]: crate::validation::user
```

**Standard library:**

```rust
/// Returns a [`Vec`] of [`HashMap`] entries.
/// Uses [`swap_remove`] for efficient removal.
///
/// [`swap_remove`]: Vec::swap_remove
```

**Trait methods:**

```rust
/// Implements [`Iterator::next`] for sequential access.
```

**Error variants:**

```rust
/// # Errors
///
/// - [`NotFound`] if entity doesn't exist
///
/// [`NotFound`]: EntityError::NotFound
```

---

## Writing Examples

### Basic Example Structure

```rust
/// # Examples
///
/// ```rust
/// use hash_graph::entity::Entity;
///
/// let entity = Entity::new(id, properties)?;
/// assert_eq!(entity.id(), id);
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
```

### Example Checklist

- [ ] Imports shown (unless obvious)
- [ ] Error handling included
- [ ] Assertions demonstrate behavior
- [ ] Example compiles
- [ ] Example is minimal but complete

---

## Hiding Setup Code

Use `#` to hide necessary setup from docs display:

```rust
/// # Examples
///
/// ```rust
/// # use hash_graph::entity::*;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let store = create_test_store();
/// # let type_id = EntityTypeId::new();
/// let entity = store.get_entity(type_id)?;
/// println!("Found: {}", entity.name);
/// # Ok(())
/// # }
/// ```
```

**What renders:**

```rust
let entity = store.get_entity(type_id)?;
println!("Found: {}", entity.name);
```

---

## Error Handling in Examples

### Using `?` Operator

```rust
/// # Examples
///
/// ```rust
/// let result = fallible_operation()?;
/// assert!(result.is_valid());
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
```

### Using `expect` for Infallible Cases

```rust
/// # Examples
///
/// ```rust
/// let config = Config::default();
/// let value = config.get("key").expect("should have default key");
/// ```
```

---

## Multi-Step Examples

Show realistic usage patterns:

```rust
/// # Examples
///
/// ```rust
/// # use hash_graph::entity::*;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// // Create entity
/// let mut entity = Entity::new(id, properties)?;
///
/// // Update properties
/// entity.set_property("name", "Updated")?;
/// entity.set_property("status", "active")?;
///
/// // Validate and save
/// entity.validate()?;
/// store.save(&entity)?;
/// # Ok(())
/// # }
/// ```
```

---

## Module Documentation

Use `//!` for module-level docs:

```rust
//! Entity management functionality.
//!
//! This module provides types and functions for creating, updating,
//! and querying entities in the system.
//!
//! # Main Types
//!
//! - [`Entity`] - Core entity type
//! - [`EntityId`] - Unique identifier
//! - [`EntityStore`] - Storage trait
//!
//! # Examples
//!
//! ```rust
//! use hash_graph::entity::{Entity, EntityStore};
//!
//! let entity = Entity::new(id, properties)?;
//! store.save(&entity)?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
```

---

## Performance Notes

Document performance characteristics when relevant:

```rust
/// Retrieves all entities matching the filter.
///
/// # Performance
///
/// This operation has O(n) complexity where n is the total number of
/// entities. Uses pagination internally with 100-item pages.
///
/// For large result sets, consider using [`get_entities_stream`] which
/// provides incremental results with O(1) memory usage.
///
/// [`get_entities_stream`]: Self::get_entities_stream
```

---

## Async Documentation

```rust
/// Processes entity asynchronously.
///
/// # Concurrency
///
/// Spawns background tasks for parallel processing. Requires multi-threaded
/// runtime. Returns when all spawned tasks complete.
///
/// # Examples
///
/// ```rust
/// # use hash_graph::entity::*;
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let result = processor.process_async(entity).await?;
/// assert!(result.is_processed());
/// # Ok(())
/// # }
/// ```
pub async fn process_async(&self, entity: Entity) -> Result<ProcessResult, Error> {
```

---

## Complete Example

```rust
/// Validates and creates entity with type checking.
///
/// Takes `properties` and validates them against the entity's type schema.
/// If validation succeeds, creates a new [`Entity`] with generated UUID.
///
/// # Arguments
///
/// * `type_id` - Entity type defining the schema
/// * `properties` - Key-value pairs for entity properties
/// * `web_id` - Web this entity belongs to
///
/// # Errors
///
/// - [`ValidationError`] if properties don't match schema
/// - [`TypeNotFound`] if entity type doesn't exist
/// - [`DatabaseError`] if storage operation fails
///
/// # Examples
///
/// ```rust
/// # use hash_graph::entity::*;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let store = create_test_store();
/// # let type_id = EntityTypeId::new();
/// # let web_id = WebId::new();
/// let properties = vec![
///     ("name".to_string(), "Example".into()),
///     ("status".to_string(), "active".into()),
/// ];
///
/// let entity_id = store.create_entity(
///     type_id,
///     properties,
///     web_id,
/// )?;
///
/// let entity = store.get_entity(entity_id)?;
/// assert_eq!(entity.get_property("name"), Some(&"Example".into()));
/// # Ok(())
/// # }
/// ```
///
/// [`ValidationError`]: EntityError::Validation
/// [`TypeNotFound`]: EntityError::TypeNotFound
/// [`DatabaseError`]: EntityError::Database
pub fn create_entity(
    &mut self,
    type_id: EntityTypeId,
    properties: Vec<(String, Value)>,
    web_id: WebId,
) -> Result<EntityId, Report<EntityError>> {
```

---

## Related

- [function-documentation.md](function-documentation.md) - Function docs
- [error-documentation.md](error-documentation.md) - Error docs
- [type-documentation.md](type-documentation.md) - Type docs
- [SKILL.md](../SKILL.md) - Overview
