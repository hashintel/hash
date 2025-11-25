pub mod bit_vec;
mod index;
mod slice;
mod union_find;
mod vec;

use core::{
    fmt::{self, Debug, Display},
    hash::Hash,
    marker::PhantomData,
    sync::atomic::AtomicU32,
};

use ::core::sync::atomic;

pub use self::{index::IntoSliceIndex, slice::IdSlice, union_find::IdUnionFind, vec::IdVec};

/// Represents errors that can occur when converting values to an [`Id`].
///
/// This error is returned by the `TryFrom` implementations for `Id` types when
/// a value is outside the valid range for the identifier.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IdError {
    /// The provided value is outside the valid range for the identifier.
    ///
    /// Contains the value that was provided, along with the minimum and maximum
    /// allowed values.
    OutOfRange { value: u64, min: u64, max: u64 },
}

impl Display for IdError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OutOfRange { value, min, max } => {
                write!(fmt, "Value {value} is out of range [{min}..={max}]!")
            }
        }
    }
}

/// Common interface for domain-specific identifiers.
///
/// Provides type safety for IDs of different domains (nodes, users, etc.)
/// while maintaining a consistent conversion API.
pub trait Id:
    Copy
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Hash
    + Debug
    + Display
    + TryFrom<u32, Error = IdError>
    + TryFrom<u64, Error = IdError>
    + TryFrom<usize, Error = IdError>
    + 'static
{
    /// The maximum value this ID type can represent.
    const MAX: Self;

    /// The minimum value this ID type can represent.
    const MIN: Self;

    /// Creates an ID from a [`u32`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_u32(index: u32) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Creates an ID from a [`u64`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_u64(index: u64) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Creates an ID from a [`usize`] value.
    ///
    /// # Panics
    ///
    /// Panics if the value is outside the valid range for this ID type.
    /// If you need to handle such cases without panicking, use `try_from` instead.
    #[inline]
    #[must_use]
    fn from_usize(index: usize) -> Self {
        Self::try_from(index).expect("Cannot create ID: value outside valid range")
    }

    /// Converts this ID to a [`u32`] value.
    fn as_u32(self) -> u32;

    /// Converts this ID to a [`u64`] value.
    fn as_u64(self) -> u64;

    /// Converts this ID to a [`usize`] value.
    fn as_usize(self) -> usize;

    /// Adds the given amount to this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    #[must_use = "Use `increment_by` to modify the id in place"]
    fn plus(self, amount: usize) -> Self {
        Self::from_usize(self.as_usize() + amount)
    }

    /// Mutably adds the given amount to this ID.
    ///
    /// # Panics
    ///
    /// Panics if the resulting ID is outside the valid range.
    #[inline]
    fn increment_by(&mut self, amount: usize) {
        *self = self.plus(amount);
    }

    /// Returns the previous ID in sequence, if it exists.
    ///
    /// Returns `None` if this ID is already at the minimum value.
    fn prev(self) -> Option<Self>;
}

/// Marker trait for types that have an associated ID.
pub trait HasId {
    type Id: Id;

    fn id(&self) -> Self::Id;
}

impl<T> HasId for &T
where
    T: HasId,
{
    type Id = T::Id;

    fn id(&self) -> Self::Id {
        (**self).id()
    }
}

/// Creates a new ID type with a specified valid range.
///
/// This uses the experimental pattern type syntax to define the minimum and maximum values.
///
/// # Syntax
/// ```
/// hashql_core::id::newtype!(pub struct NodeId(u32 is 0..=0xFFFF_FF00));
/// ```
///
/// This creates a newtype wrapper around [`u32`] with the Id trait fully implemented.
#[macro_export]
macro_rules! newtype {
    (@internal in_bounds; $value:ident, $type:ty, $min:literal, $max:expr) => {
        $value >= ($min as $type) && $value <= ($max as $type)
    };

    (@internal error; $value:ident, $min:literal, $max:expr) => {
        concat!("ID value must be between ", stringify!($min), " and ", stringify!($max))
    };

    ($(#[$attr:meta])* $vis:vis struct $name:ident($type:ident is $min:literal..=$max:expr)) => {
        $(#[$attr])*
        #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        $vis struct $name($type);

        #[expect(clippy::allow_attributes)]
        #[allow(dead_code, clippy::checked_conversions)]
        impl $name {
            /// Creates a new ID with the given value.
            ///
            /// # Panics
            ///
            /// When value is outside the valid range of $min..$max.
            #[must_use]
            $vis const fn new(value: $type) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, $type, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value)
            }
        }

        #[automatically_derived]
        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl $crate::id::Id for $name {
            const MIN: Self = Self($min);
            const MAX: Self = Self($max);

            // fast path that does not go through the default implementation
            fn from_u32(value: u32) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            fn from_u64(value: u64) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            fn from_usize(value: usize) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as $type)
            }

            #[inline]
            fn as_u32(self) -> u32 {
                self.0 as u32
            }

            #[inline]
            fn as_u64(self) -> u64 {
                self.0 as u64
            }

            #[inline]
            fn as_usize(self) -> usize {
                self.0 as usize
            }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                if self.0 == $min {
                    None
                } else {
                    Some(Self(self.0 - 1))
                }
            }
        }

        impl ::core::fmt::Display for $name {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                ::core::fmt::Display::fmt(&self.0, fmt)
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<u32> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u32) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: u64::from(value),
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<u64> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u64) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value,
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl ::core::convert::TryFrom<usize> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: usize) -> ::core::result::Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max) {
                    Ok(Self(value as $type))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: value as u64,
                        min: $min as u64,
                        max: $max as u64,
                    })
                }
            }
        }

        impl $crate::id::HasId for $name {
            type Id = $name;

            fn id(&self) -> Self::Id {
                *self
            }
        }
    };
}

#[derive(Debug)]
pub struct IdProducer<I> {
    next: AtomicU32,
    _marker: PhantomData<fn() -> I>,
}

impl<I> IdProducer<I> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            next: AtomicU32::new(0),
            _marker: PhantomData,
        }
    }

    #[inline]
    pub fn next(&self) -> I
    where
        I: Id,
    {
        // Relaxed ordering is sufficient, as this is the only place where interact with the atomic
        // counter and ordering is of no concern.
        let value = self.next.fetch_add(1, atomic::Ordering::Relaxed);

        I::from_u32(value)
    }
}

impl<I> Default for IdProducer<I> {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct IdCounter<I> {
    next: I,
}

impl<I> IdCounter<I> {
    #[must_use]
    pub const fn new() -> Self
    where
        I: Id,
    {
        Self { next: I::MIN }
    }

    #[must_use]
    pub fn size(&self) -> usize
    where
        I: Id,
    {
        self.next.as_usize()
    }

    #[must_use]
    pub const fn bound(&self) -> I
    where
        I: Id,
    {
        self.next
    }

    #[inline]
    #[expect(
        clippy::should_implement_trait,
        reason = "We return `I` instead of `Option<I>`, while similar we don't want to confuse \
                  users."
    )]
    pub fn next(&mut self) -> I
    where
        I: Id,
    {
        let value = self.next;
        self.next.increment_by(1);

        value
    }
}

impl<I> Default for IdCounter<I>
where
    I: Id,
{
    fn default() -> Self {
        Self::new()
    }
}

#[macro_export]
macro_rules! newtype_producer {
    ($vis:vis struct $name:ident($id:ty)) => {
        $vis type $name = $crate::id::IdProducer<$id>;
    };
}

#[macro_export]
macro_rules! newtype_counter {
    ($vis:vis struct $name:ident($id:ty)) => {
        $vis type $name = $crate::id::IdCounter<$id>;
    };
}

#[macro_export]
macro_rules! newtype_collections {
    ($vis:vis type $name:ident* from $id:ty) => {
        $vis type ${concat($name, Slice)}<T> = $crate::id::IdSlice<$id, T>;
        $vis type ${concat($name, Vec)}<T, A = ::alloc::alloc::Global> = $crate::id::IdVec<$id, T, A>;
        $vis type ${concat($name, UnionFind)}<A = ::alloc::alloc::Global> = $crate::id::IdUnionFind<$id, A>;

        $vis type ${concat($name, Set)}<A = ::alloc::alloc::Global> = $crate::collections::FastHashSet<$id, A>;
        $vis type ${concat($name, SetEntry)}<'set, A = ::alloc::alloc::Global> = $crate::collections::FastHashSetEntry<'set, $id, A>;

        $vis type ${concat($name, Map)}<V, A = ::alloc::alloc::Global> = $crate::collections::FastHashMap<$id, V, A>;
        $vis type ${concat($name, MapEntry)}<'map, V, A = ::alloc::alloc::Global> = $crate::collections::FastHashMapEntry<'map, $id, V, A>;
    };
}

pub use newtype;
pub use newtype_collections;
pub use newtype_counter;
pub use newtype_producer;
