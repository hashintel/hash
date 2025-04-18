//! Memory-efficient list implementation for both inline and heap storage.
//!
//! This module provides data structures for storing collections of elements either
//! inline (stack-allocated) or on the heap, based on size requirements.

use core::{
    fmt,
    fmt::Debug,
    hash::{Hash, Hasher},
    mem::MaybeUninit,
    ops::{Deref, Index},
    ptr, slice,
};

use super::Heap;

/// A fixed-capacity vector that stores elements inline without heap allocation.
///
/// `InlineVec<T, N>` stores up to `N` elements of type `T` inline, without requiring
/// heap allocation. It's designed for small collections where the maximum size is known
/// at compile time and performance is critical.
///
/// # Type Constraints
///
/// `T` must not implement `Drop`. Any call to a function that creates an `InlineVec`
/// will not compile if `T` is a `Drop` type.
pub struct InlineVec<T, const N: usize> {
    buf: [MaybeUninit<T>; N],
    len: usize,
}

impl<T, const N: usize> InlineVec<T, N> {
    /// Const assertion that `T` is not `Drop`.
    /// Must be referenced in all methods which create an `InlineVec`.
    const ASSERT_T_IS_NOT_DROP: () = assert!(
        !core::mem::needs_drop::<T>(),
        "Cannot create an InlineVec<T> where T is a Drop type"
    );

    /// Creates a new empty `InlineVec`.
    ///
    /// This initializes an empty vector with zero length and uninitialized storage.
    /// No heap allocation occurs.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::heap::list::InlineVec;
    /// let vec: InlineVec<u32, 10> = InlineVec::new();
    /// assert_eq!(vec.len(), 0);
    /// ```
    const fn new() -> Self {
        const { Self::ASSERT_T_IS_NOT_DROP };

        Self {
            buf: MaybeUninit::uninit().transpose(),
            len: 0,
        }
    }

    /// Creates a new `InlineVec` from a slice.
    ///
    /// Copies all elements from the provided slice into the new vector.
    ///
    /// # Panics
    ///
    /// Panics if `slice.len() > N`
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::heap::list::InlineVec;
    /// let data = [1, 2, 3, 4];
    /// let vec = InlineVec::<_, 10>::from_slice(&data);
    ///
    /// assert_eq!(vec.len(), 4);
    /// assert_eq!(vec[0], 1);
    /// ```
    fn from_slice(slice: &[T]) -> Self
    where
        T: Copy,
    {
        const { Self::ASSERT_T_IS_NOT_DROP };

        assert!(slice.len() <= N, "Slice length exceeds capacity");

        let len = slice.len();

        let mut this = Self::new();
        let ptr = (&raw mut this.buf).cast::<T>();

        #[expect(unsafe_code)]
        // SAFETY: We ensure that `slice.len()` does not exceed `N`, that `T` is not a `Drop` type
        // and that `T` is `Copy`.
        unsafe {
            ptr::copy_nonoverlapping(slice.as_ptr(), ptr, len);

            this.len = len;
        }

        this
    }

    const fn push(&mut self, value: T) -> Result<(), T> {
        const { Self::ASSERT_T_IS_NOT_DROP };

        if self.len == N {
            Err(value)
        } else {
            self.buf[self.len].write(value);
            self.len += 1;
            Ok(())
        }
    }

    /// Returns a reference to the vector as a slice.
    fn as_slice(&self) -> &[T] {
        #[expect(unsafe_code)]
        // SAFETY: Elements up to `self.len` are initialized.
        unsafe {
            (self.buf[..self.len]).assume_init_ref()
        }
    }

    fn iter(&self) -> slice::Iter<T> {
        self.as_slice().iter()
    }

    /// Returns the number of elements in the vector.
    const fn len(&self) -> usize {
        self.len
    }

    const fn is_empty(&self) -> bool {
        self.len == 0
    }
}

// #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]

impl<T, const N: usize> Debug for InlineVec<T, N>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.as_slice(), fmt)
    }
}

impl<T, const N: usize> Copy for InlineVec<T, N> where T: Copy {}
impl<T, const N: usize> Clone for InlineVec<T, N>
where
    T: Copy,
{
    fn clone(&self) -> Self {
        *self
    }
}

#[derive(Debug, Copy)]
enum ListInner<'heap, T, const N: usize> {
    Inline(InlineVec<T, N>),
    Spilled(&'heap [T]),
}

impl<T, const N: usize> Clone for ListInner<'_, T, N>
where
    T: Copy,
{
    fn clone(&self) -> Self {
        *self
    }
}

/// A list of elements that can be stored either inline or on the heap.
///
/// `List<'heap, T, CAPACITY>` provides a memory-efficient way to store elements:
/// - If the number of elements is less than or equal to `CAPACITY`, the elements are stored inline
///   without heap allocation.
/// - If the number of elements exceeds `CAPACITY`, the elements are stored on the heap via a
///   reference.
///
/// Once initialized it is not possible to further modify the list.
#[derive(Debug, Copy)]
pub struct List<'heap, T, const CAPACITY: usize> {
    inner: ListInner<'heap, T, CAPACITY>,
    heap: &'heap Heap,
}

impl<'heap, T, const CAPACITY: usize> List<'heap, T, CAPACITY> {
    /// Creates a new `List` from a slice, choosing between inline or heap storage.
    ///
    /// If the slice length is less than or equal to `CAPACITY`, the elements are stored
    /// inline without heap allocation. Otherwise, they are stored on the provided heap.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::heap::{Heap, list::List};
    /// # let heap = Heap::new();
    /// let small_data = [1, 2, 3];
    /// let list = List::<_, 5>::from_slice(&small_data, &heap); // Uses inline storage
    ///
    /// let large_data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    /// let list = List::<_, 5>::from_slice(&large_data, &heap); // Uses heap storage
    /// ```
    pub fn from_slice(slice: &[T], heap: &'heap Heap) -> Self
    where
        T: Copy,
    {
        let inner = if slice.len() <= CAPACITY {
            ListInner::Inline(InlineVec::from_slice(slice))
        } else {
            ListInner::Spilled(heap.slice(slice))
        };

        Self { inner, heap }
    }

    pub fn iter(&self) -> slice::Iter<T> {
        match self.inner {
            ListInner::Inline(ref vec) => vec.iter(),
            ListInner::Spilled(slice) => slice.iter(),
        }
    }

    pub fn as_slice(&self) -> &[T] {
        match self.inner {
            ListInner::Inline(ref vec) => vec.as_slice(),
            ListInner::Spilled(slice) => slice,
        }
    }

    pub const fn len(&self) -> usize {
        match self.inner {
            ListInner::Inline(ref vec) => vec.len(),
            ListInner::Spilled(slice) => slice.len(),
        }
    }

    pub const fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl<'this, 'heap, T, const CAPACITY: usize> IntoIterator for &'this List<'heap, T, CAPACITY> {
    type IntoIter = core::slice::Iter<'this, T>;
    type Item = &'this T;

    fn into_iter(self) -> Self::IntoIter {
        match &self.inner {
            ListInner::Inline(vec) => vec.iter(),
            ListInner::Spilled(slice) => slice.iter(),
        }
    }
}

impl<'heap, T, const CAPACITY: usize> Clone for List<'heap, T, CAPACITY>
where
    T: Copy,
{
    fn clone(&self) -> Self {
        *self
    }
}

impl<'heap, T, const CAPACITY: usize> PartialEq for List<'heap, T, CAPACITY>
where
    T: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        *self.as_slice() == *other.as_slice()
    }
}

impl<'heap, T, const CAPACITY: usize> Eq for List<'heap, T, CAPACITY> where T: PartialEq {}

impl<'heap, T, const CAPACITY: usize> Hash for List<'heap, T, CAPACITY>
where
    T: Hash,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_slice().hash(state);
    }
}

impl<'heap, T, const CAPACITY: usize, U> PartialEq<U> for List<'heap, T, CAPACITY>
where
    T: Copy + PartialEq,
    U: Deref<Target = [T]>,
{
    fn eq(&self, other: &U) -> bool {
        *self.as_slice() == **other
    }
}

impl<'heap, T, const CAPACITY: usize> Index<usize> for List<'heap, T, CAPACITY> {
    type Output = T;

    fn index(&self, index: usize) -> &Self::Output {
        &self.as_slice()[index]
    }
}
