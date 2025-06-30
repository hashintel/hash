use super::Value;

/// A persistent sequence of values.
///
/// All operations return new [`List`] instances without modifying the original.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     literal::{LiteralKind, StringLiteral},
///     value::{List, Value},
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
///
/// // Create a list of user IDs
/// let user_ids = List::from_values([
///     string("user_123"),
///     string("user_456"),
///     string("user_789"),
/// ]);
///
/// // Add a new user ID (returns new list)
/// let extended_ids = user_ids.push(string("user_999"));
///
/// assert_eq!(user_ids.len(), 3); // Original unchanged
/// assert_eq!(extended_ids.len(), 4); // New list has additional element
///
/// // Access elements by index
/// if let Some(first_id) = extended_ids.get(0) {
///     println!("First user: {:?}", first_id);
/// }
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct List<'heap> {
    values: rpds::Vector<Value<'heap>>,
}

impl<'heap> List<'heap> {
    /// Creates a new [`List`] from values.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let values = vec![
    ///     string("first"),
    ///     string("second"),
    ///     string("third"),
    /// ];
    ///
    /// let list = List::from_values(values);
    /// assert_eq!(list.len(), 3);
    /// assert_eq!(list.get(0), Some(&string("first")));
    /// ```
    pub fn from_values(values: impl IntoIterator<Item = Value<'heap>>) -> Self {
        Self {
            values: values.into_iter().collect(),
        }
    }

    /// Returns a new [`List`] with the given value appended.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let original = List::from_values([string("a"), string("b")]);
    /// let extended = original.push(string("c"));
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(extended.len(), 3); // New list has additional element
    /// assert_eq!(extended.get(2), Some(&string("c")));
    /// ```
    #[must_use]
    pub fn push(&self, value: Value<'heap>) -> Self {
        Self {
            values: self.values.push_back(value),
        }
    }

    /// Returns a new [`List`] with the last element removed.
    ///
    /// # Returns
    ///
    /// [`None`] if the list is empty.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let original = List::from_values([string("a"), string("b")]);
    /// let popped = original.pop().unwrap();
    ///
    /// assert_eq!(original.len(), 2); // Original unchanged
    /// assert_eq!(popped.len(), 1); // New list has one less element
    /// assert_eq!(popped.get(0), Some(&string("a")));
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
    /// # Returns
    ///
    /// [`None`] if the index is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let list = List::from_values([string("zero"), string("one"), string("two")]);
    ///
    /// assert_eq!(list.get(0), Some(&string("zero")));
    /// assert_eq!(list.get(1), Some(&string("one")));
    /// assert_eq!(list.get(10), None); // Out of bounds
    /// ```
    #[must_use]
    pub fn get(&self, index: usize) -> Option<&Value<'heap>> {
        self.values.get(index)
    }

    /// Returns a new [`List`] with the value at the given index replaced.
    ///
    /// # Returns
    ///
    /// [`None`] if the index is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let original = List::from_values([string("old_value"), string("keep_this")]);
    ///
    /// let updated = original.set(0, string("new_value")).unwrap();
    ///
    /// assert_eq!(original.get(0), Some(&string("old_value"))); // Original unchanged
    /// assert_eq!(updated.get(0), Some(&string("new_value")));
    /// assert_eq!(updated.get(1), Some(&string("keep_this"))); // Other values preserved
    ///
    /// // Out of bounds returns None
    /// assert_eq!(original.set(10, string("invalid")), None);
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
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let empty_list = List::from_values([]);
    /// assert_eq!(empty_list.len(), 0);
    ///
    /// let list = List::from_values([string("a"), string("b"), string("c")]);
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
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let empty_list = List::from_values([]);
    /// assert!(empty_list.is_empty());
    ///
    /// let list = List::from_values([string("element")]);
    /// assert!(!list.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Returns an iterator over the values.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{List, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    ///
    /// let list = List::from_values([string("first"), string("second"), string("third")]);
    ///
    /// // Iterate over all values
    /// let values: Vec<_> = list.iter().collect();
    /// assert_eq!(values.len(), 3);
    /// assert_eq!(values[0], &string("first"));
    ///
    /// // Use with for loop
    /// for (index, value) in list.iter().enumerate() {
    ///     println!("Element {}: {:?}", index, value);
    /// }
    /// ```
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
