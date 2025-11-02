# Type Documentation Guide

Complete guide for documenting types, structs, enums, and traits in Rust.

---

## Struct Documentation

### Basic Structure

```rust
/// Unique identifier for an entity in the system.
///
/// Combines entity UUID and web ID for precise references across the API.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EntityId {
    pub entity_uuid: EntityUuid,
    pub web_id: WebId,
}
```

### When to Document Fields

✅ **Document when field purpose is NOT obvious:**

```rust
pub struct EntityQuery {
    /// Maximum number of results to return (default: 100)
    pub limit: Option<usize>,

    /// Include deleted entities in results
    pub include_deleted: bool,
}
```

❌ **Don't document obvious fields:**

```rust
pub struct User {
    pub id: UserId,        // ID is obvious
    pub name: String,      // name is obvious
    pub email: String,     // email is obvious
}
```

---

## Enum Documentation

### Document WHY, not WHAT

✅ **Good - explains purpose:**

```rust
/// Entity lifecycle state.
///
/// Controls validation rules and access permissions at each stage.
pub enum EntityState {
    Draft,      // No docs needed - obvious
    Published,
    Archived,
    Deleted,
}
```

❌ **Bad - restates the obvious:**

```rust
pub enum EntityState {
    /// The draft state        // Redundant
    Draft,
    /// The published state    // Redundant
    Published,
}
```

### When Variants Need Docs

Document variants only when they:

- Have non-obvious behavior
- Affect system state in special ways
- Have constraints or invariants

```rust
pub enum CacheStrategy {
    /// Never cache (always fetch fresh)
    None,

    /// Cache with TTL expiration
    Timed { seconds: u64 },

    /// Cache until explicitly invalidated
    Persistent,

    /// Adaptive caching based on access patterns (experimental)
    Adaptive,
}
```

---

## Trait Documentation

Focus on contract and guarantees, not restating method signatures:

```rust
/// Store for entity data with transactional guarantees.
///
/// All operations are atomic and maintain consistency even under
/// concurrent access.
pub trait EntityStore: Send + Sync {
    /// Retrieves entity if it exists and caller has access.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if entity doesn't exist
    /// - [`AccessDenied`] if caller lacks permission
    ///
    /// [`NotFound`]: StoreError::NotFound
    /// [`AccessDenied`]: StoreError::AccessDenied
    fn get_entity(&self, id: EntityId) -> Result<Entity, Report<StoreError>>;
}
```

---

## Newtype Pattern

Document invariants and guarantees, not the wrapping itself:

✅ **Good - explains guarantees:**

```rust
/// Non-empty string validated at construction.
///
/// Guaranteed to contain at least one non-whitespace character.
#[derive(Debug, Clone)]
pub struct NonEmptyString(String);
```

❌ **Bad - states the obvious:**

```rust
/// A string wrapper
pub struct NonEmptyString(String);
```

---

## Generic Types

Document constraints and behavior, not type parameters themselves:

```rust
/// LRU cache with configurable eviction.
///
/// Evicts least-recently-used items when capacity is reached.
/// All operations are O(1) amortized.
pub struct LruCache<K, V>
where
    K: Hash + Eq,
{
    // fields...
}
```

---

## Complex Types

Add sections only when behavior is non-obvious:

```rust
/// Temporal entity with complete version history.
///
/// # Version Storage
///
/// Versions are stored as deltas from previous state for space efficiency.
/// Full reconstruction requires replaying deltas (O(n) where n = versions).
///
/// # Querying
///
/// - `current()` - O(1), returns latest version
/// - `at_time(t)` - O(log n + m), binary search + delta replay
///
/// For frequent historical queries, use snapshot API instead.
pub struct TemporalEntity {
    // fields...
}
```

---

## What NOT to Document

**Skip documentation for:**

1. **Obvious structs:**

   ```rust
   struct Point { x: f64, y: f64 }  // No docs needed
   ```

2. **Standard trait implementations:**

   ```rust
   impl Debug for MyType { ... }    // No docs needed
   impl From<A> for B { ... }       // No docs needed
   ```

3. **Self-explanatory type aliases:**

   ```rust
   type Result<T> = std::result::Result<T, Error>;  // No docs needed
   ```

4. **Obvious field names:**

   ```rust
   struct User {
       pub id: UserId,     // Don't document
       pub name: String,   // Don't document
   }
   ```

---

## When TO Document

Document when:

1. **Non-obvious invariants:**

   ```rust
   /// Validated email address (RFC 5322 compliant)
   pub struct Email(String);
   ```

2. **Performance characteristics:**

   ```rust
   /// Sorted vector with O(log n) lookup
   pub struct SortedVec<T>(Vec<T>);
   ```

3. **Special behavior:**

   ```rust
   /// Cache that prefetches adjacent keys on miss
   pub struct PredictiveCache<K, V> { ... }
   ```

4. **Complex state machines:**

   ```rust
   /// Connection state. Transitions: Idle -> Active -> Closing -> Closed
   pub enum ConnectionState { ... }
   ```

---

## Related

- [function-documentation.md](function-documentation.md) - Functions and methods
- [error-documentation.md](error-documentation.md) - Error types
- [examples-and-links.md](examples-and-links.md) - Examples and links
- [SKILL.md](../SKILL.md) - Overview
