//! This module provides a copy-on-write slice implementation optimized for interned data.
//!
//! The primary type is [`Beef`] (a play on words, as it is a slice of [`Cow`]), which allows
//! efficient element-wise modification of interned slices by only copying the underlying data when
//! a modification actually occurs.
//!
//! Since the HIR uses immutable, interned data structures, we need a way to efficiently transform
//! collections of nodes without excessive copying. [`Beef`] achieves this by:
//!
//! 1. Starting with the original interned slice (zero-copy)
//! 2. Only allocating and copying when the first modification occurs
//! 3. Reusing that allocation for subsequent modifications
//! 4. Never copying if no modifications are made at all
//!
//! # Use Cases
//!
//! [`Beef`] is particularly useful for:
//!
//! - **Transformation passes** that often don't modify every element in a collection
//! - **Optimization passes** that only change a small subset of nodes
//! - **Any operation** on collections that might leave most elements unchanged
//!
//! This approach aligns with the HIR's design principles: immutability by default,
//! with explicit and efficient paths for transformations when needed.
//!
//! [`Cow`]: std::borrow::Cow

use core::{fmt, fmt::Debug, hash::Hash, ops::Try};

use hashql_core::{
    collection::SmallVec,
    intern::{InternSet, Interned},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum BeefData<'heap, T> {
    Owned(SmallVec<T>),
    Interned(Interned<'heap, [T]>),
}

/// A Copy-on-Write slice optimized for element-wise operations on interned data.
///
/// [`Beef`] (a play on [`Cow`] - Copy on Write - as in a "slice of [`Cow`]") provides efficient
/// element-wise transformation capabilities while minimizing copying. It only
/// transitions from a shared interned state to an owned state when an actual
/// modification occurs.
///
/// This is particularly useful in scenarios in which no modifications occur, allowing for zero-copy
/// operations. For comparison, given a [`SmallVec<T>`] as comparison, [`Beef`] is consistently
/// about 25x faster, whenever no modifications occur, with a negligible overhead in case of
/// modification (5-10%). The overhead is only present due to the fact that we have branching logic
/// to transition between the stages, which is negligible in most cases.
///
/// This is particularly useful for transformation passes that often don't modify
/// every element, allowing zero-copy operations when no changes are needed.
///
/// [`Cow`]: std::borrow::Cow
#[derive(Clone)]
pub struct Beef<'heap, T>(BeefData<'heap, T>);

impl<'heap, T> Beef<'heap, T>
where
    T: Copy + Eq + Hash,
{
    /// Creates a new [`Beef`] instance from an interned slice.
    ///
    /// This is a zero-cost operation that simply wraps the interned slice in the [`Beef`] container
    /// without any copying.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_hir::fold::beef::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let beef = Beef::new(interned);
    /// ```
    #[must_use]
    pub const fn new(slice: Interned<'heap, [T]>) -> Self {
        Self(BeefData::Interned(slice))
    }

    /// Maps each element in the slice using the provided closure.
    ///
    /// This method applies a transformation function to each element. The key
    /// optimization is that it only transitions to an owned state when an actual
    /// modification occurs (when the mapped value differs from the original).
    ///
    /// The implementation is optimized to:
    /// 1. Avoid copying if no elements change
    /// 2. Only perform the copy operation once, at the first modification
    /// 3. Efficiently handle both small slices (using [`SmallVec`] inline storage) and larger
    ///    slices
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_hir::fold::beef::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Double each element
    /// beef.map(|x| x * 2);
    /// assert_eq!(beef.as_slice(), &[2, 4, 6]);
    ///
    /// // No-op mapping doesn't create a copy
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let mut beef = Beef::new(interned);
    /// beef.map(|x| x); // No change to any element
    /// // Still in interned state, no allocation occurred
    /// ```
    #[inline]
    #[expect(clippy::min_ident_chars)]
    pub fn map(&mut self, mut closure: impl FnMut(T) -> T) {
        const CHUNK_SIZE: usize = 4;

        let remaining = match &mut self.0 {
            BeefData::Owned(slice) => slice.as_mut_slice(),
            BeefData::Interned(interned) => {
                let mut index = 0;
                let mut remaining = &mut [] as &mut [T];

                while index < interned.len() {
                    // Loop through every item (until the end) of the interned slice, if the item
                    // changed, transition to the smallvec, then use that smallvec instead
                    let value = interned[index];
                    let mapped = closure(value);

                    if value != mapped {
                        // Transition to a smallvec, then use that smallvec in the final iteration
                        let mut owned = SmallVec::from_slice(interned.0);
                        owned[index] = mapped;
                        self.0 = BeefData::Owned(owned);

                        remaining = match &mut self.0 {
                            BeefData::Owned(owned) => &mut owned[index + 1..],
                            BeefData::Interned(_) => unreachable!(),
                        };

                        break;
                    }

                    index += 1;
                }

                remaining
            }
        };

        let (chunks, remaining) = remaining.as_chunks_mut::<CHUNK_SIZE>();

        // Unroll the loop for better performance (~10% performance benefit)
        for [a, b, c, d] in chunks {
            *a = closure(*a);
            *b = closure(*b);
            *c = closure(*c);
            *d = closure(*d);
        }

        for item in remaining {
            *item = closure(*item);
        }
    }

    /// Maps each element in the slice using the provided fallible closure.
    ///
    /// This method applies a transformation function that might fail to each element.
    /// Like [`map`](Self::map), it only transitions to an owned state when an actual
    /// modification occurs (when the mapped value differs from the original).
    ///
    /// If the closure returns an error for any element, the mapping process will
    /// short-circuit at that point and return the error. Any modifications made before
    /// the error occurred will be preserved.
    ///
    /// # Type Parameters
    ///
    /// - `F`: A type implementing [`Try`] representing the result type of the mapping closure
    /// - `U`: A type implementing [`Try`] with compatible residual type, representing the overall
    ///   result
    ///
    /// This method works with various [`Try`] types including [`Result<T, E>`] and [`Option<T>`].
    ///
    /// # Examples
    ///
    /// Using with `Result`:
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_hir::fold::beef::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3, 4]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Multiply each element by 2, but fail if we encounter a value > 3
    /// let result: Result<(), &str> = beef.try_map(|x| {
    ///     if x > 3 {
    ///         Err("Value too large")
    ///     } else {
    ///         Ok(x * 2)
    ///     }
    /// });
    ///
    /// assert!(result.is_err());
    /// // The slice should have been partially modified before the error
    /// assert_eq!(beef.as_slice(), &[2, 4, 6, 4]);
    /// ```
    ///
    /// Using with `Option`:
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_hir::fold::beef::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Double even numbers, return None for odd numbers
    /// let result: Option<()> = beef.try_map(|x| if x % 2 == 0 { Some(x * 2) } else { None });
    ///
    /// assert!(result.is_none()); // Fails on first odd number
    /// assert_eq!(beef.as_slice(), &[1, 2, 3]); // No changes made
    ///
    /// // Successful transformation
    /// let mut beef = Beef::new(interner.intern_slice(&[2, 4, 6]));
    /// let result: Option<()> = beef.try_map(|x| Some(x / 2));
    /// assert!(result.is_some());
    /// assert_eq!(beef.as_slice(), &[1, 2, 3]);
    /// ```
    pub fn try_map<F, U>(&mut self, mut closure: impl FnMut(T) -> F) -> U
    where
        F: Try<Output = T>,
        U: Try<Output = (), Residual = F::Residual>,
    {
        let remaining = match &mut self.0 {
            BeefData::Owned(slice) => slice.as_mut_slice(),
            BeefData::Interned(interned) => {
                let mut index = 0;
                let mut remaining = &mut [] as &mut [T];

                while index < interned.len() {
                    // Loop through every item (until the end) of the interned slice, if the item
                    // changed, transition to the smallvec, then use that smallvec instead
                    let value = interned[index];
                    let mapped = closure(value)?;

                    if value != mapped {
                        // Transition to a smallvec, then use that smallvec in the final iteration
                        let mut owned = SmallVec::from_slice(interned.0);
                        owned[index] = mapped;
                        self.0 = BeefData::Owned(owned);

                        remaining = match &mut self.0 {
                            BeefData::Owned(owned) => &mut owned[index + 1..],
                            BeefData::Interned(_) => unreachable!(),
                        };

                        break;
                    }

                    index += 1;
                }

                remaining
            }
        };

        for item in remaining {
            *item = closure(*item)?;
        }

        Try::from_output(())
    }

    /// Returns the number of elements in the slice.
    #[must_use]
    pub fn len(&self) -> usize {
        match &self.0 {
            BeefData::Owned(slice) => slice.len(),
            BeefData::Interned(slice) => slice.len(),
        }
    }

    /// Returns whether the slice is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        match &self.0 {
            BeefData::Owned(slice) => slice.is_empty(),
            BeefData::Interned(slice) => slice.is_empty(),
        }
    }

    /// Returns a reference to the underlying slice.
    ///
    /// This provides access to the slice contents without copying,
    /// regardless of whether the [`Beef`] is in the owned or interned state.
    #[must_use]
    pub fn as_slice(&self) -> &[T] {
        match &self.0 {
            BeefData::Owned(slice) => slice.as_slice(),
            BeefData::Interned(slice) => slice.as_ref(),
        }
    }

    /// Consumes the [`Beef`] and returns an interned slice.
    ///
    /// This method efficiently handles both cases:
    /// - If the [`Beef`] is still in its original interned state (no modifications), it simply
    ///   returns the original interned slice without any copying or re-interning.
    /// - If the [`Beef`] has been modified, it interns the current state of the slice.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_hir::fold::beef::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// // Example with modification
    /// let original = interner.intern_slice(&[1, 2, 3]);
    /// let mut beef = Beef::new(original);
    /// beef.map(|x| x * 2);
    /// let result = beef.finish(&interner);
    /// assert_eq!(result.as_ref(), &[2, 4, 6]);
    ///
    /// // Example without modification - returns original efficiently
    /// let original = interner.intern_slice(&[1, 2, 3]);
    /// let beef = Beef::new(original);
    /// let result = beef.finish(&interner);
    /// assert!(std::ptr::eq(original.as_ref(), result.as_ref())); // Same memory
    /// ```
    #[must_use]
    pub fn finish(self, interner: &InternSet<'heap, [T]>) -> Interned<'heap, [T]> {
        match self.0 {
            BeefData::Owned(slice) => interner.intern_slice(&slice),
            BeefData::Interned(slice) => slice,
        }
    }
}

impl<T> Debug for Beef<'_, T>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = fmt.debug_tuple("Beef");

        match &self.0 {
            BeefData::Owned(owned) => debug.field(owned),
            BeefData::Interned(interned) => debug.field(interned),
        };

        debug.finish()
    }
}

#[cfg(test)]
mod tests {
    use core::ptr;

    use hashql_core::{heap::Heap, intern::InternSet};

    use crate::fold::beef::Beef;

    // Test finish with no modifications
    #[test]
    fn finish_no_modifications() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3]);

        let beef = Beef::new(original);
        let result = beef.finish(&interner);

        // Should be the exact same Interned instance
        assert_eq!(result.as_ref(), original.as_ref());
        assert!(ptr::eq(result.as_ref(), original.as_ref())); // Same memory address
    }

    // Test finish with modifications
    #[test]
    fn finish_with_modifications() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3]);

        let mut beef = Beef::new(original);
        beef.map(|x| x + 10);
        let result = beef.finish(&interner);

        // Should be a different interned slice with the new values
        assert_eq!(result.as_ref(), &[11, 12, 13]);
        assert!(!ptr::eq(result.as_ref(), original.as_ref())); // Different memory address
    }

    #[test]
    fn map() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // Partial Modification
        let mut beef = Beef::new(original);
        beef.map(|x| if x == 3 { 30 } else { x });
        assert_eq!(beef.as_slice(), &[1, 2, 30, 4, 5]);
        assert_eq!(beef.finish(&interner).as_ref(), &[1, 2, 30, 4, 5]);

        // Early Modification
        let mut beef = Beef::new(original);
        beef.map(|x| if x == 1 { 100 } else { x });
        assert_eq!(beef.as_slice(), &[100, 2, 3, 4, 5]);

        // Late Modification
        let mut beef = Beef::new(original);
        beef.map(|x| if x == 5 { 500 } else { x });
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 500]);
    }

    #[test]
    #[expect(clippy::integer_division_remainder_used)]
    fn map_repeat() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);

        // First modification
        beef.map(|x| if x % 2 == 0 { x * 2 } else { x });
        assert_eq!(beef.as_slice(), &[1, 4, 3, 8, 5]);

        // Second modification
        beef.map(|x| x + 1);
        assert_eq!(beef.as_slice(), &[2, 5, 4, 9, 6]);

        // Result should be interned with all modifications applied
        let result = beef.finish(&interner);
        assert_eq!(result.as_ref(), &[2, 5, 4, 9, 6]);
    }

    #[test]
    fn map_edge_cases() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);

        // Empty slice
        let empty = interner.intern_slice(&[]);
        let mut empty_beef = Beef::new(empty);
        empty_beef.map(|x| x + 1); // Should be a no-op since there are no elements
        assert_eq!(empty_beef.as_slice(), &[] as &[i32]);

        // Single-element slice
        let single = interner.intern_slice(&[42]);
        let mut single_beef = Beef::new(single);
        single_beef.map(|x| x + 1);
        assert_eq!(single_beef.as_slice(), &[43]);
    }

    #[test]
    fn try_map_success() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // All transformations succeed
        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_map(|x| Ok(x * 2));
        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[2, 4, 6, 8, 10]);

        // No changes (identity function)
        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_map(Ok);
        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 5]);

        // Should still be in interned state (verify with finish)
        let result = beef.finish(&interner);
        assert!(ptr::eq(result.as_ref(), original.as_ref())); // Same memory address
    }

    #[test]
    fn try_map_failure() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // Fail on the third element
        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_map(|x| {
            if x == 3 {
                Err("Error on value 3")
            } else {
                Ok(x * 10)
            }
        });
        assert_eq!(result, Err("Error on value 3"));
        // First two elements should be transformed
        assert_eq!(beef.as_slice(), &[10, 20, 3, 4, 5]);

        // Fail on the first element
        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_map(|x| {
            if x == 1 {
                Err("Error on first element")
            } else {
                Ok(x)
            }
        });
        assert_eq!(result, Err("Error on first element"));
        // Should still be in interned state since no modifications happened
        assert_eq!(beef.as_slice(), original.as_ref());
    }

    #[test]
    fn try_map_empty_and_edge_cases() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);

        // Empty slice
        let empty = interner.intern_slice(&[]);
        let mut empty_beef = Beef::new(empty);
        let result: Result<(), &str> = empty_beef.try_map(|x| Ok(x + 1));
        assert_eq!(result, Ok(()));
        assert_eq!(empty_beef.as_slice(), &[] as &[i32]);

        // Single element success
        let single = interner.intern_slice(&[42]);
        let mut single_beef = Beef::new(single);
        let result: Result<(), &str> = single_beef.try_map(|x| Ok(x + 1));
        assert_eq!(result, Ok(()));
        assert_eq!(single_beef.as_slice(), &[43]);

        // Single element failure
        let mut single_beef = Beef::new(single);
        let result: Result<(), &str> = single_beef.try_map(|_| Err("Failed"));
        assert_eq!(result, Err("Failed"));
        assert_eq!(single_beef.as_slice(), single.as_ref());
    }

    #[test]
    #[expect(clippy::integer_division_remainder_used)]
    fn try_map_with_option() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // All transformations succeed
        let mut beef = Beef::new(original);
        let result: Option<()> = beef.try_map(|x| Some(x * 3));
        assert!(result.is_some());
        assert_eq!(beef.as_slice(), &[3, 6, 9, 12, 15]);

        // Transformation fails on even numbers
        let mut beef = Beef::new(original);
        let result: Option<()> = beef.try_map(|x| if x % 2 == 0 { None } else { Some(x * 10) });
        assert!(result.is_none());
        // The first value should be transformed, then it should fail on 2
        assert_eq!(beef.as_slice(), &[10, 2, 3, 4, 5]);
    }

    #[test]
    fn try_map_multiple_calls() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // Call try_map multiple times with success
        let mut beef = Beef::new(original);

        // First call - double all values
        let result1: Result<(), &str> = beef.try_map(|x| Ok(x * 2));
        assert_eq!(result1, Ok(()));
        assert_eq!(beef.as_slice(), &[2, 4, 6, 8, 10]);

        // Second call - add 5 to all values
        let result2: Result<(), &str> = beef.try_map(|x| Ok(x + 5));
        assert_eq!(result2, Ok(()));
        assert_eq!(beef.as_slice(), &[7, 9, 11, 13, 15]);

        // Third call with partial failure
        let result3: Result<(), &str> = beef.try_map(|x| {
            if x > 10 {
                Err("Value too large")
            } else {
                Ok(x - 5)
            }
        });
        assert_eq!(result3, Err("Value too large"));
        // First two elements should be transformed before error
        assert_eq!(beef.as_slice(), &[2, 4, 11, 13, 15]);
    }
}
