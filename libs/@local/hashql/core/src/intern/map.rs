use core::{
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
/// # struct MyId(u32);
/// # impl Id for MyId {
/// #     fn from_u32(id: u32) -> Self { Self(id) }
/// # }
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct MyType {
/// #     id: MyId,
/// #     value: (),  // Zero-sized type!
/// # }
/// # impl HasId for MyType {
/// #     type Id = MyId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for MyType {
/// #     type Partial = ();  // Zero-sized type!
/// #     fn from_parts(id: MyId, partial: Interned<'heap, ()>) -> Self {
/// #         Self { id, value: *partial.as_ref() }
/// #     }
/// # }
/// let heap = Heap::new();
/// let map = InternMap::<MyType>::new(&heap);
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
/// # struct MyId(u32);
/// # impl Id for MyId {
/// #     fn from_u32(id: u32) -> Self { Self(id) }
/// # }
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct MyType {
/// #     id: MyId,
/// #     value: Vec<i32>,  // Type that implements Drop!
/// # }
/// # impl HasId for MyType {
/// #     type Id = MyId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for MyType {
/// #     type Partial = Vec<i32>;  // Type that implements Drop!
/// #     fn from_parts(id: MyId, partial: Interned<'heap, Vec<i32>>) -> Self {
/// #         Self { id, value: partial.as_ref().clone() }
/// #     }
/// # }
/// let heap = Heap::new();
/// let map = InternMap::<MyType>::new(&heap);
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
/// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
/// # #[derive(Debug, PartialEq, Eq, Hash)]
/// # struct MyType {
/// #     id: MyId,
/// #     value: i32,
/// # }
/// # impl HasId for MyType {
/// #     type Id = MyId;
/// #     fn id(&self) -> Self::Id { self.id }
/// # }
/// # impl<'heap> Decompose<'heap> for MyType {
/// #     type Partial = i32;
/// #     fn from_parts(id: MyId, partial: Interned<'heap, i32>) -> Self {
/// #         Self { id, value: *partial.as_ref() }
/// #     }
/// # }
///
/// let heap = Heap::new();
/// let map = InternMap::<MyType>::new(&heap);
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
    // - Each map entry requires ~24 bytes (12 bytes per hashmap entry × 2 maps)
    // - The entire ID space would require ~96GB just for the map structures
    // - Memory constraints will be hit long before ID exhaustion
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
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct MyType {
    /// #     id: MyId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for MyType {
    /// #     type Id = MyId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for MyType {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: MyId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<MyType>::new(&heap);
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
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct MyType {
    /// #     id: MyId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for MyType {
    /// #     type Id = MyId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for MyType {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: MyId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<MyType>::new(&heap);
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
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct MyType {
    /// #     id: MyId,
    /// #     value: usize,
    /// # }
    /// # impl HasId for MyType {
    /// #     type Id = MyId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for MyType {
    /// #     type Partial = usize;
    /// #     fn from_parts(id: MyId, partial: Interned<'heap, usize>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<MyType>::new(&heap);
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
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct MyType {
    /// #     id: MyId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for MyType {
    /// #     type Id = MyId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for MyType {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: MyId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<MyType>::new(&heap);
    /// let obj = map.intern_partial(42);
    /// let id = obj.id();
    ///
    /// // Look up by ID
    /// let retrieved = map.get(id);
    /// assert!(retrieved.is_some());
    /// assert_eq!(retrieved.unwrap(), obj);
    ///
    /// // Look up a non-existent ID
    /// let non_existent = map.get(MyId::from_u32(999));
    /// assert!(non_existent.is_none());
    /// ```
    pub fn get(&self, id: T::Id) -> Option<T> {
        let partial = self.lookup.read(&id, |_, &partial| partial)?;

        Some(T::from_parts(id, Interned::new_unchecked(partial)))
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
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # #[derive(Debug, PartialEq, Eq, Hash)]
    /// # struct MyType {
    /// #     id: MyId,
    /// #     value: i32,
    /// # }
    /// # impl HasId for MyType {
    /// #     type Id = MyId;
    /// #     fn id(&self) -> Self::Id { self.id }
    /// # }
    /// # impl<'heap> Decompose<'heap> for MyType {
    /// #     type Partial = i32;
    /// #     fn from_parts(id: MyId, partial: Interned<'heap, i32>) -> Self {
    /// #         Self { id, value: *partial.as_ref() }
    /// #     }
    /// # }
    /// # let heap = Heap::new();
    /// # let map = InternMap::<MyType>::new(&heap);
    /// let obj = map.intern_partial(42);
    /// let id = obj.id();
    ///
    /// // Look up by ID (we know it exists)
    /// let retrieved = map.index(id);
    /// assert_eq!(retrieved, obj);
    ///
    /// // This would panic:
    /// // let non_existent = map.index(MyId::from_u32(999));
    /// ```
    pub fn index(&self, id: T::Id) -> T {
        let partial = self
            .lookup
            .read(&id, |_, &partial| partial)
            .expect("id should exist in map");

        T::from_parts(id, Interned::new_unchecked(partial))
    }
}
