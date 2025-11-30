use core::{
    error::Error,
    fmt,
    num::{NonZero, TryFromIntError},
};

use hashql_core::value::{Integer, Primitive};

// Unlike rust we cannot differentiate between signed and unsigned integers, therefore all values
// are signed.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Int {
    size: NonZero<u8>,

    value: i128,
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]
impl Int {
    const fn from_value_unchecked(size: NonZero<u8>, value: i128) -> Self {
        Self { size, value }
    }

    #[inline]
    const fn bits(&self) -> u64 {
        (self.size.get() * 8) as u64
    }

    #[inline]
    const fn truncate(&self) -> i128 {
        self.value & ((1 << self.bits()) - 1)
    }

    #[inline]
    #[must_use]
    pub const fn as_bool(self) -> Option<bool> {
        if let Some(value) = self.as_i8() {
            Some(value != 0)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_i8(self) -> Option<i8> {
        if self.size.get() == 1 {
            Some(self.truncate() as i8)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_u8(self) -> Option<u8> {
        if self.size.get() == 1 && self.value >= 0 {
            Some(self.truncate() as u8)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_i16(self) -> Option<i16> {
        if self.size.get() == 2 {
            Some(self.truncate() as i16)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_u16(self) -> Option<u16> {
        if self.size.get() == 2 && self.value >= 0 {
            Some(self.truncate() as u16)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_i32(self) -> Option<i32> {
        if self.size.get() == 4 {
            Some(self.truncate() as i32)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_u32(self) -> Option<u32> {
        if self.size.get() == 4 && self.value >= 0 {
            Some(self.truncate() as u32)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_i64(self) -> Option<i64> {
        if self.size.get() == 8 {
            Some(self.truncate() as i64)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_u64(self) -> Option<u64> {
        if self.size.get() == 8 && self.value >= 0 {
            Some(self.truncate() as u64)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_i128(self) -> Option<i128> {
        if self.size.get() == 16 {
            Some(self.value)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_u128(self) -> Option<u128> {
        if self.size.get() == 16 && self.value >= 0 {
            Some(self.value as u128)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_isize(self) -> Option<isize> {
        const BYTES: u8 = size_of::<isize>() as u8;

        if self.size.get() == BYTES {
            Some(self.truncate() as isize)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> Option<usize> {
        const BYTES: u8 = size_of::<usize>() as u8;

        if self.size.get() == BYTES && self.value >= 0 {
            Some(self.truncate() as usize)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_int(self) -> i128 {
        self.truncate()
    }

    #[inline]
    #[must_use]
    pub const fn as_uint(self) -> Option<u128> {
        if self.value >= 0 {
            Some(self.value as u128)
        } else {
            None
        }
    }

    #[inline]
    #[must_use]
    pub const fn as_f32(self) -> f32 {
        self.as_int() as f32
    }

    #[inline]
    #[must_use]
    pub const fn as_f64(self) -> f64 {
        self.as_int() as f64
    }
}

macro_rules! impl_from {
    ($($ty:ty),*) => {
        $(impl_from!(@impl $ty);)*
    };

    (@impl $ty:ty) => {
        #[expect(unsafe_code, clippy::cast_possible_truncation)]
        impl From<$ty> for Int {
            #[inline]
            fn from(value: $ty) -> Self {
                const { assert!(size_of::<$ty>() != 0) }

                // SAFETY: compile time assert ensures that size_of::<$ty>() != 0
                Self::from_value_unchecked(unsafe { NonZero::new_unchecked(size_of::<$ty>() as u8) }, i128::from(value))
            }
        }
    };
}

impl_from!(bool, u8, u16, u32, u64, i8, i16, i32, i64, i128);

#[expect(unsafe_code, clippy::cast_possible_truncation)]
impl TryFrom<u128> for Int {
    type Error = TryFromIntError;

    #[inline]
    fn try_from(value: u128) -> Result<Self, Self::Error> {
        // SAFETY: 16 != 0
        Ok(Self::from_value_unchecked(
            unsafe { NonZero::new_unchecked(size_of::<u128>() as u8) },
            i128::try_from(value)?,
        ))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TryFromIntegerError(());

impl fmt::Display for TryFromIntegerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("integer value is out of range")
    }
}

impl Error for TryFromIntegerError {}

impl TryFrom<Integer<'_>> for Int {
    type Error = TryFromIntegerError;

    #[inline]
    fn try_from(value: Integer<'_>) -> Result<Self, Self::Error> {
        value
            .as_i128()
            .map(From::from)
            .ok_or(TryFromIntegerError(()))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum TryFromPrimitiveErrorKind {
    OutOfRange,
    InvalidType,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TryFromPrimitiveError<'heap> {
    kind: TryFromPrimitiveErrorKind,
    pub value: Primitive<'heap>,
}

impl fmt::Display for TryFromPrimitiveError<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.kind {
            TryFromPrimitiveErrorKind::OutOfRange => f.write_str("integer value is out of range"),
            TryFromPrimitiveErrorKind::InvalidType => f.write_str("invalid type"),
        }
    }
}

impl Error for TryFromPrimitiveError<'_> {}

impl<'heap> TryFrom<Primitive<'heap>> for Int {
    type Error = TryFromPrimitiveError<'heap>;

    fn try_from(value: Primitive<'heap>) -> Result<Self, Self::Error> {
        match value {
            Primitive::Boolean(bool) => Ok(bool.into()),
            Primitive::Integer(integer) => {
                integer.try_into().map_err(|_err| TryFromPrimitiveError {
                    kind: TryFromPrimitiveErrorKind::OutOfRange,
                    value,
                })
            }
            Primitive::Float(_) | Primitive::Null | Primitive::String(_) => {
                Err(TryFromPrimitiveError {
                    kind: TryFromPrimitiveErrorKind::InvalidType,
                    value,
                })
            }
        }
    }
}
