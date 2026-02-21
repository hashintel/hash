use core::{
    fmt,
    mem::{self, MaybeUninit},
};

use hashql_core::id::{self, Id as _, IdArray, bit_vec::FiniteBitSet};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TargetId {
    Interpreter,
    Postgres,
    Embedding,
}

impl TargetId {
    pub const VARIANT_COUNT: usize = mem::variant_count::<Self>();
    pub const VARIANT_COUNT_U32: u32 = match u32::try_from(Self::VARIANT_COUNT) {
        Ok(count) => count,
        Err(_) => unreachable!(),
    };
    pub const VARIANT_COUNT_U8: u8 = match u8::try_from(Self::VARIANT_COUNT) {
        Ok(count) => count,
        Err(_) => unreachable!(),
    };

    const fn try_from_discriminant(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Interpreter),
            1 => Some(Self::Postgres),
            2 => Some(Self::Embedding),
            _ => None,
        }
    }

    #[inline]
    const fn from_discriminant(value: u8) -> Self {
        match Self::try_from_discriminant(value) {
            Some(target) => target,
            None => unreachable!(),
        }
    }

    #[inline]
    const fn into_discriminant(self) -> u8 {
        self as u8
    }

    #[inline]
    #[must_use]
    pub const fn all() -> [Self; Self::VARIANT_COUNT] {
        #[expect(unsafe_code)]
        const VARIANTS: [TargetId; TargetId::VARIANT_COUNT] = {
            let mut array = [MaybeUninit::uninit(); TargetId::VARIANT_COUNT];

            let mut index = 0_u8;
            while index < TargetId::VARIANT_COUNT_U8 {
                array[index as usize].write(TargetId::from_discriminant(index));
                index += 1;
            }

            // SAFETY: All elements have been initialized.
            unsafe { MaybeUninit::array_assume_init(array) }
        };

        VARIANTS
    }

    #[must_use]
    pub const fn abbreviation(self) -> &'static str {
        match self {
            Self::Interpreter => "I",
            Self::Postgres => "P",
            Self::Embedding => "E",
        }
    }
}

const _: () = {
    let mut index = 0_u8;

    while index < TargetId::VARIANT_COUNT_U8 {
        let target = TargetId::from_discriminant(index);
        let roundtrip = target.into_discriminant();

        assert!(roundtrip == index);
        index += 1;
    }
};

#[expect(clippy::cast_possible_truncation, clippy::cast_lossless)]
impl id::Id for TargetId {
    const MAX: Self = Self::from_discriminant((Self::VARIANT_COUNT - 1) as u8);
    const MIN: Self = Self::from_discriminant(0);

    fn from_u32(index: u32) -> Self {
        assert!(
            index < (Self::VARIANT_COUNT as u32),
            "ID must be between 0 and {}",
            Self::VARIANT_COUNT - 1
        );

        Self::from_discriminant(index as u8)
    }

    fn from_u64(index: u64) -> Self {
        assert!(
            index < (Self::VARIANT_COUNT as u64),
            "ID must be between 0 and {}",
            Self::VARIANT_COUNT - 1
        );

        Self::from_discriminant(index as u8)
    }

    fn from_usize(index: usize) -> Self {
        assert!(
            index < Self::VARIANT_COUNT,
            "ID must be between 0 and {}",
            Self::VARIANT_COUNT - 1
        );

        Self::from_discriminant(index as u8)
    }

    #[inline]
    fn as_u32(self) -> u32 {
        self.into_discriminant() as u32
    }

    #[inline]
    fn as_u64(self) -> u64 {
        self.into_discriminant() as u64
    }

    #[inline]
    fn as_usize(self) -> usize {
        self.into_discriminant() as usize
    }

    #[inline]
    fn prev(self) -> Option<Self> {
        let discriminant = self.into_discriminant();
        let prev = discriminant.checked_sub(1)?;
        Self::try_from_discriminant(prev)
    }
}

impl TryFrom<u32> for TargetId {
    type Error = id::IdError;

    #[inline]
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        u8::try_from(value)
            .ok()
            .and_then(Self::try_from_discriminant)
            .ok_or_else(|| id::IdError::OutOfRange {
                value: u64::from(value),
                min: 0,
                max: Self::MAX.as_u64(),
            })
    }
}

impl TryFrom<u64> for TargetId {
    type Error = id::IdError;

    #[inline]
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        u8::try_from(value)
            .ok()
            .and_then(Self::try_from_discriminant)
            .ok_or_else(|| id::IdError::OutOfRange {
                value,
                min: 0,
                max: Self::MAX.as_u64(),
            })
    }
}

impl TryFrom<usize> for TargetId {
    type Error = id::IdError;

    fn try_from(value: usize) -> Result<Self, Self::Error> {
        u8::try_from(value)
            .ok()
            .and_then(Self::try_from_discriminant)
            .ok_or_else(|| id::IdError::OutOfRange {
                value: value as u64,
                min: 0,
                max: Self::MAX.as_u64(),
            })
    }
}

impl id::HasId for TargetId {
    type Id = Self;

    fn id(&self) -> Self::Id {
        *self
    }
}

impl fmt::Display for TargetId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Interpreter => fmt.write_str("interpreter"),
            Self::Embedding => fmt.write_str("embedding"),
            Self::Postgres => fmt.write_str("postgres"),
        }
    }
}

pub(crate) type TargetBitSet = FiniteBitSet<TargetId, u8>;
pub(crate) type TargetArray<T> = IdArray<TargetId, T, { TargetId::VARIANT_COUNT }>;
