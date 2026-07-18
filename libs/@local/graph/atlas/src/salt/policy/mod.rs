//! Relation geometry policies: how a relation type behaves in the map.
//!
//! Every relation type in scope resolves to a distribution over the
//! [`GeometryClass`]es, which downstream stages turn into attraction,
//! protection, and admission decisions. The open-world [`classifier`]
//! supplies the distribution for relation types without a
//! higher-precedence explicit policy record; precedence resolution and
//! the coincident gate join this module with fitting step 7.
//!
//! The classes describe geometric behavior, never semantic valence:
//! opposition, contradiction, and citation are rendering concerns. No
//! class imposes a repulsive force - a mistaken attraction is bounded,
//! while a mistaken repulsion destroys local structure.

use core::{fmt, mem};

pub(crate) mod classifier;

#[cfg(test)]
mod tests;

/// Geometry classes a relation type distributes over.
///
/// The discriminants order the classes as every classifier target,
/// posterior, and persisted coefficient row does: Coincident, Proximal,
/// Overlay. The class schema is versioned; extending it (for example
/// with a bounded-separation Deconflict class) is a new schema with its
/// own corpus, model, and artifacts, never a runtime extension of this
/// one.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
pub(crate) enum GeometryClass {
    /// The endpoints share a referent; distance above a small
    /// normalized radius is penalized.
    Coincident = 0,
    /// The relation makes its endpoints discoverably nearby; distance
    /// above a larger normalized radius is penalized.
    Proximal = 1,
    /// The relation renders as an edge but contributes zero layout
    /// energy.
    Overlay = 2,
}

impl GeometryClass {
    /// Classes in the active schema.
    pub(crate) const COUNT: usize = mem::variant_count::<Self>();
    /// Every class, in class order.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the variant count is far below `u8::MAX`"
    )]
    // SAFETY: the discriminants are the dense range `0..COUNT`, so every
    // transmuted index is a declared `repr(u8)` variant.
    pub(crate) const VARIANTS: [Self; Self::COUNT] = core::array::from_fn(const |index| unsafe {
        core::mem::transmute::<u8, Self>(index as u8)
    });

    /// Returns the class position in class order.
    #[inline]
    #[must_use]
    pub(crate) const fn index(self) -> usize {
        self as usize
    }
}

impl fmt::Display for GeometryClass {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Coincident => "coincident",
            Self::Proximal => "proximal",
            Self::Overlay => "overlay",
        })
    }
}

/// A distribution over the geometry classes.
///
/// Components are stored in class order, are finite and nonnegative,
/// and sum to one within floating-point rounding. Construction sites
/// are the softmax (which satisfies the invariant by construction) and
/// validated artifact reads.
// The invariant excludes byte-level constructors: no zerocopy derives.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Posterior([f64; GeometryClass::COUNT]);

impl Posterior {
    /// Sum tolerance accepted by [`new`](Self::new), in units in the
    /// last place of 1.0. Covers the rounding of a summed softmax
    /// without admitting an unnormalized distribution.
    const SUM_TOLERANCE: f64 = 1.0e-9;

    /// Validates a distribution in class order.
    ///
    /// Returns [`None`] when a component is not finite, is negative, or
    /// the components do not sum to one within the documented
    /// tolerance.
    #[must_use]
    pub(crate) fn new(components: [f64; GeometryClass::COUNT]) -> Option<Self> {
        if components
            .iter()
            .any(|value| !value.is_finite() || value.is_sign_negative())
        {
            return None;
        }
        let sum = components.iter().sum::<f64>();
        if (sum - 1.0).abs() > Self::SUM_TOLERANCE {
            return None;
        }

        Some(Self(components))
    }

    /// Adopts softmax output, whose invariant holds by construction.
    #[inline]
    #[must_use]
    pub(crate) const fn from_softmax(components: [f64; GeometryClass::COUNT]) -> Self {
        Self(components)
    }

    /// Returns the probability of `class`.
    #[inline]
    #[must_use]
    pub(crate) const fn probability(self, class: GeometryClass) -> f64 {
        self.0[class.index()]
    }

    /// Returns the distribution as an array in class order.
    #[inline]
    #[must_use]
    pub(crate) const fn as_array(&self) -> &[f64; GeometryClass::COUNT] {
        &self.0
    }
}
