#![expect(clippy::type_repetition_in_bounds)]
use core::{fmt::Debug, hash::Hash, hint::cold_path};

use super::Interned;
use crate::{collection::ConcurrentHashSet, heap::Heap};

/// A thread-safe interner for values of type `T`.
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
/// `InternSet` allocates memory from the provided `Heap`, which should outlive the interner.
/// Interned values remain valid for the lifetime of the heap, not the interner itself.
///
/// # Constraints
///
/// 1. Types that implement `Drop` cannot be interned
/// 2. Zero-sized types cannot be interned
/// 3. Interned types must implement `Eq` and `Hash`
///
/// # Thread Safety
///
/// This implementation is built with thread-safety in mind, but due to the fact that the `Heap` is
/// not thread-safe, concurrent interning operations are not yet supported.
///
/// # Performance Considerations
///
/// The current implementation prioritizes code reuse and maintenance over maximum performance.
/// For very high throughput workloads, alternative implementations could be considered as noted
/// in the implementation comments.
///
/// # Examples
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
/// // The references point to the same memory location
/// assert!(core::ptr::eq(interned1.as_ref(), interned2.as_ref()));
/// ```
#[derive(derive_more::Debug)]
#[debug(bound(T: Eq))]
pub struct InternSet<'heap, T: ?Sized> {
    // scc::HashMap isn't ideal for our purpose here, but allows us to re-use dependencies, for a
    // single threaded (or few-threaded) workload a `DashMap` performs better, even better would
    // likely be the change to something similar as the original implementation in rustc, which
    // uses the hashbrown `HashTable` in conjunction with a `RefCell`/`Mutex` to provide interior
    // mutability. This option would increase the required code (and therefore maintenance) by
    // quite a bit. For our use case, as we only have short periods of time where we need to
    // access the set, this would likely result in a significant performance improvement.
    // Should this ever become a bottleneck, we can consider alternatives.
    inner: ConcurrentHashSet<&'heap T>,
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
            inner: ConcurrentHashSet::default(),
            heap,
        }
    }
}

impl<'heap, T: ?Sized + Eq + Hash> InternSet<'heap, T> {
    /// Assertion that ensures T doesn't require drop.
    ///
    /// This is necessary because we allocate memory for T on the heap and don't run
    /// destructors when the heap is dropped.
    const ASSERT_T_IS_NOT_DROP: () = assert!(
        !core::mem::needs_drop::<T>(),
        "Cannot intern a type that needs drop"
    );

    /// Inserts an already allocated value into the intern set.
    ///
    /// This method is used internally by both `intern` and `intern_slice`. It handles the
    /// actual insertion of a value that's already been allocated on the heap.
    ///
    /// If the value already exists in the set (determined by equality), the existing
    /// interned value is returned. If not, the new value is inserted and returned.
    ///
    /// # Concurrency
    ///
    /// This method handles concurrent insertions by detecting if another thread has
    /// already inserted the same value and using that value instead. This has the caveat that we
    /// potentially waste memory by allocating a new value that will never be used. (In reality,
    /// this codepath is unlikely to be hit at all.)
    fn insert(&self, value: &'heap T) -> Interned<'heap, T> {
        if self.inner.insert(value) == Ok(()) {
            Interned::new_unchecked(value)
        } else {
            // Due to the fact that this is essentially single-threaded, the concurrent insertion is
            // unlikely to *ever* occur.
            cold_path();

            tracing::debug!("concurrent insertion detected, using existing value");

            // We never remove so we know this is going to work
            let value = self
                .inner
                .read(value, |kind| *kind)
                .unwrap_or_else(|| unreachable!());

            Interned::new_unchecked(value)
        }
    }
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
    #[expect(clippy::option_if_let_else, reason = "readability")]
    pub fn intern(&self, value: T) -> Interned<'heap, T> {
        const { Self::ASSERT_T_IS_NOT_DROP };
        const { Self::ASSERT_T_IS_NOT_ZERO_SIZED };

        if let Some(value) = self.inner.read(&value, |value| *value) {
            Interned::new_unchecked(value)
        } else {
            let value = self.heap.alloc(value);

            self.insert(value)
        }
    }
}

impl<'heap, T> InternSet<'heap, [T]>
where
    T: Debug + Copy + Eq + Hash,
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
    #[expect(clippy::option_if_let_else, reason = "readability")]
    pub fn intern_slice(&self, value: &[T]) -> Interned<'heap, [T]> {
        const { Self::ASSERT_T_IS_NOT_DROP };
        const { Self::ASSERT_T_IS_NOT_ZERO_SIZED };

        if let Some(value) = self.inner.read(value, |value| *value) {
            Interned::new_unchecked(value)
        } else {
            let value = self.heap.slice(value);

            self.insert(value)
        }
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
}
