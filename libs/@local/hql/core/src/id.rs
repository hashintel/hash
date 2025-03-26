use core::{
    fmt,
    fmt::{Debug, Display},
    hash::Hash,
};

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
    OutOfRange { value: u64, min: u32, max: u32 },
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

    /// Returns the next ID in sequence, if it exists.
    ///
    /// Returns `None` if this ID is already at the maximum value.
    fn next(self) -> Option<Self>;

    /// Returns the previous ID in sequence, if it exists.
    ///
    /// Returns `None` if this ID is already at the minimum value.
    fn prev(self) -> Option<Self>;
}

/// Creates a new ID type with a specified valid range.
///
/// This uses the experimental pattern type syntax to define the minimum and maximum values.
///
/// # Syntax
/// ```
/// hql_core::id::newtype!(pub struct NodeId(u32 is 0..=0xFFFF_FF00));
/// ```
///
/// This creates a newtype wrapper around [`u32`] with the Id trait fully implemented.
#[macro_export]
macro_rules! newtype {
    (@internal in_bounds; $value:ident, $type:ty, $min:literal, $max:literal) => {
        $value >= ($min as $type) && $value <= ($max as $type)
    };

    (@internal error; $value:ident, $min:literal, $max:literal) => {
        concat!("ID value must be between ", stringify!($min), " and ", stringify!($max))
    };

    ($vis:vis struct $name:ident(u32 is $min:literal..=$max:literal)) => {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        $vis struct $name(u32);

        impl $name {
            /// Creates a new ID with the given value.
            ///
            /// # Panics
            /// When value is outside the valid range of $min..$max.
            $vis const fn new(value: u32) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value)
            }
        }

        impl $crate::id::Id for $name {
            const MIN: Self = Self($min);
            const MAX: Self = Self($max);

            // fast path that does not go through the default implementation
            fn from_u32(value: u32) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value)
            }

            fn from_u64(value: u64) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as u32)
            }

            fn from_usize(value: usize) -> Self {
                assert!(
                    $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max),
                    $crate::id::newtype!(@internal error; value, $min, $max)
                );

                Self(value as u32)
            }

            fn as_u32(self) -> u32 {
                self.0
            }

            fn as_u64(self) -> u64 {
                self.0 as u64
            }

            fn as_usize(self) -> usize {
                self.0 as usize
            }

            fn next(self) -> Option<Self> {
                if self.0 == $max {
                    None
                } else {
                    Some(Self(self.0 + 1))
                }
            }

            fn prev(self) -> Option<Self> {
                if self.0 == $min {
                    None
                } else {
                    Some(Self(self.0 - 1))
                }
            }
        }

        impl ::core::fmt::Display for $name {
            fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                core::fmt::Display::fmt(&self.0, fmt)
            }
        }

        impl ::core::convert::TryFrom<u32> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u32) -> Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u32, $min, $max) {
                    Ok(Self(value))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: value as u64,
                        min: $min,
                        max: $max,
                    })
                }
            }
        }

        impl ::core::convert::TryFrom<u64> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: u64) -> Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, u64, $min, $max) {
                    Ok(Self(value as u32))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value,
                        min: $min,
                        max: $max,
                    })
                }
            }
        }

        impl ::core::convert::TryFrom<usize> for $name {
            type Error = $crate::id::IdError;

            fn try_from(value: usize) -> Result<Self, Self::Error> {
                if $crate::id::newtype!(@internal in_bounds; value, usize, $min, $max) {
                    Ok(Self(value as u32))
                } else {
                    Err($crate::id::IdError::OutOfRange {
                        value: value as u64,
                        min: $min,
                        max: $max,
                    })
                }
            }
        }
    };
}

// TODO: we might want a macro that also defines type aliases to e.g. `HashMap` and such

pub use newtype;
