//! Pinned identity and flags of a `.salt` container.
//!
//! The magic and version are single-variant enums, so [`zerocopy::TryFromBytes`]
//! rejects a wrong magic or an unsupported version at the byte level: a
//! [`SaltHeader`] value cannot exist for a file this module does not speak.
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

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

/// The `SALT` magic. Byte-level construction admits no other value.
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

impl SaltMagic {
    /// The only value.
    pub(crate) const MAGIC: Self = Self(SaltMagicInner::Magic);
}

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

/// A layout version this module implements. Byte-level construction admits
/// no other value.
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

impl SaltVersion {
    /// Layout version 1.
    pub(crate) const V1: Self = Self(SaltVersionInner::V1);
}

/// A container flag. The discriminant is the flag's bit position.
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
    /// The container is sealed and immutable.
    Sealed = 0,
}

impl SaltFlag {
    /// The mask of every defined flag bit.
    pub(crate) const ALL: u32 = {
        let mut all = 0;
        let mut index = 0;

        while index < mem::variant_count::<Self>() {
            all |= Self::VARIANTS[index].position();
            index += 1;
        }

        all
    };
    /// Every flag, in discriminant order.
    pub(crate) const VARIANTS: [Self; mem::variant_count::<Self>()] =
        core::array::from_fn(const |index| {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "variant_count is tiny; the cast is the discriminant encoding itself"
            )]
            // SAFETY: discriminants are the sequence 0..variant_count, so
            // every index in the array is a valid discriminant.
            unsafe {
                core::mem::transmute::<u32, Self>(index as u32)
            }
        });

    /// Returns the flag's bit within [`SaltFlags`].
    pub(crate) const fn position(self) -> u32 {
        1 << self as u32
    }
}

// Flag validity is a semantic rule, not a byte-level one: undefined bits are
// representable here so readers can decide between rejecting them (this
// version) and carrying them (a future one). `unknown` is the hook for that
// decision; nothing constructs a flags value with undefined bits through the
// typed operations below.
/// The container flag set.
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
#[repr(transparent)]
pub(crate) struct SaltFlags(U32<LE>);

impl SaltFlags {
    /// Creates an empty flag set.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self(U32::new(0))
    }

    /// Iterates over the set flags.
    pub(crate) fn iter(self) -> impl Iterator<Item = SaltFlag> {
        SaltFlag::VARIANTS
            .into_iter()
            .filter(move |flag| self.contains(*flag))
    }

    /// Returns whether the flag is set.
    #[must_use]
    pub(crate) const fn contains(self, flag: SaltFlag) -> bool {
        self.0.get() & flag.position() != 0
    }

    /// Sets the flag.
    pub(crate) fn insert(&mut self, flag: SaltFlag) {
        self.0.set(self.0.get() | flag.position());
    }

    /// Clears the flag.
    pub(crate) fn remove(&mut self, flag: SaltFlag) {
        self.0.set(self.0.get() & !flag.position());
    }

    /// Returns the set bits that no defined flag names.
    ///
    /// Readers of layout version 1 reject a container whose preamble
    /// carries unknown flag bits.
    #[must_use]
    pub(crate) const fn unknown(self) -> u32 {
        self.0.get() & !SaltFlag::ALL
    }
}

/// The pinned identity prefix of a `.salt` preamble.
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
