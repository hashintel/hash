//! Relation geometry policies: how a relation type behaves in the map.
//!
//! Every relation type in scope resolves to a distribution over the
//! [`GeometryClass`]es, which downstream stages turn into attraction,
//! protection, and admission decisions. The open-world [`classifier`]
//! supplies the distribution for relation types without a
//! higher-precedence explicit policy record; [`precedence`] resolves
//! the winning source per relation into the certified policy table.
//!
//! The classes describe geometric behaviour, never semantic valence:
//! opposition, contradiction, and citation are rendering concerns. No
//! class imposes a repulsive force - a mistaken attraction is bounded,
//! while a mistaken repulsion destroys local structure.
#![expect(clippy::empty_enums, reason = "zerocopy derive")]

use core::{fmt, mem};

use crate::dataset::OntologyRowId;

pub(crate) mod artifact;
pub(crate) mod classifier;
mod precedence;

#[cfg(test)]
mod tests;

pub(crate) use self::precedence::{
    Classification, CoincidentAdmission, PolicyOverride, PolicySource, ResolveError, resolve,
};

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
    pub(crate) const fn from_softmax_unchecked(components: [f64; GeometryClass::COUNT]) -> Self {
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

/// The Coincident and Proximal components of a relation class
/// distribution.
///
/// Overlay, the third class, carries no geometric weight, so the two
/// stored components are the distribution's entire geometric content.
/// Each component lies in `0.0..=1.0`.
// Byte-level constructors are admitted: the type carries no
// construction invariant of its own; the mapped policy table validates
// domains once at open.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct ClassProbabilities {
    /// The Coincident class probability.
    pub coincident: f32,
    /// The Proximal class probability.
    pub proximal: f32,
}

impl ClassProbabilities {
    /// Narrows a posterior to its geometric components.
    ///
    /// The narrowing to working precision is the boundary where policy
    /// values stop being solver state and become data.
    #[inline]
    #[must_use]
    pub(crate) const fn from_posterior(posterior: &Posterior) -> Self {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "probabilities lie in [0, 1], far inside f32 range"
        )]
        Self {
            coincident: posterior.probability(GeometryClass::Coincident) as f32,
            proximal: posterior.probability(GeometryClass::Proximal) as f32,
        }
    }
}

/// The resolved geometry policy of one relation type.
///
/// The values the relation indexes weight instances by: the effective
/// attraction distribution feeds attraction weights, the selected
/// distribution and applicability feed protection masses, and the
/// strength multiplier rides the attraction group unchanged.
// Byte-level constructors are admitted: the type carries no
// construction invariant of its own; the mapped policy table validates
// domains once at open. The `repr(C)` layout is the policy file's
// pinned wire row, checked field for field where the artifact casts.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct RelationPolicy {
    /// The relation type the policy resolves.
    pub relation: OntologyRowId,
    /// The effective attraction distribution `p*`, after applicability
    /// fallback and the generation's Coincident admission.
    pub attraction: ClassProbabilities,
    /// The selected class distribution `p`, before applicability
    /// blending; protection masses are computed from it.
    pub selected: ClassProbabilities,
    /// The calibrated applicability `a`, in `0.0..=1.0`.
    pub applicability: f32,
    /// The frozen strength multiplier `h`; exactly 1 while the strength
    /// head is disabled.
    pub strength: f32,
}

impl RelationPolicy {
    /// Returns whether every value lies in its domain.
    #[must_use]
    pub(crate) const fn in_domain(&self) -> bool {
        let probabilities = [
            self.attraction.coincident,
            self.attraction.proximal,
            self.selected.coincident,
            self.selected.proximal,
            self.applicability,
        ];

        let mut index = 0;
        while index < probabilities.len() {
            if !(probabilities[index] >= 0.0 && probabilities[index] <= 1.0) {
                return false;
            }
            index += 1;
        }

        self.strength.is_finite() && self.strength >= 0.0
    }
}
