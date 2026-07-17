use core::mem;

use zerocopy::{LE, U32};

// not pretty, but allows us to pin a specific version, required for the derive
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u32)]
enum SaltMagicInner {
    Magic = u32::from_le_bytes(*b"SALT"),
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(transparent)]
pub(crate) struct SaltMagic(SaltMagicInner);

// not pretty, but allows us to pin a specific version, required for the derive
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u32)]
enum SaltVersionInner {
    V1 = 1,
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(transparent)]
pub(crate) struct SaltVersion(SaltVersionInner);

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u32)]
pub(crate) enum SaltFlag {
    Sealed = 0,
}

impl SaltFlag {
    const ALL: u32 = {
        let mut all = 0;
        let mut index = 0;

        while index < mem::variant_count::<Self>() {
            all |= Self::VARIANTS[index].position();
            index += 1;
        }

        all
    };
    const VARIANTS: [Self; mem::variant_count::<Self>()] =
        core::array::from_fn(const |index| unsafe {
            core::mem::transmute::<u32, Self>(index as u32)
        });

    const fn position(self) -> u32 {
        1 << self as u32
    }
}

// TODO: not happy to have it be this way, because only some should be able to be set, but idk how
// to enforce that, except with an exhaustive enum which sounds like a horrible idea?
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
pub(crate) struct SaltFlags(U32<LE>);

impl SaltFlags {
    pub fn iter(&self) -> impl Iterator<Item = SaltFlag> + '_ {
        // TODO
        core::iter::empty()
    }

    pub fn contains(&self, flag: SaltFlag) -> bool {
        self.0.get() & (flag as u32) != 0
    }

    pub fn insert(&mut self, flag: SaltFlag) {
        self.0.set(self.0.get() | (flag as u32));
    }

    pub fn remove(&mut self, flag: SaltFlag) {
        self.0.set(self.0.get() & !(flag as u32));
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
pub(crate) struct SaltHeader {
    pub magic: SaltMagic,
    pub version: SaltVersion,
    pub flags: SaltFlags,
}
