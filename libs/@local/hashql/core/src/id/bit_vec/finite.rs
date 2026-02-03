//! A fixed-size bitset backed by a single integral type.
//!
//! [`FiniteBitSet`] provides a compact bitset implementation where all bits are stored in a single
//! primitive integer (e.g., `u32`, `u64`, `u128`). This makes it ideal for small domains where
//! the maximum number of elements is known at compile time and fits within the chosen integral
//! type.
//!
//! Unlike [`DenseBitSet`], this type does not track domain size at runtime, trading flexibility
//! for a smaller memory footprint (the size of the underlying integral only).
//!
//! [`DenseBitSet`]: super::DenseBitSet
#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    reason = "Integral conversions in macro expansions may truncate or widen depending on target \
              type"
)]

use core::{
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::{BitAnd, BitAndAssign, BitOrAssign, Not, RangeBounds, Shl, Shr, Sub},
};

use super::BitRelations;
use crate::id::{Id, bit_vec::inclusive_start_end};

/// Trait for integral types that can serve as storage for a [`FiniteBitSet`].
///
/// This trait defines the operations required to use an unsigned integer as the backing store
/// for a finite bitset. All standard unsigned integer types (`u8`, `u16`, `u32`, `u64`, `u128`,
/// `usize`) implement this trait.
///
/// The "integral" in the name refers to the mathematical concept of integers, distinguishing
/// these types from other potential backing stores like arrays of integers.
pub trait FiniteBitSetIntegral:
    Copy
    + Clone
    + Hash
    + BitAnd<Output = Self>
    + BitOrAssign
    + BitAndAssign
    + Shl<Output = Self>
    + Shr<Output = Self>
    + Sub<Output = Self>
    + Not<Output = Self>
    + const PartialEq
    + fmt::Binary
{
    /// Maximum number of bits this integral can store.
    ///
    /// For example, `u32::MAX_DOMAIN_SIZE` is 32, `u64::MAX_DOMAIN_SIZE` is 64.
    const MAX_DOMAIN_SIZE: u32;

    /// The integral with all bits set to 1.
    const FILLED: Self;

    /// The integral with all bits set to 0.
    const EMPTY: Self;

    /// The value `1` in this integral type.
    const ONE: Self;

    /// The value `0` in this integral type.
    const ZERO: Self;

    /// Converts an [`Id`] to this integral type.
    fn from_id<I: Id>(id: I) -> Self;

    /// Converts a `usize` to this integral type.
    fn from_usize(value: usize) -> Self;

    /// Converts a `u32` to this integral type.
    fn from_u32(value: u32) -> Self;

    /// Returns the number of ones in the binary representation.
    fn count_ones(self) -> u32;

    /// Returns the number of trailing zeros in the binary representation.
    fn trailing_zeros(self) -> u32;
}

macro_rules! impl_trait {
    ($($integral:ty),*) => {
        $(impl_trait!(@impl $integral);)*
    };
    (@impl $integral:ty) => {
        impl FiniteBitSetIntegral for $integral {
            const EMPTY: Self = Self::MIN;
            const FILLED: Self = Self::MAX;
            const MAX_DOMAIN_SIZE: u32 = <$integral>::BITS;
            const ONE: Self = 1;
            const ZERO: Self = 0;

            fn from_id<I: Id>(id: I) -> Self {
                id.as_u32() as Self
            }

            fn from_usize(value: usize) -> Self {
                value as Self
            }

            fn from_u32(value: u32) -> Self {
                value as Self
            }

            fn count_ones(self) -> u32 {
                self.count_ones()
            }

            fn trailing_zeros(self) -> u32 {
                self.trailing_zeros()
            }
        }
    };
}

impl_trait!(u8, u16, u32, u64, u128, usize);

/// A fixed-size bitset backed by a single integral type.
///
/// This is a lightweight alternative to [`DenseBitSet`] for small domains where the maximum
/// number of elements fits within a single primitive integer. The entire bitset occupies only
/// the space of the underlying integral type (e.g., 4 bytes for `u32`, 8 bytes for `u64`).
///
/// # Type Parameters
///
/// - `I`: The index type used to access elements (must implement [`Id`]).
/// - `T`: The underlying integral storage type (defaults to `u32`).
///
/// # Domain Size
///
/// Unlike [`DenseBitSet`], this type does not track domain size at runtime. The `domain_size`
/// parameter in constructors is only used for compile-time assertions. Operations that would
/// access bits beyond the integral's capacity will either panic (via assertions) or be
/// well-defined (bits beyond capacity are implicitly zero).
///
/// # Example
///
/// ```ignore
/// use hashql_core::id::bit_vec::FiniteBitSet;
///
/// let mut set: FiniteBitSet<MyId, u8> = FiniteBitSet::new_empty(8);
/// set.insert(MyId::from_usize(0));
/// set.insert(MyId::from_usize(5));
/// assert!(set.contains(MyId::from_usize(0)));
/// assert!(!set.contains(MyId::from_usize(1)));
/// assert_eq!(set.len(), 2);
/// ```
///
/// [`DenseBitSet`]: super::DenseBitSet
pub struct FiniteBitSet<I, T: FiniteBitSetIntegral = u32> {
    store: T,
    _marker: PhantomData<fn() -> I>,
}

impl<I, T: FiniteBitSetIntegral> FiniteBitSet<I, T> {
    /// Creates a new bitset with all bits unset.
    ///
    /// # Panics
    ///
    /// Panics if `domain_size` exceeds the capacity of the underlying integral type.
    #[inline]
    #[must_use]
    pub const fn new_empty(domain_size: u32) -> Self {
        assert!(domain_size <= T::MAX_DOMAIN_SIZE);

        Self {
            store: T::EMPTY,
            _marker: PhantomData,
        }
    }

    /// Returns the underlying integral storage.
    #[inline]
    #[must_use]
    pub const fn into_inner(self) -> T {
        self.store
    }

    /// Returns `true` if no bits are set.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.store == T::EMPTY
    }

    /// Returns the number of set bits.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.store.count_ones() as usize
    }

    /// Clears all bits.
    #[inline]
    pub const fn clear(&mut self) {
        self.store = T::EMPTY;
    }
}

impl<I: Id, T: FiniteBitSetIntegral> FiniteBitSet<I, T> {
    /// Sets the bit at `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds for the underlying integral type.
    #[inline]
    pub fn insert(&mut self, index: I) {
        assert!(index.as_u32() < T::MAX_DOMAIN_SIZE);

        self.store |= T::ONE << T::from_id(index);
    }

    /// Sets all bits in the given range.
    ///
    /// Both inclusive and exclusive range bounds are supported.
    ///
    /// # Panics
    ///
    /// Panics if the range end exceeds the capacity of the underlying integral type.
    #[inline]
    pub fn insert_range(&mut self, bounds: impl RangeBounds<I>) {
        let Some((start, end)) = inclusive_start_end(bounds, T::MAX_DOMAIN_SIZE as usize) else {
            return;
        };

        // Create a mask with bits [start..=end] set using intersection of two masks.
        // This avoids overflow issues when the range spans all bits.
        let high_mask = !T::ZERO << T::from_usize(start);
        let low_mask = !T::ZERO >> T::from_u32(T::MAX_DOMAIN_SIZE - 1 - end as u32);

        self.store |= high_mask & low_mask;
    }

    /// Clears the bit at `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds for the underlying integral type.
    #[inline]
    pub fn remove(&mut self, index: I) {
        assert!(index.as_u32() < T::MAX_DOMAIN_SIZE);

        self.store &= !(T::ONE << T::from_id(index));
    }

    /// Sets or clears the bit at `index` depending on `value`.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds for the underlying integral type.
    #[inline]
    pub fn set(&mut self, index: I, value: bool) {
        if value {
            self.insert(index);
        } else {
            self.remove(index);
        }
    }

    /// Returns `true` if the bit at `index` is set.
    ///
    /// Returns `false` if `index` is out of bounds (rather than panicking).
    #[inline]
    #[must_use]
    pub fn contains(&self, index: I) -> bool {
        if index.as_u32() >= T::MAX_DOMAIN_SIZE {
            false
        } else {
            self.store & (T::ONE << T::from_id(index)) != T::EMPTY
        }
    }

    /// Returns an iterator over the indices of set bits.
    #[inline]
    pub fn iter(&self) -> FiniteBitIter<I, T> {
        FiniteBitIter {
            remaining: self.store,
            _marker: PhantomData,
        }
    }
}

impl<I, T: FiniteBitSetIntegral> Copy for FiniteBitSet<I, T> {}
impl<I, T: FiniteBitSetIntegral> Clone for FiniteBitSet<I, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<I, T: FiniteBitSetIntegral> PartialEq for FiniteBitSet<I, T> {
    fn eq(&self, other: &Self) -> bool {
        self.store == other.store
    }
}

impl<I, T: FiniteBitSetIntegral> Eq for FiniteBitSet<I, T> {}

impl<I, T: FiniteBitSetIntegral> Hash for FiniteBitSet<I, T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.store.hash(state);
    }
}

impl<I: Id, T: FiniteBitSetIntegral> Debug for FiniteBitSet<I, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:032b}", self.store)
    }
}

impl<I: Id, T: FiniteBitSetIntegral> IntoIterator for &FiniteBitSet<I, T> {
    type IntoIter = FiniteBitIter<I, T>;
    type Item = I;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<I: Id, T: FiniteBitSetIntegral> BitRelations<Self> for FiniteBitSet<I, T> {
    fn union(&mut self, other: &Self) -> bool {
        let prev = self.store;
        self.store |= other.store;
        prev != self.store
    }

    fn subtract(&mut self, other: &Self) -> bool {
        let prev = self.store;
        self.store &= !other.store;
        prev != self.store
    }

    fn intersect(&mut self, other: &Self) -> bool {
        let prev = self.store;
        self.store &= other.store;
        prev != self.store
    }
}

/// Iterator over the set bits in a [`FiniteBitSet`].
///
/// Yields indices in ascending order.
#[derive(Debug, Clone)]
pub struct FiniteBitIter<I, T: FiniteBitSetIntegral> {
    remaining: T,
    _marker: PhantomData<fn() -> I>,
}

impl<I: Id, T: FiniteBitSetIntegral> Iterator for FiniteBitIter<I, T> {
    type Item = I;

    fn next(&mut self) -> Option<I> {
        if self.remaining == T::EMPTY {
            return None;
        }

        let bit_pos = self.remaining.trailing_zeros();
        // Clear the lowest set bit
        self.remaining &= self.remaining - T::ONE;

        Some(I::from_u32(bit_pos))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let count = self.remaining.count_ones() as usize;
        (count, Some(count))
    }
}

impl<I: Id, T: FiniteBitSetIntegral> ExactSizeIterator for FiniteBitIter<I, T> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::newtype;

    newtype!(struct TestId(u32 is 0..=127));

    #[test]
    fn new_empty_creates_empty_set() {
        let set: FiniteBitSet<TestId, u32> = FiniteBitSet::new_empty(32);
        assert!(set.is_empty());
        assert_eq!(set.len(), 0);
        assert_eq!(set.into_inner(), 0);
    }

    #[test]
    fn insert_and_contains() {
        let mut set: FiniteBitSet<TestId, u32> = FiniteBitSet::new_empty(32);

        set.insert(TestId::from_usize(0));
        set.insert(TestId::from_usize(5));
        set.insert(TestId::from_usize(31));

        assert!(set.contains(TestId::from_usize(0)));
        assert!(!set.contains(TestId::from_usize(1)));
        assert!(set.contains(TestId::from_usize(5)));
        assert!(set.contains(TestId::from_usize(31)));
        assert_eq!(set.len(), 3);
    }

    #[test]
    fn remove() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));

        set.remove(TestId::from_usize(0));
        set.remove(TestId::from_usize(7));

        assert!(!set.contains(TestId::from_usize(0)));
        assert!(set.contains(TestId::from_usize(1)));
        assert!(!set.contains(TestId::from_usize(7)));
        assert_eq!(set.len(), 6);
    }

    #[test]
    fn set_true_and_false() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        set.set(TestId::from_usize(3), true);
        assert!(set.contains(TestId::from_usize(3)));

        set.set(TestId::from_usize(3), false);
        assert!(!set.contains(TestId::from_usize(3)));
    }

    #[test]
    fn insert_range_basic() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        set.insert_range(TestId::from_usize(2)..TestId::from_usize(5));

        assert!(!set.contains(TestId::from_usize(0)));
        assert!(!set.contains(TestId::from_usize(1)));
        assert!(set.contains(TestId::from_usize(2)));
        assert!(set.contains(TestId::from_usize(3)));
        assert!(set.contains(TestId::from_usize(4)));
        assert!(!set.contains(TestId::from_usize(5)));
        assert_eq!(set.len(), 3);
    }

    #[test]
    fn insert_range_inclusive() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        set.insert_range(TestId::from_usize(2)..=TestId::from_usize(5));

        assert!(set.contains(TestId::from_usize(2)));
        assert!(set.contains(TestId::from_usize(5)));
        assert_eq!(set.len(), 4);
    }

    #[test]
    fn insert_range_full() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        set.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));

        assert_eq!(set.len(), 8);
        assert_eq!(set.into_inner(), u8::MAX);
    }

    #[test]
    fn insert_range_empty() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        set.insert_range(TestId::from_usize(5)..TestId::from_usize(5));

        assert!(set.is_empty());
    }

    #[test]
    fn iter_yields_set_bits_in_order() {
        let mut set: FiniteBitSet<TestId, u32> = FiniteBitSet::new_empty(32);

        set.insert(TestId::from_usize(31));
        set.insert(TestId::from_usize(0));
        set.insert(TestId::from_usize(15));
        set.insert(TestId::from_usize(7));

        let indices: Vec<_> = set.iter().map(crate::id::Id::as_usize).collect();
        assert_eq!(indices, vec![0, 7, 15, 31]);
    }

    #[test]
    fn iter_empty_set() {
        let set: FiniteBitSet<TestId, u32> = FiniteBitSet::new_empty(32);
        assert!(set.iter().next().is_none());
    }

    #[test]
    fn iter_exact_size() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set.insert(TestId::from_usize(1));
        set.insert(TestId::from_usize(3));
        set.insert(TestId::from_usize(5));

        let iter = set.iter();
        assert_eq!(iter.len(), 3);
    }

    #[test]
    fn clear() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));
        set.clear();
        assert!(set.is_empty());
    }

    #[test]
    fn contains_out_of_bounds_returns_false() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));
        assert!(!set.contains(TestId::from_usize(100)));
    }

    #[test]
    #[should_panic(expected = "assertion failed")]
    fn insert_out_of_bounds_panics() {
        let mut set: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set.insert(TestId::from_usize(8));
    }

    #[test]
    fn different_integral_types() {
        let mut set8: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        set8.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));
        assert_eq!(set8.len(), 8);

        let mut set16: FiniteBitSet<TestId, u16> = FiniteBitSet::new_empty(16);
        set16.insert_range(TestId::from_usize(0)..=TestId::from_usize(15));
        assert_eq!(set16.len(), 16);

        let mut set64: FiniteBitSet<TestId, u64> = FiniteBitSet::new_empty(64);
        set64.insert_range(TestId::from_usize(0)..=TestId::from_usize(63));
        assert_eq!(set64.len(), 64);

        let mut set128: FiniteBitSet<TestId, u128> = FiniteBitSet::new_empty(128);
        set128.insert_range(TestId::from_usize(0)..=TestId::from_usize(127));
        assert_eq!(set128.len(), 128);
    }

    #[test]
    fn insert_range_edge_cases() {
        // Test various edge cases for insert_range
        for bits in [8_u32, 16, 32, 64] {
            for start in 0..bits.min(8) {
                for end in start..bits.min(16) {
                    let mut set: FiniteBitSet<TestId, u64> = FiniteBitSet::new_empty(64);
                    set.insert_range(TestId::from_u32(start)..=TestId::from_u32(end.min(63)));

                    for i in 0..64 {
                        let expected = i >= start && i <= end.min(63);
                        assert_eq!(
                            set.contains(TestId::from_u32(i)),
                            expected,
                            "bit {i} with range {start}..={}",
                            end.min(63)
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn union_combines_bits() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert(TestId::from_usize(0));
        a.insert(TestId::from_usize(2));

        let mut b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        b.insert(TestId::from_usize(1));
        b.insert(TestId::from_usize(2));

        assert!(a.union(&b));
        assert!(a.contains(TestId::from_usize(0)));
        assert!(a.contains(TestId::from_usize(1)));
        assert!(a.contains(TestId::from_usize(2)));
        assert_eq!(a.len(), 3);

        // Union with same set should return false (no change)
        assert!(!a.union(&b));
    }

    #[test]
    fn union_with_empty() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert(TestId::from_usize(3));

        let b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        assert!(!a.union(&b));
        assert_eq!(a.len(), 1);
    }

    #[test]
    fn subtract_removes_bits() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert_range(TestId::from_usize(0)..=TestId::from_usize(4));

        let mut b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        b.insert(TestId::from_usize(1));
        b.insert(TestId::from_usize(3));

        assert!(a.subtract(&b));
        assert!(a.contains(TestId::from_usize(0)));
        assert!(!a.contains(TestId::from_usize(1)));
        assert!(a.contains(TestId::from_usize(2)));
        assert!(!a.contains(TestId::from_usize(3)));
        assert!(a.contains(TestId::from_usize(4)));
        assert_eq!(a.len(), 3);

        // Subtract again should return false (no change)
        assert!(!a.subtract(&b));
    }

    #[test]
    fn subtract_disjoint_sets() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert_range(TestId::from_usize(0)..=TestId::from_usize(3));

        let mut b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        b.insert_range(TestId::from_usize(4)..=TestId::from_usize(7));

        assert!(!a.subtract(&b));
        assert_eq!(a.len(), 4);
    }

    #[test]
    fn intersect_keeps_common_bits() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert_range(TestId::from_usize(0)..=TestId::from_usize(4));

        let mut b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        b.insert_range(TestId::from_usize(2)..=TestId::from_usize(6));

        assert!(a.intersect(&b));
        assert!(!a.contains(TestId::from_usize(0)));
        assert!(!a.contains(TestId::from_usize(1)));
        assert!(a.contains(TestId::from_usize(2)));
        assert!(a.contains(TestId::from_usize(3)));
        assert!(a.contains(TestId::from_usize(4)));
        assert!(!a.contains(TestId::from_usize(5)));
        assert_eq!(a.len(), 3);

        // Intersect with same set should return false (no change)
        let a_copy = a;
        assert!(!a.intersect(&a_copy));
    }

    #[test]
    fn intersect_disjoint_sets() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert_range(TestId::from_usize(0)..=TestId::from_usize(3));

        let mut b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        b.insert_range(TestId::from_usize(4)..=TestId::from_usize(7));

        assert!(a.intersect(&b));
        assert!(a.is_empty());
    }

    #[test]
    fn intersect_with_empty() {
        let mut a: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);
        a.insert_range(TestId::from_usize(0)..=TestId::from_usize(7));

        let b: FiniteBitSet<TestId, u8> = FiniteBitSet::new_empty(8);

        assert!(a.intersect(&b));
        assert!(a.is_empty());
    }
}
