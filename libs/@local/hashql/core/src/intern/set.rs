#![expect(clippy::type_repetition_in_bounds)]
use core::hash::{BuildHasher as _, Hash};

use hashbrown::hash_map::RawEntryMut;

use super::Interned;
use crate::{
    collections::{FastHashMap, fast_hash_map, fast_hash_map_with_capacity},
    heap::{Heap, TransferInto as _},
    sync::lock::LocalLock,
};

/// A thread-local interner for values of type `T`.
///
/// An interner is a data structure that stores only one copy of each distinct value, and returns
/// references to that copy. This is useful for:
///
/// 1. Reducing memory usage when many identical values are used
/// 2. Enabling fast equality comparisons (pointer equality instead of value equality)
/// 3. Maintaining a canonical representation of values
///
/// # Memory Management
///
/// `InternSet` allocates memory from the provided [`Heap`], which should outlive the interner.
/// Interned values remain valid for the lifetime of the heap, not the interner itself.
///
/// # Constraints
///
/// 1. Types that implement [`Drop`] cannot be interned
/// 2. Zero-sized types cannot be interned
/// 3. Interned types must implement [`Eq`] and [`Hash`]
///
/// # Thread Safety
///
/// This implementation uses [`LocalLock`] and is **not thread-safe**. The architecture supports
/// upgrading to [`SharedLock`] for thread-safety, but the underlying [`Heap`] allocator would
/// also need to become thread-safe first.
///
/// [`LocalLock`]: crate::sync::lock::LocalLock
/// [`SharedLock`]: crate::sync::lock::SharedLock
///
/// # Examples
///
/// Basic interning:
///
/// ```
/// # use hashql_core::{heap::Heap, intern::InternSet};
/// let heap = Heap::new();
/// let interner = InternSet::new(&heap);
///
/// // Intern two identical values
/// let interned1 = interner.intern(42);
/// let interned2 = interner.intern(42);
///
/// // They reference the same memory location
/// assert!(core::ptr::eq(interned1.as_ref(), interned2.as_ref()));
/// ```
///
/// Practical use case - interning AST node types:
///
/// ```
/// # use hashql_core::{heap::Heap, intern::InternSet};
/// #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
/// enum BinaryOp {
///     Add,
///     Sub,
///     Mul,
///     Div,
/// }
///
/// #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
/// struct TypeInfo {
///     name: &'static str,
///     size: usize,
/// }
///
/// let heap = Heap::new();
/// let ops = InternSet::new(&heap);
/// let types = InternSet::new(&heap);
///
/// // Intern operator types across your AST
/// let add_op1 = ops.intern(BinaryOp::Add);
/// let add_op2 = ops.intern(BinaryOp::Add);
/// assert!(core::ptr::eq(add_op1.as_ref(), add_op2.as_ref()));
///
/// // Intern type information
/// let int_type = types.intern(TypeInfo {
///     name: "i32",
///     size: 4,
/// });
/// let int_type2 = types.intern(TypeInfo {
///     name: "i32",
///     size: 4,
/// });
/// assert!(core::ptr::eq(int_type.as_ref(), int_type2.as_ref()));
/// ```
#[derive(derive_more::Debug)]
#[debug(bound(T: Eq))]
pub struct InternSet<'heap, T: ?Sized> {
    inner: LocalLock<FastHashMap<&'heap T, ()>>,
    heap: &'heap Heap,
}

impl<'heap, T: ?Sized> InternSet<'heap, T> {
    /// Creates a new `InternSet` that allocates from the provided heap.
    ///
    /// The lifetime of interned values is tied to the lifetime of the heap, not the
    /// interner itself. This means that interned values remain valid even after the
    /// interner is dropped, as long as the heap is still alive.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner = InternSet::<i32>::new(&heap);
    /// ```
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            inner: LocalLock::new(fast_hash_map()),
            heap,
        }
    }

    /// Creates a new `InternSet` with the specified initial capacity.
    ///
    /// Pre-allocates memory to avoid rehashing when the approximate number of unique values
    /// is known in advance. This can improve performance when interning large numbers of values,
    /// particularly during AST construction or bulk data processing.
    ///
    /// The capacity represents the number of unique values the set can hold before needing
    /// to reallocate. Note that this is the capacity of the internal hash set, not the heap.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    ///
    /// // Pre-allocate space for approximately 1000 unique values
    /// let interner = InternSet::with_capacity(1000, &heap);
    ///
    /// // Now intern many values without triggering rehashes
    /// for i in 0..1000 {
    ///     interner.intern(i);
    /// }
    /// ```
    ///
    /// Use case for AST construction:
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
    /// struct TypeId(u32);
    ///
    /// let heap = Heap::new();
    ///
    /// // If your language has ~50 built-in types, pre-allocate for them
    /// let type_interner = InternSet::with_capacity(50, &heap);
    ///
    /// for id in 0..50 {
    ///     type_interner.intern(TypeId(id));
    /// }
    /// ```
    pub fn with_capacity(capacity: usize, heap: &'heap Heap) -> Self {
        Self {
            inner: LocalLock::new(fast_hash_map_with_capacity(capacity)),
            heap,
        }
    }
}

impl<T: ?Sized + Eq + Hash> InternSet<'_, T> {
    /// Assertion that ensures T doesn't require drop.
    ///
    /// This is necessary because we allocate memory for T on the heap and don't run
    /// destructors when the heap is dropped.
    const ASSERT_T_IS_NOT_DROP: () = assert!(
        !core::mem::needs_drop::<T>(),
        "Cannot intern a type that needs drop"
    );
}

impl<'heap, T> InternSet<'heap, T>
where
    T: Eq + Hash,
{
    /// Assertion that ensures T is not a zero-sized type.
    ///
    /// Interning zero-sized types (ZSTs) is disallowed as it indicates a bug in the code.
    const ASSERT_T_IS_NOT_ZERO_SIZED: () = assert!(
        core::mem::size_of::<T>() != 0,
        "Cannot intern a zero-sized type"
    );

    /// Reserves capacity for at least `capacity` elements to be inserted into the set.
    ///
    /// This method is useful for preallocating memory to avoid frequent reallocations.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner: InternSet<u32> = InternSet::new(&heap);
    ///
    /// interner.reserve(100);
    /// ```
    pub fn reserve(&self, capacity: usize) {
        self.inner.lock().reserve(capacity);
    }

    /// Interns a value into the set.
    ///
    /// This method ensures that only one copy of a value exists in memory. When a value
    /// is interned, it is first checked against the existing set of interned values.
    /// If an equal value exists, a reference to that existing value is returned.
    /// Otherwise, the new value is allocated on the heap and added to the set.
    ///
    /// # Type Constraints
    ///
    /// - `T` must be `Eq + Hash`
    /// - `T` must not be a zero-sized type
    /// - `T` must not implement `Drop`
    ///
    /// # Examples
    ///
    /// Basic usage with primitive types:
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// let value = 42;
    /// let interned = interner.intern(value);
    ///
    /// assert_eq!(interned.as_ref(), &value);
    /// ```
    ///
    /// Usage with custom types:
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
    /// struct Point {
    ///     x: i32,
    ///     y: i32,
    /// }
    ///
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// let p1 = Point { x: 1, y: 2 };
    /// let p2 = Point { x: 1, y: 2 }; // Same value but different instance
    ///
    /// let interned1 = interner.intern(p1);
    /// let interned2 = interner.intern(p2);
    ///
    /// // The interned values are the same object
    /// assert!(core::ptr::eq(interned1.as_ref(), interned2.as_ref()));
    /// ```
    ///
    /// Zero-sized-types will lead to a compile error:
    ///
    /// ```compile_fail
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    ///
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// // This won't work, because it's a zero-sized type.
    /// // The interner supports in theory ZST, but interning of ZST indicates a bug in the code.
    /// let value = ();
    /// let interned = interner.intern(value);
    ///
    /// assert_eq!(interned.as_ref(), &value);
    /// ```
    ///
    /// Types that implement `Drop` will lead to a compile error:
    ///
    /// ```compile_fail
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    ///
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// // The interner does not support any type that implements `Drop`,
    /// // this is because it allocates memory on the heap, which won't run a destructor when dropped.
    /// let value = vec![1, 2, 3];
    /// let interned = interner.intern(value);
    ///
    /// assert_eq!(interned.as_ref(), &value);
    /// ```
    pub fn intern(&self, value: T) -> Interned<'heap, T> {
        const { Self::ASSERT_T_IS_NOT_DROP };
        const { Self::ASSERT_T_IS_NOT_ZERO_SIZED };

        let heap = self.heap;

        let value = self.inner.map(|inner| {
            let hash_value = inner.hasher().hash_one(&value);

            match inner
                .raw_entry_mut()
                .from_key_hashed_nocheck(hash_value, &value)
            {
                RawEntryMut::Vacant(entry) => {
                    let value = heap.alloc(value);

                    let (key, ()) = entry.insert_hashed_nocheck(hash_value, &*value, ());
                    *key
                }
                RawEntryMut::Occupied(entry) => *entry.key(),
            }
        });

        Interned::new_unchecked(value)
    }
}

impl<'heap, T> InternSet<'heap, [T]>
where
    T: Copy + Eq + Hash,
{
    /// Assertion that ensures T is not a zero-sized type.
    ///
    /// Interning zero-sized types (ZSTs) is disallowed as it indicates a bug in the code.
    const ASSERT_T_IS_NOT_ZERO_SIZED: () = assert!(
        core::mem::size_of::<T>() != 0,
        "Cannot intern a zero-sized type"
    );

    /// Interns a slice of values into the set.
    ///
    /// This method is similar to `intern` but works with slices. It ensures that only one
    /// copy of a slice with identical content exists in memory.
    ///
    /// # Type Constraints
    ///
    /// - `T` must be `Debug + Copy + Eq + Hash`
    /// - `T` must not be a zero-sized type
    /// - `T` must not implement `Drop`
    ///
    /// # Examples
    ///
    /// Basic usage:
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// // Intern a slice
    /// let slice1 = &[1, 2, 3];
    /// let interned1 = interner.intern_slice(slice1);
    ///
    /// // Intern the same content from a different source
    /// let slice2 = &[1, 2, 3];
    /// let interned2 = interner.intern_slice(slice2);
    ///
    /// // The interned slices are the same object
    /// assert!(core::ptr::eq(interned1.as_ref(), interned2.as_ref()));
    /// ```
    ///
    /// Zero-sized-types will lead to a compile error:
    ///
    /// ```compile_fail
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// // Intern a slice
    /// let slice = &[()];
    /// let interned = interner.intern_slice(slice);
    /// ```
    ///
    /// Types that implement `Drop` will lead to a compile error:
    ///
    /// ```compile_fail
    /// # use hashql_core::{heap::Heap, intern::InternSet};
    /// let heap = Heap::new();
    /// let interner = InternSet::new(&heap);
    ///
    /// // Intern a slice
    /// let slice = &[String::new()];
    /// let interned = interner.intern_slice(slice);
    /// ```
    pub fn intern_slice(&self, value: &[T]) -> Interned<'heap, [T]> {
        const { Self::ASSERT_T_IS_NOT_DROP };
        const { Self::ASSERT_T_IS_NOT_ZERO_SIZED };

        if value.is_empty() {
            return Interned::empty();
        }

        let heap = self.heap;

        let value = self.inner.map(|inner| {
            let hash_value = inner.hasher().hash_one(value);

            match inner
                .raw_entry_mut()
                .from_key_hashed_nocheck(hash_value, value)
            {
                RawEntryMut::Vacant(entry) => {
                    let value = value.transfer_into(heap);

                    let (key, ()) = entry.insert_hashed_nocheck(hash_value, &*value, ());
                    *key
                }
                RawEntryMut::Occupied(entry) => *entry.key(),
            }
        });

        Interned::new_unchecked(value)
    }
}

#[cfg(test)]
mod tests {
    use core::{
        hash::{Hash, Hasher},
        ptr,
    };

    use crate::{heap::Heap, intern::InternSet};

    #[test]
    fn basic() {
        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        // Intern the same value twice
        let value1 = intern_set.intern(42);
        let value2 = intern_set.intern(42);

        // They should be the same reference
        assert!(ptr::eq(value1.as_ref(), value2.as_ref()));

        // Intern a different value
        let value3 = intern_set.intern(43);

        // It should be a different reference
        assert!(!ptr::eq(value1.as_ref(), value3.as_ref()));
    }

    #[test]
    fn slice() {
        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        // Intern the same slice twice
        let slice1 = &[1, 2, 3];
        let value1 = intern_set.intern_slice(slice1);
        let value2 = intern_set.intern_slice(slice1);

        // They should be the same reference
        assert!(ptr::eq(value1.as_ref(), value2.as_ref()));

        // Intern a different slice
        let slice2 = &[1, 2, 4];
        let value3 = intern_set.intern_slice(slice2);

        // It should be a different reference
        assert!(!ptr::eq(value1.as_ref(), value3.as_ref()));

        // Test with a slice that has the same elements but is at a different memory location
        let slice3 = &[1, 2, 3];
        let value4 = intern_set.intern_slice(slice3);

        // They should be the same reference (equality, not identity)
        assert!(ptr::eq(value1.as_ref(), value4.as_ref()));
    }

    #[test]
    fn complex_types() {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        struct AddOp {
            lhs: i32,
            rhs: i32,
        }

        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        // This should work fine
        let value1 = intern_set.intern(AddOp { lhs: 1, rhs: 2 });
        let value2 = intern_set.intern(AddOp { lhs: 1, rhs: 2 });

        assert!(ptr::eq(value1.as_ref(), value2.as_ref()));
    }

    // We do not test concurrent interning, because `Bump` is not thread-safe.

    #[test]
    fn hash_collisions() {
        // Create a type with controlled hash collisions
        #[derive(Debug, Copy, Clone, PartialEq, Eq)]
        struct CollisionStruct {
            id: u32,
            collision_group: u32,
        }

        impl Hash for CollisionStruct {
            fn hash<H: Hasher>(&self, state: &mut H) {
                // Only hash the collision_group, causing collisions
                self.collision_group.hash(state);
            }
        }

        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        // Create values with the same hash but different equality
        let value1 = intern_set.intern(CollisionStruct {
            id: 1,
            collision_group: 42,
        });
        let value2 = intern_set.intern(CollisionStruct {
            id: 2,
            collision_group: 42,
        });

        // They should be different references despite hash collision
        assert!(!ptr::eq(value1.as_ref(), value2.as_ref()));

        // Interning the same value again should return the same reference
        let value1_again = intern_set.intern(CollisionStruct {
            id: 1,
            collision_group: 42,
        });
        assert!(ptr::eq(value1.as_ref(), value1_again.as_ref()));
    }

    #[test]
    fn lifetime_persistence() {
        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        let value1_ref;

        {
            // Create a value in a nested scope
            let value1 = intern_set.intern(42);
            value1_ref = value1;
        }

        // Create the same value again after the first has gone out of scope
        let value2 = intern_set.intern(42);

        // The reference should be the same even though value1 is dropped
        assert!(ptr::eq(value1_ref.as_ref(), value2.as_ref()));
    }

    #[test]
    fn empty_slices() {
        let heap = Heap::new();
        let intern_set = InternSet::new(&heap);

        // Intern empty slices
        let empty_slice1: &[i32] = &[];
        let empty_slice2: &[i32] = &[];

        let value1 = intern_set.intern_slice(empty_slice1);
        let value2 = intern_set.intern_slice(empty_slice2);

        assert!(ptr::eq(value1.as_ref(), value2.as_ref()));
    }

    #[test]
    fn slice_different_sources_same_content() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);

        // Create slices from different sources
        let vec1 = vec![1, 2, 3, 4, 5];
        let vec2 = vec![1, 2, 3, 4, 5];
        let arr = [1, 2, 3, 4, 5];

        let slice1 = interner.intern_slice(&vec1);
        let slice2 = interner.intern_slice(&vec2);
        let slice3 = interner.intern_slice(&arr);

        // All should point to the same interned slice
        assert!(ptr::eq(slice1.as_ref(), slice2.as_ref()));
        assert!(ptr::eq(slice2.as_ref(), slice3.as_ref()));
    }

    #[test]
    fn slice_subslices_are_different() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);

        let full = [1, 2, 3, 4, 5];
        let sub1 = &full[0..3]; // [1, 2, 3]
        let sub2 = &full[2..5]; // [3, 4, 5]

        let interned_full = interner.intern_slice(&full);
        let interned_sub1 = interner.intern_slice(sub1);
        let interned_sub2 = interner.intern_slice(sub2);

        // All should be different
        assert!(!ptr::eq(interned_full.as_ref(), interned_sub1.as_ref()));
        assert!(!ptr::eq(interned_full.as_ref(), interned_sub2.as_ref()));
        assert!(!ptr::eq(interned_sub1.as_ref(), interned_sub2.as_ref()));
    }

    #[test]
    fn slice_varying_lengths() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);

        // Intern slices of different lengths with the same prefix
        for len in 1..=100 {
            let data: Vec<i32> = (0..len).collect();
            interner.intern_slice(&data);
        }

        // Verify length 50 is still correctly interned
        let test = (0..50).collect::<Vec<_>>();
        let interned1 = interner.intern_slice(&test);
        let interned2 = interner.intern_slice(&test);
        assert!(ptr::eq(interned1.as_ref(), interned2.as_ref()));
    }

    #[derive(Debug, Copy, Clone, PartialEq, Eq)]
    struct CollisionInt {
        value: i32,
        collision_group: u8,
    }

    impl Hash for CollisionInt {
        fn hash<H: Hasher>(&self, state: &mut H) {
            // Only hash collision_group to force collisions
            self.collision_group.hash(state);
        }
    }

    #[test]
    fn hash_collisions_with_many_values() {
        let heap = Heap::new();
        let set = InternSet::new(&heap);

        let mut interned = vec![];

        // Create 100 values that all hash to the same value
        for i in 0..100 {
            let val = CollisionInt {
                value: i,
                collision_group: 42, // Same for all
            };
            interned.push((val, set.intern(val)));
        }

        // Verify each value has its own interned instance
        for i in 0..100 {
            for j in (i + 1)..100 {
                // Different values despite same hash
                assert!(!ptr::eq(interned[i].1.as_ref(), interned[j].1.as_ref()));
            }
        }

        // Verify re-interning returns same instance
        for (val, original) in &interned {
            let re_interned = set.intern(*val);
            assert!(ptr::eq(original.as_ref(), re_interned.as_ref()));
        }
    }
}
