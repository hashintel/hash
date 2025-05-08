use core::{
    borrow::Borrow,
    hash::Hash,
    hint::cold_path,
    sync::atomic::{AtomicU32, Ordering},
};

use super::Interned;
use crate::{
    collection::ConcurrentHashMap,
    heap::Heap,
    id::{HasId, Id},
};

/// A trait for types that can be constructed from an ID and a partial representation.
///
/// This trait is used by `InternMap` to reconstruct complete objects from their
/// interned partial representation and unique identifier.
pub trait Decompose<'heap>: HasId {
    /// The partial representation type that will be interned.
    type Partial;

    /// Constructs the complete object from its parts.
    ///
    /// This method is used to reconstruct an object from its unique identifier
    /// and its interned partial representation.
    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self;
}

/// A unique identifier that has been provisioned but not yet interned.
///
/// A provisioned ID is a unique identifier that has been allocated but not yet
/// associated with a value. This is particularly useful for creating recursive data
/// structures, where an ID needs to be known before the full structure can be created.
///
/// The returned value from `intern` may have a different ID than the provisioned one
/// if the value being interned already exists in the map. This is acceptable for recursive
/// types, as they'll automatically use the provisioned ID to create a new type, which
/// then propagates upward to create the parent type using this new ID.
#[repr(transparent)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Provisioned<T>(T);

impl<T> Provisioned<T>
where
    T: Id,
{
    /// Returns the underlying ID value.
    pub const fn value(self) -> T {
        self.0
    }
}

impl<T> AsRef<T> for Provisioned<T>
where
    T: Id,
{
    fn as_ref(&self) -> &T {
        &self.0
    }
}

impl<T> Borrow<T> for Provisioned<T>
where
    T: Id,
{
    fn borrow(&self) -> &T {
        &self.0
    }
}

/// A thread-safe map that interns partial representations of values and associates them with unique
/// IDs.
///
/// `InternMap` maintains bidirectional mappings between:
/// 1. Partial representations and their IDs (forward mapping)
/// 2. IDs and their partial representations (reverse mapping)
///
/// This data structure is useful for:
///
/// 1. Maintaining a canonical representation of compound values
/// 2. Enabling efficient ID-based lookups of complex structures
/// 3. Supporting construction of recursive data structures
/// 4. Reducing memory usage for repeatedly used structures
///
/// # Memory Management
///
/// `InternMap` allocates memory from the provided `Heap`, which should outlive the map.
/// Interned values remain valid for the lifetime of the heap, not the map itself.
///
/// # Constraints
///
/// 1. Types that implement `Drop` cannot be interned
/// 2. Zero-sized types cannot be interned
/// 3. Interned types must implement `Eq` and `Hash`
///
/// Zero-sized types will cause a compile error:
///
/// ```compile_fail
/// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}};
/// # #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
/// # struct ValueId(u32);
/// # impl Id for ValueId {
/// #     fn from_u32(id: u32) -> Self { Self(id) }
/// # }
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct Value {
/// #     id: ValueId,
/// #     value: (),  // Zero-sized type!
/// # }
/// # impl HasId for Value {
/// #     type Id = ValueId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for Value {
/// #     type Partial = ();  // Zero-sized type!
/// #     fn from_parts(id: ValueId, partial: Interned<'heap, ()>) -> Self {
/// #         Self { id, value: *partial.as_ref() }
/// #     }
/// # }
/// let heap = Heap::new();
/// let map = InternMap::<Value>::new(&heap);
///
/// // This will fail to compile - cannot intern a zero-sized type
/// let obj = map.intern_partial(());
/// ```
///
/// Types that implement `Drop` will also cause a compile error:
///
/// ```compile_fail
/// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}};
/// # #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
/// # struct ValueId(u32);
/// # impl Id for ValueId {
/// #     fn from_u32(id: u32) -> Self { Self(id) }
/// # }
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct Value {
/// #     id: ValueId,
/// #     value: Vec<i32>,  // Type that implements Drop!
/// # }
/// # impl HasId for Value {
/// #     type Id = ValueId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for Value {
/// #     type Partial = Vec<i32>;  // Type that implements Drop!
/// #     fn from_parts(id: ValueId, partial: Interned<'heap, Vec<i32>>) -> Self {
/// #         Self { id, value: partial.as_ref().clone() }
/// #     }
/// # }
/// let heap = Heap::new();
/// let map = InternMap::<Value>::new(&heap);
///
/// // This will fail to compile - cannot intern a type that implements Drop
/// let obj = map.intern_partial(vec![1, 2, 3]);
/// ```
///
/// # Thread Safety
///
/// This implementation is built with thread-safety in mind, but is currently not thread-safe due to
/// the use of `bumpalo` in [`Heap`].
///
/// # Examples
///
/// ```
/// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}, newtype};
/// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct Value {
/// #     id: ValueId,
/// #     value: i32,
/// # }
/// # impl HasId for Value {
/// #     type Id = ValueId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for Value {
/// #     type Partial = i32;
/// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
/// #         Self { id, value: *partial.as_ref() }
/// #     }
/// # }
///
/// let heap = Heap::new();
/// let map = InternMap::<Value>::new(&heap);
///
/// // Intern a value
/// let value = map.intern_partial(42);
///
/// // Look up by ID
/// let retrieved = map.get(value.id()).unwrap();
/// assert_eq!(value, retrieved);
/// ```
#[derive(derive_more::Debug)]
#[debug(bound(T::Partial: Eq))]
pub struct InternMap<'heap, T: Decompose<'heap>> {
    heap: &'heap Heap,

    // For more information about the tradeoff and decision on the use of `ConcurrentHashMap`, see
    // the documentation on `InternSet`.
    inner: ConcurrentHashMap<&'heap T::Partial, T::Id>,

    // In theory, this isn't as efficient as it could be, but it makes the implementation simpler.
    // A more optimized approach would be to:
    // - Use a dense Vec for O(1) lookup based on ID values
    // - Implement ID recycling with a bitmap to track free IDs
    // - Maintain a tighter ID space to avoid sparse ID allocation
    //
    // This would require us to not liberally increment the counter and manage ID reuse.
    // However, we've chosen the current approach as it has less overhead and complexity.
    // We haven't benchmarked the performance difference yet - if this becomes a bottleneck,
    // we can implement the more complex approach.
    //
    // For reference, even with the current approach and 32-bit IDs:
    // - Each map entry requires ~24 bytes (12 bytes per hashmap entry × 2 maps).
    // - The entire ID space would require ~96GB just for the map structures.
    // - Memory constraints will be hit long before ID exhaustion.
    lookup: ConcurrentHashMap<T::Id, &'heap T::Partial>,

    next: AtomicU32,
}

impl<'heap, T> InternMap<'heap, T>
where
    T: Decompose<'heap>,
{
    /// Creates a new `InternMap` that allocates from the provided heap.
    ///
    /// The lifetime of interned values is tied to the lifetime of the heap, not the
    /// map itself. This means that interned values remain valid even after the
    /// map is dropped, as long as the heap is still alive.
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            inner: ConcurrentHashMap::default(),

            lookup: ConcurrentHashMap::default(),

            next: AtomicU32::new(0),
        }
    }

    /// Generates the next unique ID for this map.
    ///
    /// This method atomically increments the internal counter and returns a new ID.
    /// The IDs are guaranteed to be unique within this map instance.
    ///
    /// Relaxed ordering is used since this is the only place where the atomic counter
    /// is accessed and no ordering constraints are required.
    fn next_id(&self) -> T::Id {
        // Relaxed ordering is sufficient for this use case as this is the only place where the
        // atomic is accessed and no ordering constraints are required.
        let id = self.next.fetch_add(1, Ordering::Relaxed);

        T::Id::from_u32(id)
    }
}

impl<'heap, T> InternMap<'heap, T>
where
    T: Decompose<'heap, Partial: Eq + Hash>,
{
    /// Inserts a new ID-partial pair into the map.
    ///
    /// This method is used internally to add new entries to both the forward and reverse
    /// maps. It handles potential concurrent insertions by detecting if another thread
    /// has already inserted the same partial value.
    fn insert(&self, id: T::Id, partial: &'heap T::Partial) -> Interned<'heap, T::Partial> {
        // When this is called, we expect that the partial is unique and hasn't been inserted
        // before.
        let interned = if self.inner.insert(partial, id) == Ok(()) {
            Interned::new_unchecked(partial)
        } else {
            // Due to the fact that this is essentially single-threaded, the concurrent insertion is
            // unlikely to *ever* occur.
            cold_path();

            tracing::debug!(%id, "concurrent insertion detected, using existing partial");

            // We never remove so we know this is going to work
            let partial = self
                .inner
                .read(partial, |&key, _| key)
                .unwrap_or_else(|| unreachable!());

            Interned::new_unchecked(partial)
        };

        // Result indicated that a value of the same key already exists
        if let Err((key, _)) = self.lookup.insert(id, partial) {
            tracing::warn!(
                %key,
                "Attempted to insert a duplicate key into the intern map"
            );
        }

        interned
    }

    /// Core interning function that handles both provisioned and non-provisioned cases.
    ///
    /// This method performs the actual interning logic, looking up existing values
    /// or allocating new ones as needed. It's used internally by the public interning
    /// methods.
    ///
    /// # Arguments
    ///
    /// * `id` - Optional pre-provisioned ID to use, or `None` to generate a new ID
    /// * `partial` - The partial representation to intern
    fn intern_parts(&self, id: Option<T::Id>, partial: T::Partial) -> T {
        const {
            assert!(
                !core::mem::needs_drop::<T::Partial>(),
                "Cannot intern a type that needs drop"
            );
        };
        const {
            assert!(
                core::mem::size_of::<T::Partial>() != 0,
                "Cannot intern a zero-sized type"
            );
        };

        if let Some((id, partial)) = self.inner.read(&partial, |&partial, &id| (id, partial)) {
            T::from_parts(id, Interned::new_unchecked(partial))
        } else {
            let id = id.unwrap_or_else(|| self.next_id());

            let partial = self.heap.alloc(partial);
            let partial = self.insert(id, partial);

            T::from_parts(id, partial)
        }
    }

    /// Interns a partial representation and returns the complete object.
    ///
    /// # Returns
    ///
    /// The complete reconstructed object of type `T`
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// // Intern a simple value
    /// let obj = map.intern_partial(42);
    ///
    /// // Interning the same value again returns an equivalent object
    /// let obj2 = map.intern_partial(42);
    /// assert_eq!(obj.id(), obj2.id());
    /// ```
    pub fn intern_partial(&self, partial: T::Partial) -> T {
        self.intern_parts(None, partial)
    }

    /// Provisions a new unique ID without interning any value.
    ///
    /// This is useful when creating recursive data structures, where an ID needs to be
    /// known before the full structure can be created.
    ///
    /// # Returns
    ///
    /// A provisioned ID that can be used with `intern_provisioned`
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned, Provisioned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// // Provision an ID for later use
    /// let id = map.provision();
    ///
    /// // Use the provisioned ID
    /// let obj = map.intern_provisioned(id, 42);
    /// assert_eq!(obj.id(), id.value());
    /// ```
    pub fn provision(&self) -> Provisioned<T::Id> {
        Provisioned(self.next_id())
    }

    /// Interns a partial representation with a previously provisioned ID.
    ///
    /// This method associates the provided partial representation with a previously
    /// provisioned ID. If the partial representation is already interned, the existing
    /// ID is used instead, which may be different from the provisioned one.
    ///
    /// # Note
    ///
    /// While this may sound counterintuitive, this behavior is correct and necessary for
    /// proper deduplication. When we provision an ID, we guarantee it's unique and hasn't
    /// been used before. This uniqueness is important when constructing recursive data
    /// structures - the new ID can be embedded in the partial representation.
    ///
    /// Two cases can occur:
    ///
    /// 1. If the partial representation is unique and uses the provisioned ID internally, then the
    ///    whole structure will be new and use the provisioned ID, therefore leading to a new entry
    ///    in the map. This is the typical case for recursive structures that need to reference
    ///    themselves via the provisioned ID.
    ///
    /// 2. If an identical partial representation already exists in the map (which can only happen
    ///    if the provisioned ID was not used in the partial's construction), we return the existing
    ///    entry with its original ID rather than the provisioned one. This ensures consistent
    ///    deduplication and maintains the canonical representation principle: identical values
    ///    always map to the same interned instance.
    ///
    /// # Arguments
    ///
    /// * `id` - A previously provisioned ID
    /// * `partial` - The partial representation to intern
    ///
    /// # Returns
    ///
    /// The complete reconstructed object of type `T`
    pub fn intern_provisioned(&self, id: Provisioned<T::Id>, partial: T::Partial) -> T {
        self.intern_parts(Some(id.0), partial)
    }

    /// Provisions an ID and interns a partial representation created with that ID.
    ///
    /// This method is particularly useful for creating recursive data structures. It:
    /// 1. Provisions a new unique ID
    /// 2. Passes that ID to the provided closure
    /// 3. Interns the partial representation returned by the closure with the provisioned ID
    ///
    /// # Note
    ///
    /// The returned `T` might not have the provisioned ID, and instead may be interned, for more
    /// information as to why this is the case and why this is correct, see the note on
    /// [`Self::intern_provisioned`].
    ///
    /// # Returns
    ///
    /// The complete reconstructed object of type `T`
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned, Provisioned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: usize,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = usize;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, usize>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// // Create a value using the provisioned ID
    /// let obj = map.intern(|id| {
    ///     let id_value = id.value();
    ///     // Use the ID to create a partial representation
    ///     id_value.as_usize() * 2
    /// });
    /// ```
    pub fn intern(&self, closure: impl FnOnce(Provisioned<T::Id>) -> T::Partial) -> T {
        let id = self.provision();
        let partial = closure(id);

        self.intern_provisioned(id, partial)
    }

    /// Retrieves a value by its ID.
    ///
    /// This method performs a lookup in the reverse mapping to find the partial representation
    /// associated with the given ID, and then reconstructs the complete object.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// let obj = map.intern_partial(42);
    /// let id = obj.id();
    ///
    /// // Look up by ID
    /// let retrieved = map.get(id);
    /// assert!(retrieved.is_some());
    /// assert_eq!(retrieved.unwrap(), obj);
    ///
    /// // Look up a non-existent ID
    /// let non_existent = map.get(ValueId::from_u32(999));
    /// assert!(non_existent.is_none());
    /// ```
    pub fn get(&self, id: T::Id) -> Option<T> {
        let partial = self.lookup.read(&id, |_, &partial| partial)?;

        Some(T::from_parts(id, Interned::new_unchecked(partial)))
    }

    /// Checks if an ID exists in the map.
    ///
    /// This method determines whether an ID has been interned in this map without
    /// reconstructing the complete object.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// let obj = map.intern_partial(42);
    /// let id = obj.id();
    ///
    /// // Check if the ID exists
    /// assert!(map.contains(id));
    ///
    /// // Check a non-existent ID
    /// assert!(!map.contains(ValueId::from_u32(999)));
    /// ```
    pub fn contains(&self, id: T::Id) -> bool {
        self.lookup.contains(&id)
    }

    /// Returns the interned value for the given ID.
    ///
    /// This method is similar to `get`, but panics if no value with the given ID exists.
    /// It's a more convenient alternative when you know the ID exists.
    ///
    /// # Panics
    ///
    /// Panics if no item with the given ID exists in the map
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::{InternMap, Decompose, Interned}, id::{HasId, Id}, newtype};
    /// # newtype!(struct ValueId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct Value {
    /// #     id: ValueId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for Value {
    /// #     type Id = ValueId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for Value {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: ValueId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<Value>::new(&heap);
    /// let obj = map.intern_partial(42);
    /// let id = obj.id();
    ///
    /// // Look up by ID (we know it exists)
    /// let retrieved = map.index(id);
    /// assert_eq!(retrieved, obj);
    ///
    /// // This would panic:
    /// // let non_existent = map.index(ValueId::from_u32(999));
    /// ```
    pub fn index(&self, id: T::Id) -> T {
        let partial = self
            .lookup
            .read(&id, |_, &partial| partial)
            .expect("id should exist in map");

        T::from_parts(id, Interned::new_unchecked(partial))
    }
}

#[cfg(test)]
mod tests {
    use core::hash::{Hash, Hasher};

    use crate::{
        heap::Heap,
        id::HasId,
        intern::{Decompose, InternMap, Interned},
        newtype,
    };

    newtype!(struct TaggedId(u32 is 0..=0xFFFF_FF00));

    #[derive(Debug, PartialEq, Eq, Hash)]
    struct TaggedValue {
        id: TaggedId,
        value: i32,
    }

    impl HasId for TaggedValue {
        type Id = TaggedId;

        fn id(&self) -> Self::Id {
            self.id
        }
    }

    impl<'heap> Decompose<'heap> for TaggedValue {
        type Partial = i32;

        fn from_parts(id: TaggedId, partial: Interned<'heap, i32>) -> Self {
            Self {
                id,
                value: *partial.as_ref(),
            }
        }
    }

    newtype!(struct ListId(u32 is 0..=0xFFFF_FF00));

    // A recursive test type that can reference other TestNode instances by ID
    #[derive(Debug, PartialEq, Eq, Hash)]
    struct LinkedList {
        id: ListId,
        value: i32,
        next_id: Option<ListId>,
    }

    #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
    struct PartialLinkedList {
        value: i32,
        next_id: Option<ListId>,
    }

    impl HasId for LinkedList {
        type Id = ListId;

        fn id(&self) -> Self::Id {
            self.id
        }
    }

    impl<'heap> Decompose<'heap> for LinkedList {
        type Partial = PartialLinkedList;

        fn from_parts(id: ListId, partial: Interned<'heap, PartialLinkedList>) -> Self {
            Self {
                id,
                value: partial.value,
                next_id: partial.next_id,
            }
        }
    }

    #[test]
    fn basic_interning() {
        let heap = Heap::new();
        let map = InternMap::<TaggedValue>::new(&heap);

        // Intern the same value twice
        let value1 = map.intern_partial(42);
        let value2 = map.intern_partial(42);

        // They should have the same ID
        assert_eq!(value1.id(), value2.id());

        // Intern a different value
        let value3 = map.intern_partial(43);

        // It should have a different ID
        assert_ne!(value1.id(), value3.id());

        // Verify the contents
        assert_eq!(value1.value, 42);
        assert_eq!(value2.value, 42);
        assert_eq!(value3.value, 43);
    }

    #[test]
    fn lookup_by_id() {
        let heap = Heap::new();
        let map = InternMap::<TaggedValue>::new(&heap);

        // Intern a value
        let value = map.intern_partial(42);
        let id = value.id();

        // Look it up by ID
        let retrieved = map.get(id).expect("should have a value");
        assert_eq!(retrieved, value);

        // Look up a non-existent ID
        let non_existent = map.get(TaggedId(999));
        assert!(non_existent.is_none());

        // Test the index method
        let indexed = map.index(id);
        assert_eq!(indexed, value);

        // Indexing a non-existent ID would panic, so we don't test it directly
    }

    #[test]
    fn provisioning() {
        let heap = Heap::new();
        let map = InternMap::<TaggedValue>::new(&heap);

        // Provision an ID
        let id = map.provision();

        // Use it to intern a value
        let value = map.intern_provisioned(id, 42);

        // The value should have the provisioned ID
        assert_eq!(value.id(), id.value());

        // If we intern the same value again with a new provisioned ID,
        // it should reuse the existing interned value and its ID
        let id2 = map.provision();
        let value2 = map.intern_provisioned(id2, 42);

        // This should return the original value, not create a new one with the new ID
        assert_eq!(value2.id(), value.id());
        assert_ne!(value2.id(), id2.value());
    }

    #[test]
    fn recursive_structures() {
        let heap = Heap::new();
        let map = InternMap::<LinkedList>::new(&heap);

        // Create a linked list using provisioned IDs
        let node3_id = map.provision();
        let node3 = map.intern_provisioned(
            node3_id,
            PartialLinkedList {
                value: 3,
                next_id: None,
            },
        );

        let node2_id = map.provision();
        let node2 = map.intern_provisioned(
            node2_id,
            PartialLinkedList {
                value: 2,
                next_id: Some(node3.id()),
            },
        );

        let node1_id = map.provision();
        let node1 = map.intern_provisioned(
            node1_id,
            PartialLinkedList {
                value: 1,
                next_id: Some(node2.id()),
            },
        );

        // Verify the links
        assert_eq!(node1.next_id, Some(node2.id()));
        assert_eq!(node2.next_id, Some(node3.id()));
        assert_eq!(node3.next_id, None);

        // Create a similar list but using the closure-based intern method
        let list = map.intern(|head_id| {
            // First create the tail node
            let tail = map.intern_partial(PartialLinkedList {
                value: 6,
                next_id: Some(head_id.value()),
            });

            // Then create the middle node pointing to the tail
            let middle = map.intern_partial(PartialLinkedList {
                value: 5,
                next_id: Some(tail.id()),
            });

            // Return the head partial that points to the middle
            PartialLinkedList {
                value: 4,
                next_id: Some(middle.id()),
            }
        });

        // Verify this list is correct too
        assert_eq!(list.value, 4);
        let middle_node = map.index(list.next_id.expect("should have a next_id"));
        assert_eq!(middle_node.value, 5);
        let tail_node = map.index(middle_node.next_id.expect("should have a next_id"));
        assert_eq!(tail_node.value, 6);
        let head_node = map.index(tail_node.next_id.expect("should have a next_id"));
        assert_eq!(head_node.value, 4);
    }

    #[test]
    fn hash_collisions() {
        // Create a type with controlled hash collisions
        #[derive(Debug, Copy, Clone, PartialEq, Eq)]
        struct CollisionValue {
            id: u32,
            collision_group: u32,
        }

        impl Hash for CollisionValue {
            fn hash<H: Hasher>(&self, state: &mut H) {
                // Only hash the collision_group, causing collisions
                self.collision_group.hash(state);
            }
        }

        #[derive(Debug, PartialEq, Eq, Hash)]
        struct CollisionType {
            id: TaggedId,
            value: CollisionValue,
        }

        impl HasId for CollisionType {
            type Id = TaggedId;

            fn id(&self) -> Self::Id {
                self.id
            }
        }

        impl<'heap> Decompose<'heap> for CollisionType {
            type Partial = CollisionValue;

            fn from_parts(id: TaggedId, partial: Interned<'heap, CollisionValue>) -> Self {
                Self {
                    id,
                    value: *partial.as_ref(),
                }
            }
        }

        let heap = Heap::new();
        let map = InternMap::<CollisionType>::new(&heap);

        // Create values with the same hash but different equality
        let value1 = map.intern_partial(CollisionValue {
            id: 1,
            collision_group: 42,
        });

        let value2 = map.intern_partial(CollisionValue {
            id: 2,
            collision_group: 42,
        });

        // They should have different IDs despite hash collision
        assert_ne!(value1.id(), value2.id());

        // Interning the same value again should return the same ID
        let value1_again = map.intern_partial(CollisionValue {
            id: 1,
            collision_group: 42,
        });

        assert_eq!(value1.id(), value1_again.id());
    }

    #[test]
    fn lifetime_persistence() {
        let heap = Heap::new();
        let map = InternMap::<TaggedValue>::new(&heap);

        let value1_id;
        let value1_ref;

        {
            // Create a value in a nested scope
            let value1 = map.intern_partial(42);
            value1_id = value1.id();
            value1_ref = value1;
        }

        // Create the same value again after the first has gone out of scope
        let value2 = map.intern_partial(42);

        // The IDs should be the same even though value1 is dropped
        assert_eq!(value1_id, value2.id());
        assert_eq!(value1_ref, value2);
    }

    #[test]
    fn deduplication_with_provisioned_ids() {
        let heap = Heap::new();
        let map = InternMap::<TaggedValue>::new(&heap);

        // First create a value normally
        let value1 = map.intern_partial(42);

        // Now provision an ID and try to intern the same value
        let id = map.provision();
        let value2 = map.intern_provisioned(id, 42);

        // Since the value already exists, it should reuse the first value's ID
        assert_eq!(value1.id(), value2.id());
        assert_ne!(id.value(), value2.id()); // The provisioned ID wasn't used

        // Now create a new value with the provisioned ID
        let value3 = map.intern_provisioned(id, 43);

        // This should use the provisioned ID since it's a new value
        assert_eq!(value3.id(), id.value());
    }
}
