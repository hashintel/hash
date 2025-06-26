use super::Value;

/// A persistent sequence supporting efficient functional updates.
///
/// Lists store values in sequence and can be functionally modified through operations
/// like push, pop, and indexed updates. All operations return new [`List`] instances
/// without modifying the original, providing structural sharing for efficient memory usage.
///
/// # Examples
///
/// ```
/// use hashql_core::value::{List, Value};
///
/// // Create a list of user IDs
/// let user_ids = List::from_values([
///     Value::from("user_123"),
///     Value::from("user_456"),
///     Value::from("user_789"),
/// ]);
///
/// // Add a new user ID (returns new list)
/// let extended_ids = user_ids.push(Value::from("user_999"));
///
/// assert_eq!(user_ids.len(), 3); // Original unchanged
/// assert_eq!(extended_ids.len(), 4); // New list has additional element
///
/// // Access elements by index
/// if let Some(first_id) = extended_ids.get(0) {
///     println!("First user: {}", first_id);
/// }
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct List<'heap> {
    values: rpds::Vector<Value<'heap>>,
}

impl<'heap> List<'heap> {
    /// Creates a new [`List`] from an iterable collection of values.
    ///
    /// The values are stored in the order provided by the iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let values = vec![
    ///     Value::from("first"),
    ///     Value::from("second"),
    ///     Value::from("third"),
    /// ];
    ///
    /// let list = List::from_values(values);
    /// assert_eq!(list.len(), 3);
    /// assert_eq!(list.get(0), Some(&Value::from("first")));
    /// ```
    pub fn from_values(values: impl IntoIterator<Item = Value<'heap>>) -> Self {
        Self {
            values: values.into_iter().collect(),
        }
    }

    /// Returns a new [`List`] with the given value appended to the end.
    ///
    /// The original list remains unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let original = List::from_values([Value::from("a"), Value::from("b")]);
    /// let extended = original.push(Value::from("c"));
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(extended.len(), 3); // New list has additional element
    /// assert_eq!(extended.get(2), Some(&Value::from("c")));
    /// ```
    #[must_use]
    pub fn push(&self, value: Value<'heap>) -> Self {
        Self {
            values: self.values.push_back(value),
        }
    }

    /// Returns a new [`List`] with the last element removed.
    ///
    /// Returns [`None`] if the list is empty. The original list remains unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let original = List::from_values([Value::from("a"), Value::from("b")]);
    /// let popped = original.pop().unwrap();
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(popped.len(), 1); // New list has one less element
    /// assert_eq!(popped.get(0), Some(&Value::from("a")));
    ///
    /// let empty = List::from_values([]);
    /// assert_eq!(empty.pop(), None);
    /// ```
    #[must_use]
    pub fn pop(&self) -> Option<Self> {
        let values = self.values.drop_last()?;

        Some(Self { values })
    }

    /// Returns a reference to the value at the given index.
    ///
    /// Returns [`None`] if the index is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let list = List::from_values([Value::from("zero"), Value::from("one"), Value::from("two")]);
    ///
    /// assert_eq!(list.get(0), Some(&Value::from("zero")));
    /// assert_eq!(list.get(1), Some(&Value::from("one")));
    /// assert_eq!(list.get(10), None); // Out of bounds
    /// ```
    #[must_use]
    pub fn get(&self, index: usize) -> Option<&Value<'heap>> {
        self.values.get(index)
    }

    /// Returns a new [`List`] with the value at the given index replaced.
    ///
    /// Returns [`None`] if the index is out of bounds. The original list remains unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let original = List::from_values([Value::from("old_value"), Value::from("keep_this")]);
    ///
    /// let updated = original.set(0, Value::from("new_value")).unwrap();
    ///
    /// assert_eq!(original.get(0), Some(&Value::from("old_value"))); // Original unchanged
    /// assert_eq!(updated.get(0), Some(&Value::from("new_value")));
    /// assert_eq!(updated.get(1), Some(&Value::from("keep_this"))); // Other values preserved
    ///
    /// // Out of bounds returns None
    /// assert_eq!(original.set(10, Value::from("invalid")), None);
    /// ```
    #[must_use]
    pub fn set(&self, index: usize, value: Value<'heap>) -> Option<Self> {
        let values = self.values.set(index, value)?;

        Some(Self { values })
    }

    /// Returns the number of elements in the list.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let empty_list = List::from_values([]);
    /// assert_eq!(empty_list.len(), 0);
    ///
    /// let list = List::from_values([Value::from("a"), Value::from("b"), Value::from("c")]);
    /// assert_eq!(list.len(), 3);
    /// ```
    #[must_use]
    pub fn len(&self) -> usize {
        self.values.len()
    }

    /// Returns `true` if the list contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{List, Value};
    ///
    /// let empty_list = List::from_values([]);
    /// assert!(empty_list.is_empty());
    ///
    /// let list = List::from_values([Value::from("element")]);
    /// assert!(!list.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Value<'heap>> {
        self.values.iter()
    }
}

impl<'heap> FromIterator<Value<'heap>> for List<'heap> {
    fn from_iter<T: IntoIterator<Item = Value<'heap>>>(iter: T) -> Self {
        Self {
            values: iter.into_iter().collect(),
        }
    }
}
