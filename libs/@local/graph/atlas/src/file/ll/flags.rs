//! Entry flag bits.
//!
//! Two orthogonal bits govern how an entry fails. `ValidationRequired`
//! demands eager payload checksum verification at open; without it,
//! verification may be lazy. An entry whose section type is unknown cannot
//! be validated, so `ValidationRequired` on an unknown type reads as *must
//! understand*. `Volatile` selects the failure response - drop the entry
//! rather than reject the container - for both checksum mismatches and
//! unknown types.

use core::mem;

use zerocopy::{LE, U16};

/// An entry flag. The discriminant is the flag's bit position.
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
#[repr(u16)]
pub(crate) enum EntryFlag {
    /// The payload must be validated before the container is used.
    ValidationRequired = 0,
    /// The entry tolerates loss: on validation failure it is dropped
    /// instead of failing the container.
    Volatile = 1,
}

impl EntryFlag {
    /// The mask of every defined flag bit.
    pub(crate) const ALL: u16 = {
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
                core::mem::transmute::<u16, Self>(index as u16)
            }
        });

    /// Returns the flag's bit within [`EntryFlags`].
    pub(crate) const fn position(self) -> u16 {
        1 << self as u16
    }
}

// Flag validity is a semantic rule, not a byte-level one: undefined bits
// are representable here so readers can decide between rejecting them
// (this version) and carrying them (a future one). `unknown` is the hook
// for that decision.
/// The entry flag set.
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
pub(crate) struct EntryFlags(U16<LE>);

impl EntryFlags {
    /// Creates an empty flag set.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self(U16::new(0))
    }

    /// Iterates over the set flags.
    pub(crate) fn iter(self) -> impl Iterator<Item = EntryFlag> {
        EntryFlag::VARIANTS
            .into_iter()
            .filter(move |flag| self.contains(*flag))
    }

    /// Returns whether the flag is set.
    #[must_use]
    pub(crate) const fn contains(self, flag: EntryFlag) -> bool {
        self.0.get() & flag.position() != 0
    }

    /// Sets the flag.
    pub(crate) fn insert(&mut self, flag: EntryFlag) {
        self.0.set(self.0.get() | flag.position());
    }

    /// Clears the flag.
    pub(crate) fn remove(&mut self, flag: EntryFlag) {
        self.0.set(self.0.get() & !flag.position());
    }

    /// Returns the set bits that no defined flag names.
    ///
    /// Readers of layout version 1 reject an entry whose flags carry
    /// unknown bits.
    #[must_use]
    pub(crate) const fn unknown(self) -> u16 {
        self.0.get() & !EntryFlag::ALL
    }
}
