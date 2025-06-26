use rpds::RedBlackTreeMap;

use super::Value;

/// A persistent key-value mapping.
///
/// Dicts store unique key-value associations maintained in sorted key order.
/// All operations return new [`Dict`] instances without modifying the original utilizing structural
/// sharing for efficient memory usage.
///
/// # Examples
///
/// ```
/// use hashql_core::value::{Dict, Value};
///
/// // Create a dict from key-value pairs
/// let name_key = Value::from("name");
/// let age_key = Value::from("age");
/// let name_value = Value::from("Alice");
/// let age_value = Value::from(30);
///
/// let person = Dict::from_entries([(name_key.clone(), name_value), (age_key.clone(), age_value)]);
///
/// // Access values
/// if let Some(name) = person.get(&name_key) {
///     println!("Name: {}", name);
/// }
///
/// // Insert returns a new dict
/// let email_key = Value::from("email");
/// let email_value = Value::from("alice@example.com");
/// let updated_person = person.insert(email_key, email_value);
///
/// assert_eq!(person.len(), 2); // Original unchanged
/// assert_eq!(updated_person.len(), 3); // New dict has additional entry
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Dict<'heap> {
    // We use a `RedBlackTreeMap` here, because otherwise the type would be unhashable, another
    // possibility would be to use an immutable chunkmap.
    values: RedBlackTreeMap<Value<'heap>, Value<'heap>>,
}

impl<'heap> Dict<'heap> {
    /// Creates a new [`Dict`] from an iterable collection of key-value pairs.
    ///
    /// If duplicate keys are provided, the last value for each key is retained.
    /// The resulting dict contains all provided entries.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let entries = [
    ///     (Value::from("b"), Value::from(2)),
    ///     (Value::from("a"), Value::from(1)),
    ///     (Value::from("c"), Value::from(3)),
    /// ];
    ///
    /// let dict = Dict::from_entries(entries);
    /// assert_eq!(dict.len(), 3);
    /// // Dict contains all entries
    /// ```
    pub fn from_entries(entries: impl IntoIterator<Item = (Value<'heap>, Value<'heap>)>) -> Self {
        Self {
            values: entries.into_iter().collect(),
        }
    }

    /// Returns a reference to the value associated with the given key.
    ///
    /// Returns [`None`] if the key is not present in the dict.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let key = Value::from("username");
    /// let value = Value::from("alice");
    /// let dict = Dict::from_entries([(key.clone(), value.clone())]);
    ///
    /// assert_eq!(dict.get(&key), Some(&value));
    /// assert_eq!(dict.get(&Value::from("nonexistent")), None);
    /// ```
    #[must_use]
    pub fn get(&self, key: &Value<'heap>) -> Option<&Value<'heap>> {
        self.values.get(key)
    }

    /// Returns references to both the key and value for the given key.
    ///
    /// This is useful when you need access to the stored key instance,
    /// which may be different from the lookup key due to structural sharing.
    /// Returns [`None`] if the key is not present in the dict.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let key = Value::from("config");
    /// let value = Value::from("enabled");
    /// let dict = Dict::from_entries([(key.clone(), value.clone())]);
    ///
    /// if let Some((stored_key, stored_value)) = dict.get_key_value(&key) {
    ///     assert_eq!(stored_key, &key);
    ///     assert_eq!(stored_value, &value);
    /// }
    /// ```
    #[must_use]
    pub fn get_key_value(&self, key: &Value<'heap>) -> Option<(&Value<'heap>, &Value<'heap>)> {
        self.values.get_key_value(key)
    }

    /// Returns a new [`Dict`] with the given key-value pair inserted.
    ///
    /// If the key already exists, its value is replaced in the new dict.
    /// The original dict remains unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let original = Dict::from_entries([(Value::from("a"), Value::from(1))]);
    ///
    /// let updated = original.insert(Value::from("b"), Value::from(2));
    ///
    /// assert_eq!(original.len(), 1); // Original unchanged
    /// assert_eq!(updated.len(), 2); // New dict has both entries
    /// assert!(updated.contains_key(&Value::from("b")));
    /// ```
    #[must_use]
    pub fn insert(&self, key: Value<'heap>, value: Value<'heap>) -> Self {
        Self {
            values: self.values.insert(key, value),
        }
    }

    /// Returns a new [`Dict`] with the given key removed.
    ///
    /// If the key doesn't exist, returns a dict equivalent to the original.
    /// The original dict remains unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let original = Dict::from_entries([
    ///     (Value::from("a"), Value::from(1)),
    ///     (Value::from("b"), Value::from(2)),
    /// ]);
    ///
    /// let updated = original.remove(&Value::from("a"));
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(updated.len(), 1); // New dict has one less entry
    /// assert!(!updated.contains_key(&Value::from("a")));
    /// ```
    #[must_use]
    pub fn remove(&self, key: &Value<'heap>) -> Self {
        let values = self.values.remove(key);

        Self { values }
    }

    /// Returns `true` if the dict contains the given key.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let dict = Dict::from_entries([(Value::from("key1"), Value::from("value1"))]);
    ///
    /// assert!(dict.contains_key(&Value::from("key1")));
    /// assert!(!dict.contains_key(&Value::from("key2")));
    /// ```
    #[must_use]
    pub fn contains_key(&self, key: &Value<'heap>) -> bool {
        self.values.contains_key(key)
    }

    /// Returns the number of key-value pairs in the dict.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let empty_dict = Dict::from_entries([]);
    /// assert_eq!(empty_dict.len(), 0);
    ///
    /// let dict = Dict::from_entries([
    ///     (Value::from("a"), Value::from(1)),
    ///     (Value::from("b"), Value::from(2)),
    /// ]);
    /// assert_eq!(dict.len(), 2);
    /// ```
    #[must_use]
    pub fn len(&self) -> usize {
        self.values.size()
    }

    /// Returns `true` if the dict contains no key-value pairs.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Dict, Value};
    ///
    /// let empty_dict = Dict::from_entries([]);
    /// assert!(empty_dict.is_empty());
    ///
    /// let dict = Dict::from_entries([(Value::from("key"), Value::from("value"))]);
    /// assert!(!dict.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&Value<'heap>, &Value<'heap>)> {
        self.values.iter()
    }
}

impl<'heap> FromIterator<(Value<'heap>, Value<'heap>)> for Dict<'heap> {
    fn from_iter<T: IntoIterator<Item = (Value<'heap>, Value<'heap>)>>(iter: T) -> Self {
        Self {
            values: iter.into_iter().collect(),
        }
    }
}
