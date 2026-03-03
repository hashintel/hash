use rpds::RedBlackTreeMap;

use super::Value;

/// A persistent key-value mapping.
///
/// All operations return new [`Dict`] instances without modifying the original.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     value::{Integer, Primitive, String},
///     value::{Dict, Value},
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
/// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
///
/// // Create a dict from key-value pairs
/// let person = Dict::from_entries([
///     (string("name"), string("Alice")),
///     (string("age"), integer("30"))
/// ]);
///
/// // Access values
/// if let Some(name) = person.get(&string("name")) {
///     println!("Name: {:?}", name);
/// }
///
/// // Insert returns a new dict
/// let updated_person = person.insert(string("email"), string("alice@example.com"));
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
    /// Creates a new [`Dict`] from key-value pairs.
    ///
    /// If duplicate keys are provided, the last value for each key is retained.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let entries = [
    ///     (string("b"), integer("2")),
    ///     (string("a"), integer("1")),
    ///     (string("c"), integer("3")),
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

    /// Returns the value for the given key.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let key = string("username");
    /// let value = string("alice");
    /// let dict = Dict::from_entries([(key.clone(), value.clone())]);
    ///
    /// assert_eq!(dict.get(&key), Some(&value));
    /// assert_eq!(dict.get(&string("nonexistent")), None);
    /// ```
    #[must_use]
    pub fn get(&self, key: &Value<'heap>) -> Option<&Value<'heap>> {
        self.values.get(key)
    }

    /// Returns both the stored key and value for the given key.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let dict = Dict::from_entries([
    ///     (string("config"), string("enabled"))
    /// ]);
    ///
    /// if let Some((stored_key, stored_value)) = dict.get_key_value(&string("config")) {
    ///     assert_eq!(stored_key, &string("config"));
    ///     assert_eq!(stored_value, &string("enabled"));
    /// }
    /// ```
    #[must_use]
    pub fn get_key_value(&self, key: &Value<'heap>) -> Option<(&Value<'heap>, &Value<'heap>)> {
        self.values.get_key_value(key)
    }

    /// Returns a new [`Dict`] with the given key-value pair inserted.
    ///
    /// If the key already exists, its value is replaced.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let original = Dict::from_entries([
    ///     (string("a"), integer("1"))
    /// ]);
    ///
    /// let updated = original.insert(string("b"), integer("2"));
    ///
    /// assert_eq!(original.len(), 1); // Original unchanged
    /// assert_eq!(updated.len(), 2); // New dict has both entries
    /// assert!(updated.contains_key(&string("b")));
    /// ```
    #[must_use]
    pub fn insert(&self, key: Value<'heap>, value: Value<'heap>) -> Self {
        Self {
            values: self.values.insert(key, value),
        }
    }

    /// Returns a new [`Dict`] with the given key removed.
    ///
    /// If the key doesn't exist, returns an equivalent dict.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let original = Dict::from_entries([
    ///     (string("a"), integer("1")),
    ///     (string("b"), integer("2")),
    /// ]);
    ///
    /// let updated = original.remove(&string("a"));
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(updated.len(), 1); // New dict has one less entry
    /// assert!(!updated.contains_key(&string("a")));
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
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let dict = Dict::from_entries([(string("key1"), string("value1"))]);
    ///
    /// assert!(dict.contains_key(&string("key1")));
    /// assert!(!dict.contains_key(&string("key2")));
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
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let empty_dict = Dict::from_entries([]);
    /// assert_eq!(empty_dict.len(), 0);
    ///
    /// let dict = Dict::from_entries([
    ///     (string("a"), integer("1")),
    ///     (string("b"), integer("2")),
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
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let empty_dict = Dict::from_entries([]);
    /// assert!(empty_dict.is_empty());
    ///
    /// let dict = Dict::from_entries([
    ///     (string("key"), string("value")),
    /// ]);
    /// assert!(!dict.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Returns an iterator over the key-value pairs.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String},
    ///     value::{Dict, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let dict = Dict::from_entries([
    ///     (string("name"), string("Alice")),
    ///     (string("age"), integer("30")),
    ///     (string("city"), string("Boston")),
    /// ]);
    ///
    /// // Iterate over all key-value pairs
    /// let pairs: Vec<_> = dict.iter().collect();
    /// assert_eq!(pairs.len(), 3);
    ///
    /// // Check that we can find specific entries
    /// assert!(pairs.iter().any(|(k, v)| **k == string("name") && **v == string("Alice")));
    ///
    /// // Use with for loop
    /// for (key, value) in dict.iter() {
    ///     println!("{:?}: {:?}", key, value);
    /// }
    /// ```
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
