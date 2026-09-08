//! Z-order keys: two 32-bit axes interleaved into one sortable `u64`.
//!
//! The module is crate-internal, with one deliberate seam: the `bench` facade re-exports
//! [`Depth`], [`MortonKey`], and [`MortonCell`] so the benchmark targets speak the same typed
//! vocabulary as production instead of raw integers. The items are therefore `pub` while the
//! module is not, and they reach a consumer only through that feature-gated door. Examples carry
//! `ignore` and spell each call as an in-crate caller writes it.
//!
//! [`MortonKey::new`] interleaves the bits of an `(x, y)` pair, `x` into the even bits and `y` into
//! the odd bits, so that comparing keys compares positions along the Z-order curve. Every
//! axis-aligned power-of-two cell of the grid is one contiguous key range, so a sorted key array
//! answers cell queries with two binary searches.
//!
//! [`Depth`] counts subdivisions. Depth 0 is the whole domain, each step quarters a cell, and depth
//! 32 pins both axes to a single key. A tile address `(z, x, y)` names the cell
//! [`MortonCell::new(z, x, y)`](MortonCell::new); the cell containing an existing key is
//! [`MortonKey::cell`]. Cells subdivide in key order via [`MortonCell::children`].

#![cfg_attr(
    not(feature = "bench"),
    expect(
        unreachable_pub,
        reason = "the key types are `pub` for the bench facade's re-export; without the feature \
                  the facade does not exist and they are crate-only"
    )
)]

use core::{fmt, iter::Step};

use hashql_core::id::Id as _;

use crate::math::Log2;

#[cfg(test)]
mod tests;

hashql_core::id::newtype! {
    /// A subdivision depth between the whole domain and a single key.
    ///
    /// Depth `d` cells are the squares of a `2^d x 2^d` grid over the axis domain. [`Depth::MIN`] is
    /// the whole domain; [`Depth::MAX`] fixes all 32 bits of both axes, so a cell at it holds exactly
    /// one key.
    #[id(unaligned, const, derive(Step))]
    pub struct Depth(u8 is 0..=32)
}

impl Depth {
    #[inline]
    pub const fn try_new(depth: u8) -> Option<Self> {
        if depth > Self::MAX.get() {
            return None;
        }

        Some(Self::new(depth))
    }

    pub const fn ceiling(self) -> Zoom {
        Zoom(Self::MAX.get() - self.get())
    }

    pub const fn zoom(self, span: Log2) -> Zoom {
        Zoom(self.get().saturating_sub(span.get()))
    }

    /// Adds `steps` subdivisions, saturating at [`Depth::MAX`].
    ///
    /// The domain is capped, so the sum clamps instead of overflowing: the same contract as
    /// [`u8::saturating_add`], with the ceiling at the key width rather than the type width.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let depth = Depth::new(30).unwrap();
    /// assert_eq!(depth.saturating_add(1).get(), 31);
    /// assert_eq!(depth.saturating_add(9), Depth::MAX);
    /// ```
    #[inline]
    #[must_use]
    pub const fn saturating_add(self, steps: u8) -> Self {
        let sum = self.get().saturating_add(steps);
        Self::try_new(sum).unwrap_or(Self::MAX)
    }

    pub const fn checked_add(self, steps: u8) -> Option<Self> {
        let sum = self.get().checked_add(steps)?;
        Self::try_new(sum)
    }

    /// Iterates every depth, [`Depth::MIN`] through [`Depth::MAX`].
    #[inline]
    pub fn all() -> impl DoubleEndedIterator<Item = Self> {
        Self::MIN..=Self::MAX
    }
}

/// A tile zoom level within the key width.
///
/// Zoom `z` addresses the tiles of the `2^z x 2^z` grid, the cells of [`Depth`] `z`. A distinct
/// type from [`Depth`] keeps a tile's level and a key's subdivision depth out of each other's
/// arithmetic.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes, // TODO: needs a manual impl?
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct Zoom(u8);

impl Zoom {
    /// The maximum zoom level, [`Depth::MAX`].
    pub const MAX: Self = Self(Depth::MAX.get());
    /// The minimum zoom level, [`Depth::MIN`].
    pub const MIN: Self = Self(0);

    /// Validates a tile zoom level.
    ///
    /// Returns [`None`] above [`Depth::MAX`], the deepest grid a key addresses.
    pub(crate) const fn new(zoom: u8) -> Option<Self> {
        if zoom > Depth::MAX.get() {
            return None;
        }

        Some(Self(zoom))
    }

    pub(crate) const fn depth(self, span: Log2) -> Option<Depth> {
        Depth::new(self.get()).checked_add(span.get())
    }

    pub(crate) const fn saturating_depth(self, span: Log2) -> Depth {
        Depth::new(self.get()).saturating_add(span.get())
    }

    /// Returns the level.
    pub(crate) const fn get(self) -> u8 {
        self.0
    }
}

impl fmt::Display for Zoom {
    /// Formats as the plain level.
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Step for Zoom {
    fn steps_between(start: &Self, end: &Self) -> (usize, Option<usize>) {
        u8::steps_between(&start.0, &end.0)
    }

    fn forward_checked(start: Self, count: usize) -> Option<Self> {
        u8::forward_checked(start.0, count).and_then(Self::new)
    }

    fn forward_overflowing(start: Self, count: usize) -> (Self, bool) {
        match Self::forward_checked(start, count) {
            Some(zoom) => (zoom, false),
            None => {
                // Stepping past `MAX` wraps into the domain as if the levels
                // formed a cycle of `MAX + 1` values, mirroring the primitive
                // integers' overflow semantics on this bounded range.
                let span = usize::from(Self::MAX.0) + 1;
                let wrapped = (usize::from(start.0) + count % span) % span;
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "the wrapped value is below `span`, which fits u8"
                )]
                (Self(wrapped as u8), true)
            }
        }
    }

    fn backward_checked(start: Self, count: usize) -> Option<Self> {
        // Any value below `start` is a valid zoom, so underflow of the inner
        // `u8` is the only failure mode.
        u8::backward_checked(start.0, count).map(Self)
    }

    fn backward_overflowing(start: Self, count: usize) -> (Self, bool) {
        match Self::backward_checked(start, count) {
            Some(zoom) => (zoom, false),
            None => {
                // Stepping below `MIN` wraps around the same `MAX + 1` cycle
                // as the forward direction.
                let span = usize::from(Self::MAX.0) + 1;
                let wrapped = (usize::from(start.0) + span - count % span) % span;
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "the wrapped value is below `span`, which fits u8"
                )]
                (Self(wrapped as u8), true)
            }
        }
    }
}

impl serde::Serialize for Zoom {
    /// Serializes as the plain level.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(self.0)
    }
}

impl<'de> serde::Deserialize<'de> for Zoom {
    /// Deserializes a plain level, refusing values above [`Depth::MAX`].
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = u8::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| {
            serde::de::Error::invalid_value(
                serde::de::Unexpected::Unsigned(u64::from(value)),
                &"a zoom level within the key width",
            )
        })
    }
}

/// A Z-order key interleaving two 32-bit axes into one `u64`.
///
/// `x` occupies the even bits and `y` the odd bits, starting at bit 0, so key order is Z-order
/// curve order and every [`MortonCell`] is one contiguous key range. Every bit pattern is a valid
/// key.
///
/// # Examples
///
/// ```ignore
/// assert_eq!(MortonKey::new(1, 0).to_bits(), 0b01);
/// assert_eq!(MortonKey::new(0, 1).to_bits(), 0b10);
/// assert_eq!(MortonKey::new(3, 5).coordinates(), [3, 5]);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct MortonKey(u64);

impl MortonKey {
    /// Interleaves the bits of the two axes.
    #[inline]
    #[must_use]
    pub const fn new(x: u32, y: u32) -> Self {
        Self(spread_bits(x) | (spread_bits(y) << 1))
    }

    /// Restores a key from its interleaved bits.
    #[inline]
    #[must_use]
    pub const fn from_bits(bits: u64) -> Self {
        Self(bits)
    }

    /// Returns the interleaved bits.
    #[inline]
    #[must_use]
    pub const fn to_bits(self) -> u64 {
        self.0
    }

    /// Deinterleaves the axes as `[x, y]`.
    #[inline]
    #[must_use]
    pub const fn coordinates(self) -> [u32; 2] {
        [compact_bits(self.0), compact_bits(self.0 >> 1)]
    }

    /// Returns the cell index at `depth`.
    ///
    /// The leading `2 · depth` key bits, a value below `4^depth` that is dense over the depth's
    /// grid.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let key = MortonKey::new(0b10 << 30, 0b11 << 30);
    /// assert_eq!(key.prefix(Depth::new(2).unwrap()), 0b1110);
    /// ```
    #[inline]
    #[must_use]
    pub const fn prefix(self, depth: Depth) -> u64 {
        match depth.get() {
            0 => 0,
            depth => self.0 >> (64 - 2 * (depth as u32)),
        }
    }

    /// Returns the deepest depth at which this key and `other` share a cell.
    ///
    /// A depth-`d` cell is the leading `2 · d` key bits, so the shared depth counts the agreed
    /// leading bit pairs. Equal keys share every grid and return [`Depth::MAX`].
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let key = MortonKey::new(0, 0);
    /// assert_eq!(key.shared_depth(key), Depth::MAX);
    /// assert_eq!(key.shared_depth(MortonKey::new(0, 1 << 31)).get(), 0);
    /// ```
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "a cell index is two key bits, so the shared depth is the agreed bit count halved"
    )]
    #[inline]
    #[must_use]
    pub const fn shared_depth(self, other: Self) -> Depth {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "half of at most 64 leading zeros fits u8"
        )]
        let agreed = ((self.0 ^ other.0).leading_zeros() / 2) as u8;

        // At most 64 agreed bits halve to 32, which is `Depth::MAX` itself.
        Depth::new(agreed)
    }

    /// Returns the cell containing this key at `depth`.
    #[inline]
    #[must_use]
    #[cfg(any(test, feature = "bench"))]
    pub const fn cell(self, depth: Depth) -> MortonCell {
        MortonCell {
            min: self.0 & !low_mask(depth),
            depth,
        }
    }
}

/// One cell of a depth's grid.
///
/// The contiguous key range from [`min_key`](Self::min_key) to [`max_key`](Self::max_key), both
/// inclusive.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MortonCell {
    /// The smallest key in the cell.
    ///
    /// The bits below the prefix are zero.
    min: u64,
    depth: Depth,
}

impl MortonCell {
    /// Wraps the cell at `(x, y)` of the depth's grid.
    ///
    /// The grid spans `2^depth` cells per axis; returns [`None`] when either coordinate lies
    /// outside it.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let depth = Depth::new(3).unwrap();
    /// assert!(MortonCell::new(depth, 7, 0).is_some());
    /// assert_eq!(MortonCell::new(depth, 8, 0), None);
    /// ```
    #[must_use]
    pub const fn new(depth: Depth, x: u32, y: u32) -> Option<Self> {
        let cells = 1_u64 << depth.get();
        if x as u64 >= cells || y as u64 >= cells {
            return None;
        }

        if depth.get() == 0 {
            return Some(Self { min: 0, depth });
        }

        let shift = 32 - depth.get() as u32;
        Some(Self {
            min: MortonKey::new(x << shift, y << shift).to_bits(),
            depth,
        })
    }

    /// Returns the cell's depth.
    #[inline]
    #[must_use]
    pub const fn depth(self) -> Depth {
        self.depth
    }

    /// Returns the smallest key in the cell.
    #[inline]
    #[must_use]
    pub const fn min_key(self) -> MortonKey {
        MortonKey(self.min)
    }

    /// Returns the largest key in the cell.
    #[inline]
    #[must_use]
    pub const fn max_key(self) -> MortonKey {
        MortonKey(self.min | low_mask(self.depth))
    }

    /// Returns whether `key` lies in the cell.
    #[inline]
    #[must_use]
    pub const fn contains(self, key: MortonKey) -> bool {
        (key.0 & !low_mask(self.depth)) == self.min
    }

    /// Returns the four child cells in key order.
    ///
    /// Child `i` holds the keys whose next axis bits are `x = i & 1` and `y = i >> 1`; the
    /// children's ranges partition the parent's in that order. Returns [`None`] at [`Depth::MAX`].
    #[must_use]
    pub const fn children(self) -> Option<[Self; 4]> {
        let depth = Depth::try_new(self.depth.get() + 1)?;

        let step = 1_u64 << (64 - 2 * (depth.get() as u32));
        Some([
            Self {
                min: self.min,
                depth,
            },
            Self {
                min: self.min + step,
                depth,
            },
            Self {
                min: self.min + step * 2,
                depth,
            },
            Self {
                min: self.min + step * 3,
                depth,
            },
        ])
    }
}

/// Returns the key bits a cell at `depth` does not fix: the low `64 - 2 · depth` bits.
const fn low_mask(depth: Depth) -> u64 {
    match depth.get() {
        0 => u64::MAX,
        32 => 0,
        depth => u64::MAX >> (2 * (depth as u32)),
    }
}

/// Spreads the bits of `value` into the even bits of a `u64`.
const fn spread_bits(value: u32) -> u64 {
    let mut value = value as u64;
    value = (value | (value << 16)) & 0x0000_FFFF_0000_FFFF;
    value = (value | (value << 8)) & 0x00FF_00FF_00FF_00FF;
    value = (value | (value << 4)) & 0x0F0F_0F0F_0F0F_0F0F;
    value = (value | (value << 2)) & 0x3333_3333_3333_3333;
    (value | (value << 1)) & 0x5555_5555_5555_5555
}

/// Compacts the even bits of `value` into a `u32`.
const fn compact_bits(value: u64) -> u32 {
    let mut value = value & 0x5555_5555_5555_5555;
    value = (value | (value >> 1)) & 0x3333_3333_3333_3333;
    value = (value | (value >> 2)) & 0x0F0F_0F0F_0F0F_0F0F;
    value = (value | (value >> 4)) & 0x00FF_00FF_00FF_00FF;
    value = (value | (value >> 8)) & 0x0000_FFFF_0000_FFFF;
    ((value | (value >> 16)) & 0x0000_0000_FFFF_FFFF) as u32
}
