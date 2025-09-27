use core::{
    alloc::Allocator,
    fmt::Debug,
    hash::{BuildHasher, Hash},
};

use hashbrown::HashMap;

/// Extension trait for [`HashMap`] providing additional convenience methods.
///
/// This trait extends the standard [`HashMap`] interface with methods that enforce
/// specific invariants or provide more ergonomic APIs for common use cases.
///
/// The methods in this trait are designed to complement the existing [`HashMap`]
/// API while providing stronger guarantees about operation outcomes.
pub trait HashMapExt<K, V, S> {
    /// Inserts a key-value pair into the map, panicking if the key already exists.
    ///
    /// This method is a convenience wrapper that enforces the invariant that the key
    /// must not already exist in the map. Unlike the standard [`HashMap::insert`]
    /// method which silently overwrites existing values, this method treats key
    /// collisions as programming errors.
    ///
    /// Returns a mutable reference to the inserted value when successful.
    ///
    /// # Use Cases
    ///
    /// This method is particularly useful when:
    /// - Building maps where duplicate keys indicate a logic error
    /// - Populating maps from supposedly unique data sources
    /// - Implementing algorithms where key uniqueness is a critical invariant
    ///
    /// # Panics
    ///
    /// Panics if the key already exists in the map.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashbrown::HashMap;
    /// use hashql_core::collection::HashMapExt;
    ///
    /// let mut map = HashMap::new();
    ///
    /// // Insert a new key-value pair
    /// let value_ref = map.insert_unique("key1", 42);
    /// assert_eq!(*value_ref, 42);
    ///
    /// // Modify the inserted value through the returned reference
    /// *value_ref = 100;
    /// assert_eq!(map.get("key1"), Some(&100));
    /// ```
    ///
    /// This example will panic:
    ///
    /// ```should_panic
    /// use hashbrown::HashMap;
    /// use hashql_core::collection::HashMapExt;
    ///
    /// let mut map = HashMap::new();
    /// map.insert("key1", 42);
    ///
    /// // This will panic because "key1" already exists
    /// map.insert_unique("key1", 100);
    /// ```
    fn insert_unique(&mut self, key: K, value: V) -> &mut V
    where
        K: Eq + Hash + Debug,
        V: Debug,
        S: BuildHasher;
}

impl<K, V, S, A> HashMapExt<K, V, S> for HashMap<K, V, S, A>
where
    A: Allocator,
{
    #[inline]
    #[track_caller]
    fn insert_unique(&mut self, key: K, value: V) -> &mut V
    where
        K: Eq + Hash + Debug,
        V: Debug,
        S: BuildHasher,
    {
        self.try_insert(key, value)
            .expect("key should not already exist in the hash map")
    }
}
