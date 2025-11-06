# Function Documentation Guide

Complete guide for documenting functions and methods in Rust.

---

## Documentation Structure

Every public function must have a doc comment with:

1. **Single-line summary** - What the function does
2. **Detailed description** - How it behaves
3. **Parameter descriptions** - Inline (simple) or explicit (complex)
4. **Return value** - Described in main text
5. **Error conditions** - `# Errors` section if fallible
6. **Examples** - `# Examples` section for public APIs

---

## Single-Line Summary

Begin every doc comment with a clear, action-oriented summary:

✅ **Good summaries:**

```rust
/// Retrieves an entity by its UUID.
/// Creates a new web in the system.
/// Processes the input elements and returns filtered results.
```

❌ **Bad summaries:**

```rust
/// This function gets an entity  // "This function" is redundant
/// Entity getter                  // Too vague
/// Gets entity                    // Missing "the" or article
```

---

## Parameter Documentation

### Simple Functions (0-2 parameters)

Describe parameters **inline** in the main description:

```rust
/// Processes the `input` elements and returns a filtered collection.
///
/// Takes a collection of `input` elements, applies the `filter_fn` predicate
/// to each, and returns a [`Vec`] containing only the elements that passed
/// the filter condition.
pub fn process<T, F>(input: &[T], filter_fn: F) -> Vec<T>
where
    F: Fn(&T) -> bool,
{
```

### Complex Functions (3+ parameters)

Use explicit `# Arguments` section with bullet points:

```rust
/// Merges multiple data sources and applies transformation rules.
///
/// This function combines data from various sources, applies the specified
/// transformation rules, and returns a unified data structure.
///
/// # Arguments
///
/// * `sources` - Collection of data sources to merge
/// * `rules` - Transformation rules to apply during merging
/// * `options` - Configuration options controlling the merge behavior
/// * `callback` - Optional function called for each merged item
/// * `context` - Additional context passed to transformation rules
```

---

## Return Value Documentation

**Always** describe return values in the main description, **not** in a separate section:

✅ **Good:**

```rust
/// Retrieves an entity by its UUID.
///
/// Loads the entity from the store and verifies access permissions.
/// Returns the [`Entity`] object if found and accessible.
pub fn get_entity(&self, id: EntityId) -> Result<Entity, Report<EntityError>> {
```

❌ **Bad:**

```rust
/// Retrieves an entity by its UUID.
///
/// # Returns
///
/// The entity if found  // Don't use separate Returns section
```

---

## Async Function Documentation

Document concurrency considerations when relevant:

```rust
/// Processes the entity asynchronously.
///
/// Fetches entity data, validates it, and stores the result. The operation
/// runs concurrently with other async tasks but maintains consistency
/// guarantees through database transactions.
///
/// # Concurrency
///
/// This function spawns multiple tasks to process entity attributes in
/// parallel. It should be called from a multi-threaded runtime context.
///
/// # Errors
///
/// - [`ValidationError`] if entity data is invalid
/// - [`DatabaseError`] if storage operation fails
pub async fn process_entity(&self, id: EntityId) -> Result<(), Report<ProcessError>> {
```

---

## When to Skip Documentation

**Skip documentation for:**

- Standard trait implementations (`Debug`, `Display`, `From`, `Into`)
- Trait-derived methods (unless special behavior)
- Private helper functions (optional)
- Obvious getters/setters

```rust
// Good: No docs needed
impl Debug for MyType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // implementation
    }
}

// Good: No docs needed
impl From<MyType> for String {
    fn from(value: MyType) -> Self {
        value.to_string()
    }
}
```

**Document trait implementations only when:**

- Special behavior beyond trait definition
- Performance considerations
- Different failure modes
- Additional functionality

```rust
// Good: Documentation needed for special behavior
/// Custom serialization supporting legacy v1 format.
///
/// This implementation handles both current schema and deprecated v1
/// for backward compatibility with older data.
impl Serialize for ComplexType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // special implementation
    }
}
```

---

## Performance Documentation

Add `# Performance` sections for performance-critical functions:

```rust
/// Retrieves all entities matching the filter.
///
/// # Performance
///
/// This operation has O(n) complexity where n is the number of entities
/// matching the filter. For large result sets, consider using the streaming
/// version [`get_entities_stream`] instead.
///
/// [`get_entities_stream`]: Self::get_entities_stream
```

**When to document performance:**

- Processing variable-sized inputs
- Hot path functions
- Complex algorithms (non-obvious complexity)
- Public APIs with performance guarantees
- Resource-intensive operations
- Operations with tradeoffs

**When to skip:**

- Obvious characteristics (simple getters/setters)
- Internal implementation details
- Standard library usage with no special patterns
- Non-performance-sensitive code

---

## Complete Example

```rust
/// Validates and creates a new entity in the system.
///
/// Takes the provided `properties` and validates them against the entity's
/// type schema. If validation succeeds, creates a new [`Entity`] with a
/// generated UUID and stores it in the database. Returns the created entity's
/// ID.
///
/// # Arguments
///
/// * `type_id` - The entity type defining the schema
/// * `properties` - Key-value pairs for entity properties
/// * `web_id` - The web this entity belongs to
/// * `account` - Account creating the entity (for permissions)
///
/// # Errors
///
/// - [`ValidationError`] if properties don't match schema
/// - [`TypeNotFound`] if entity type doesn't exist
/// - [`AuthorizationError`] if account lacks permission
/// - [`DatabaseError`] if storage operation fails
///
/// # Examples
///
/// ```rust
/// # use hash_graph::entity::*;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// let properties = vec![
///     ("name".to_string(), "Example".into()),
///     ("description".to_string(), "An example entity".into()),
/// ];
///
/// let entity_id = store.create_entity(
///     type_id,
///     properties,
///     web_id,
///     account,
/// )?;
/// # Ok(())
/// # }
/// ```
///
/// [`ValidationError`]: EntityError::Validation
/// [`TypeNotFound`]: EntityError::TypeNotFound
/// [`AuthorizationError`]: EntityError::Authorization
/// [`DatabaseError`]: EntityError::Database
pub fn create_entity(
    &mut self,
    type_id: EntityTypeId,
    properties: Vec<(String, Value)>,
    web_id: WebId,
    account: &Account,
) -> Result<EntityId, Report<EntityError>> {
```

---

## Related

- [error-documentation.md](error-documentation.md) - Documenting errors
- [examples-and-links.md](examples-and-links.md) - Examples and links
- [type-documentation.md](type-documentation.md) - Types and traits
- [SKILL.md](../SKILL.md) - Overview
