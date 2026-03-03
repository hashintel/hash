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

use super::{InternSet, Interned};
use crate::collections::SmallVec;

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
    /// # use hashql_core::intern::{InternSet, Interned, Beef};
    /// # use hashql_core::heap::Heap;
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
    /// # use hashql_core::intern::{InternSet, Interned, Beef};
    /// # use hashql_core::heap::Heap;
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
                        let mut owned = SmallVec::from_slice_copy(interned.0);
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
    /// # use hashql_core::intern::{InternSet, Interned, Beef};
    /// # use hashql_core::heap::Heap;
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
    /// # use hashql_core::intern::{InternSet, Interned, Beef};
    /// # use hashql_core::heap::Heap;
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
                        let mut owned = SmallVec::from_slice_copy(interned.0);
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

    /// Transforms each element with access to all previously transformed elements.
    ///
    /// This is a scanning operation where each transformation can observe the accumulated
    /// results of all prior transformations. The closure receives two arguments:
    /// - `&[T]`: A slice of **already-transformed** elements (the prefix)
    /// - `T`: The current element to transform
    ///
    /// The key distinction from [`try_map`](Self::try_map) is that the prefix contains
    /// transformed values, not original values. This makes `try_scan` ideal for
    /// building up context-dependent structures where each step depends on the results
    /// of previous steps.
    ///
    /// # Copy-on-Write Behavior
    ///
    /// Like other mutation methods, this only allocates when the first modification occurs.
    /// If all elements remain unchanged, no allocation happens and the original interned
    /// slice is preserved.
    ///
    /// # Use Cases
    ///
    /// This method is particularly useful for:
    /// - Building projection chains where each projection depends on the accumulated path
    /// - Constructing hierarchical structures incrementally
    /// - Transformations where context from previous steps influences later steps
    /// - Any operation where you need to "carry forward" transformed state
    ///
    /// # Early Termination
    ///
    /// The `Try` trait bound allows early termination on errors or control flow conditions.
    /// If the closure returns an error, iteration stops immediately and elements after the
    /// error point remain unchanged.
    ///
    /// # Examples
    ///
    /// ## Building dependent transformations
    ///
    /// ```
    /// # use hashql_core::intern::{Beef, InternSet};
    /// # use hashql_core::heap::Heap;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[10, 20, 30, 40]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Multiply each element by its position (length of prefix)
    /// let _: Result<(), ()> = beef.try_scan(|prev, current| Ok(current * prev.len() as i32));
    ///
    /// assert_eq!(beef.as_slice(), &[0, 20, 60, 120]);
    /// // Element 0: 10 * 0 = 0
    /// // Element 1: 20 * 1 = 20
    /// // Element 2: 30 * 2 = 60
    /// // Element 3: 40 * 3 = 120
    /// ```
    ///
    /// ## Accumulating with transformed values
    ///
    /// ```
    /// # use hashql_core::intern::{Beef, InternSet};
    /// # use hashql_core::heap::Heap;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3, 4]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Each element becomes the sum of transformed prefix + current
    /// let _: Result<(), ()> = beef.try_scan(|prev, current| {
    ///     let sum: i32 = prev.iter().sum();
    ///     Ok(sum + current)
    /// });
    ///
    /// assert_eq!(beef.as_slice(), &[1, 3, 7, 15]);
    /// // Element 0: sum([]) + 1 = 1
    /// // Element 1: sum([1]) + 2 = 3
    /// // Element 2: sum([1, 3]) + 3 = 7
    /// // Element 3: sum([1, 3, 7]) + 4 = 15
    /// ```
    ///
    /// ## Early termination with Option
    ///
    /// ```
    /// # use hashql_core::intern::{Beef, InternSet};
    /// # use hashql_core::heap::Heap;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3, 4, 5]);
    /// let mut beef = Beef::new(interned);
    ///
    /// // Stop when prefix sum exceeds a threshold
    /// let result: Option<()> = beef.try_scan(|prev, current| {
    ///     if prev.iter().sum::<i32>() > 6 {
    ///         None
    ///     } else {
    ///         Some(current * 2)
    ///     }
    /// });
    ///
    /// assert_eq!(result, None);
    /// assert_eq!(beef.as_slice(), &[2, 4, 6, 4, 5]);
    /// // Transformed [1, 2, 3], then stopped, [4, 5] unchanged
    /// ```
    ///
    /// ## No allocation when unchanged
    ///
    /// ```
    /// # use hashql_core::intern::{Beef, InternSet};
    /// # use hashql_core::heap::Heap;
    /// # use core::ptr;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let original_ptr = interned.as_ptr();
    /// let mut beef = Beef::new(interned);
    ///
    /// // Return all elements unchanged
    /// let _: Result<(), ()> = beef.try_scan(|_prev, x| Ok(x));
    ///
    /// let finished = beef.finish(&interner);
    /// assert!(ptr::eq(finished.as_ptr(), original_ptr)); // Same memory!
    /// ```
    ///
    /// ## Prefix cannot escape closure
    ///
    /// ```compile_fail
    /// # use hashql_core::intern::{Beef, InternSet};
    /// # use hashql_core::heap::Heap;
    /// # use core::ptr;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let interned = interner.intern_slice(&[1, 2, 3]);
    /// let original_ptr = interned.as_ptr();
    /// let mut beef = Beef::new(interned);
    ///
    /// // Return all elements unchanged
    /// let mut escapee = &[] as &[i32];
    /// let _: Result<(), ()> = beef.try_scan(|prev, x| {
    ///     escapee = prev;
    ///     Ok(x)
    /// });
    ///
    /// let finished = beef.finish(&interner);
    /// assert!(ptr::eq(finished.as_ptr(), original_ptr)); // Same memory!
    /// ```
    pub fn try_scan<F, U>(&mut self, mut closure: impl FnMut(&[T], T) -> F) -> U
    where
        F: Try<Output = T>,
        U: Try<Output = (), Residual = F::Residual>,
    {
        let (offset, buffer) = match &mut self.0 {
            BeefData::Owned(owned) => (0, owned),
            BeefData::Interned(interned) => {
                let mut index = 0;
                let mut outer = None;

                while index < interned.len() {
                    // Loop through every item (until the end) of the interned slice, if the item
                    // changed, transition to the smallvec, then use that smallvec instead
                    let value = interned[index];
                    let mapped = closure(&interned[..index], value)?;

                    if value != mapped {
                        // Transition to a smallvec, then use that smallvec in the final iteration
                        let mut owned = SmallVec::from_slice_copy(interned.0);
                        owned[index] = mapped;
                        self.0 = BeefData::Owned(owned);

                        outer = Some(match &mut self.0 {
                            BeefData::Owned(owned) => owned,
                            BeefData::Interned(_) => unreachable!(),
                        });

                        index += 1;
                        break;
                    }

                    index += 1;
                }

                let Some(outer) = outer else {
                    // No changes have occured
                    return Try::from_output(());
                };

                (index, outer)
            }
        };

        let ptr = buffer.as_mut_ptr();
        let len = buffer.len();
        #[expect(unsafe_code)]
        for index in offset..len {
            // SAFETY: We're creating a shared reference to `buffer[..index]`
            // while holding a mutable reference to `buffer[index]`.
            // This is safe because:
            // 1. The shared slice `previous` covers [0..index)
            // 2. The mutable reference `remaining` is to element [index]
            // 3. These ranges are disjoint by construction
            // 4. `previous` is only used within the closure call and doesn't escape
            let previous = unsafe { core::slice::from_raw_parts(ptr, index) };
            // SAFETY: see above
            let remaining = unsafe { &mut *ptr.add(index) };
            *remaining = closure(previous, *remaining)?;
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
    /// # use hashql_core::intern::{InternSet, Interned, Beef};
    /// # use hashql_core::heap::Heap;
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

    /// Finalizes the [`Beef`] and returns an interned slice using a custom interning function.
    ///
    /// This method provides flexible control over how the data is interned when finishing the
    /// [`Beef`] operation. Unlike [`finish`], which uses a standard [`InternSet`], this method
    /// allows you to provide a custom interning closure.
    ///
    /// If the [`Beef`] contains owned data (meaning modifications were made), the custom
    /// interning function is called with a mutable reference to the owned slice. If the
    /// [`Beef`] still contains the original interned data (no modifications were made), that
    /// original interned slice is returned directly without calling the interning function.
    ///
    /// This is particularly useful when you need to:
    /// - Use a different interner than the standard one
    /// - Perform additional processing during the interning step
    /// - Apply custom deduplication or caching logic
    /// - Integrate with specialized interning systems
    ///
    /// # Arguments
    ///
    /// * `intern` - A closure that takes a mutable slice and returns an interned version. This
    ///   closure is only called if the [`Beef`] contains owned data (i.e., modifications were
    ///   made). The mutable reference allows for potential in-place optimizations before interning.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::intern::{InternSet, Interned};
    /// # use hashql_core::heap::Heap;
    /// # use hashql_core::intern::Beef;
    /// # let heap = Heap::new();
    /// # let interner = InternSet::new(&heap);
    /// let original = interner.intern_slice(&[1, 2, 3]);
    ///
    /// // Custom interning with additional processing
    /// let mut beef = Beef::new(original);
    /// beef.map(|x| x * 2);
    ///
    /// let result = beef.finish_with(|slice| {
    ///     // Could perform additional processing here
    ///     slice.sort(); // Example: sort before interning
    ///     interner.intern_slice(slice)
    /// });
    ///
    /// assert_eq!(result.as_ref(), &[2, 4, 6]);
    /// ```
    ///
    /// [`finish`]: Self::finish
    #[must_use]
    pub fn finish_with(
        self,
        intern: impl FnOnce(&mut [T]) -> Interned<'heap, [T]>,
    ) -> Interned<'heap, [T]> {
        match self.0 {
            BeefData::Owned(mut slice) => intern(&mut slice),
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

    use crate::{
        heap::Heap,
        intern::{Beef, InternSet, Interned},
    };

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

    #[test]
    fn finish_modifications() {
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
    fn finish_with_no_modifications() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3]);

        let beef = Beef::new(original);
        let result = beef.finish_with(|_| panic!("no modification should occur"));

        // Should be the exact same Interned instance
        assert_eq!(result.as_ref(), original.as_ref());
        assert!(ptr::eq(result.as_ref(), original.as_ref())); // Same memory address
    }

    #[test]
    fn map() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        // No modification
        let mut beef = Beef::new(original);
        beef.map(|x| x);
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 5]);
        let _: Interned<'_, [i32]> = beef.finish_with(|_| panic!("no modification = no interning"));

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
        let _: Interned<'_, [i32]> = beef.finish_with(|_| panic!("no modification = no interning"));
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

    #[test]
    fn try_map_last_element() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);

        // Call try_map with success
        let result: Result<(), &str> = beef.try_map(|x| if x == 5 { Ok(x * 2) } else { Ok(x) });
        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 10]);
    }

    #[test]
    fn try_scan_empty() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[] as &[i32]);

        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_scan(|_prev, x| Ok(x * 2));

        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[] as &[i32]);
    }

    #[test]
    fn try_scan_cumulative_sum() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);
        let result: Result<(), &str> = beef.try_scan(|prev, current| {
            let sum: i32 = prev.iter().sum();
            Ok(sum + current)
        });

        assert_eq!(result, Ok(()));
        // prev contains already-transformed values, so this builds up:
        // [1, 1+2=3, 1+3+3=7, 1+3+7+4=15, 1+3+7+15+5=31]
        assert_eq!(beef.as_slice(), &[1, 3, 7, 15, 31]);
    }

    #[test]
    fn try_scan_no_changes() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);

        let result: Result<(), &str> = beef.try_scan(|_prev, x| Ok(x));

        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 5]);

        let _: Interned<'_, [i32]> = beef.finish_with(|_| panic!("no modification = no interning"));
    }

    #[test]
    fn try_scan_last_element_changes() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);
        let result: Result<(), &str> =
            beef.try_scan(|prev, x| if prev.len() == 4 { Ok(x * 100) } else { Ok(x) });

        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[1, 2, 3, 4, 500]);
    }

    #[test]
    fn try_scan_verify_prefix_contents() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[10, 20, 30, 40]);

        let mut beef = Beef::new(original);
        let mut expected_prefixes = vec![vec![], vec![100], vec![100, 200], vec![100, 200, 300]];

        let result: Result<(), &str> = beef.try_scan(|prev, current| {
            let expected = expected_prefixes.remove(0);
            assert_eq!(prev, expected.as_slice());
            Ok(current * 10)
        });

        assert_eq!(result, Ok(()));
        assert_eq!(beef.as_slice(), &[100, 200, 300, 400]);
        assert!(expected_prefixes.is_empty());
    }

    #[test]
    fn try_scan_early_termination() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4, 5]);

        let mut beef = Beef::new(original);
        let result: Option<()> = beef.try_scan(|prev, current| {
            if prev.iter().sum::<i32>() > 6 {
                None
            } else {
                Some(current * 2)
            }
        });

        assert_eq!(result, None);
        assert_eq!(beef.as_slice(), &[2, 4, 6, 4, 5]);
    }

    #[test]
    fn try_scan_already_owned() {
        let heap = Heap::new();
        let interner = InternSet::new(&heap);
        let original = interner.intern_slice(&[1, 2, 3, 4]);

        let mut beef = Beef::new(original);
        beef.map(|x| x * 2);
        assert_eq!(beef.as_slice(), &[2, 4, 6, 8]);

        let result: Result<(), &str> = beef.try_scan(|prev, current| {
            let sum: i32 = prev.iter().sum();
            Ok(sum + current)
        });

        assert_eq!(result, Ok(()));
        // [2, 2+4=6, 2+6+6=14, 2+6+14+8=30]
        assert_eq!(beef.as_slice(), &[2, 6, 14, 30]);
    }
}
