//! Relation geometry policies: how a relation type behaves in the map.
//!
//! Every relation type in scope resolves to a distribution over the [`GeometryClass`]es, which
//! downstream stages turn into attraction, protection, and admission decisions. The open-world
//! [`classifier`] supplies the distribution for relation types without a higher-precedence explicit
//! policy record; [`precedence`] resolves the winning source per relation into the certified policy
//! table.
//!
//! The classes describe geometric behaviour, never semantic valence: opposition, contradiction, and
//! citation are rendering concerns. No class imposes a repulsive force, because a mistaken
//! attraction stays bounded while a mistaken repulsion destroys local structure.
#![expect(clippy::empty_enums, reason = "zerocopy derive")]

use core::{fmt, mem, ops};

use crate::{
    identity::OntologyRowId,
    math::{DVecN, NonNegative, UnitFraction},
};

pub(crate) mod annotation;
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
/// The discriminants order the classes as every classifier target, posterior, and persisted
/// coefficient row does: Coincident, Proximal, Overlay. The class schema has a version. Extending
/// it (for example with a bounded-separation Deconflict class) is a new schema with its own corpus,
/// model, and artifacts, never a runtime extension of this one.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
#[serde(rename_all = "lowercase")]
#[expect(
    clippy::unsafe_derive_deserialize,
    reason = "the enum is fieldless: every derived value is one of the three declared variants, \
              the same domain the unsafe discriminant construction is checked against"
)]
pub enum GeometryClass {
    /// The endpoints share a referent.
    ///
    /// Distance above a small normalized radius incurs a penalty.
    Coincident = 0,
    /// The relation makes its endpoints discoverably nearby.
    ///
    /// Distance above a larger normalized radius incurs a penalty.
    Proximal = 1,
    /// The relation renders as an edge but contributes zero layout energy.
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
    // SAFETY: the discriminants are the dense range `0..COUNT`, so every transmuted index is a
    // declared `repr(u8)` variant.
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
/// Components are [`UnitFraction`]s stored in class order and sum to one within floating-point
/// rounding. Construction sites are the softmax (which satisfies the invariant by construction) and
/// validated artifact reads.
// The sum invariant excludes byte-level constructors: no zerocopy derives.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Posterior([UnitFraction; GeometryClass::COUNT]);

impl Posterior {
    /// Sum tolerance accepted by [`new`](Self::new), as an absolute deviation from one.
    ///
    /// Covers the rounding of a summed softmax without admitting an unnormalized distribution.
    const SUM_TOLERANCE: f64 = 1.0e-9;

    /// Validates a distribution in class order.
    ///
    /// Returns [`None`] when a component lies outside the unit interval or the components do not
    /// sum to one within the documented tolerance. Negative zero passes. It compares equal to zero,
    /// and zero is a legal component. Rejecting negative zero would make admission depend on the
    /// sign bit of a value arithmetic treats as zero.
    #[must_use]
    pub(crate) fn new(components: [f64; GeometryClass::COUNT]) -> Option<Self> {
        let mut validated = [UnitFraction::ZERO; GeometryClass::COUNT];
        for (slot, value) in validated.iter_mut().zip(components) {
            *slot = UnitFraction::new(value)?;
        }

        let sum = components.iter().sum::<f64>();
        if (sum - 1.0).abs() > Self::SUM_TOLERANCE {
            return None;
        }

        Some(Self(validated))
    }

    /// Computes the temperature-scaled softmax of class logits.
    ///
    /// The logits shift by their maximum before the temperature division, then pass through the
    /// max-shifted [`DVecN::softmax`], so finite logits and a positive finite temperature always
    /// produce a valid distribution: components in the unit interval that sum to one. The order
    /// matters. Dividing first can overflow one quotient to `+∞`, and a single infinite
    /// component then poisons the whole shifted vector with `∞ - ∞`. Shifting first is free,
    /// since softmax is shift-invariant. It also closes the overflow path: a pre-shifted logit
    /// is never positive, so its quotient by any positive temperature never reaches `+∞`.
    #[must_use]
    pub(crate) fn softmax(logits: [f64; GeometryClass::COUNT], temperature: f64) -> Self {
        let max = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        Self(
            (*DVecN::new(logits.map(|value| (value - max) / temperature))
                .softmax()
                .as_array())
            .map(UnitFraction::new_unchecked),
        )
    }

    /// Returns the probability of `class`.
    #[inline]
    #[must_use]
    pub(crate) const fn probability(self, class: GeometryClass) -> UnitFraction {
        self.0[class.index()]
    }

    /// Returns the distribution as an array in class order.
    #[inline]
    #[must_use]
    pub(crate) const fn to_array(self) -> [f64; GeometryClass::COUNT] {
        self.0.map(UnitFraction::get)
    }
}

/// The Coincident and Proximal components of a relation class distribution.
///
/// Overlay, the third class, carries no geometric weight, so the two stored components are the
/// distribution's entire geometric content. Each component lies in `0.0..=1.0`.
// The fields carry their own construction invariants, so the byte-level constructor is the
// validating try-cast derive: a candidate is a distribution pair exactly when both fields
// hold stored fractions.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct ClassProbabilities {
    /// The Coincident class probability.
    pub coincident: UnitFraction,
    /// The Proximal class probability.
    pub proximal: UnitFraction,
}

impl ClassProbabilities {
    /// Narrows a posterior to its geometric components.
    ///
    /// The narrowing to working precision is the boundary where policy values stop being solver
    /// state and become data.
    #[inline]
    #[must_use]
    pub(crate) const fn from_posterior(posterior: &Posterior) -> Self {
        Self {
            coincident: posterior.probability(GeometryClass::Coincident),
            proximal: posterior.probability(GeometryClass::Proximal),
        }
    }
}

/// The resolved geometry policy of one relation type.
///
/// The relation indexes weight instances by these values.
///
/// - Attraction weights come from the effective attraction distribution.
/// - Protection masses come from the selected distribution and applicability.
/// - The attraction group receives the strength multiplier unchanged.
// This type has no construction invariant of its own, so the derives admit byte-level construction.
// The `repr(C)` layout is the policy file's pinned wire row, checked field for field where the
// artifact casts, and the try-cast derive validates every domain-typed field's bits at that cast.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct RelationPolicy {
    /// The relation type the policy resolves.
    pub relation: OntologyRowId,
    /// The effective attraction distribution `p*`.
    ///
    /// After applicability fallback and the generation's Coincident admission.
    pub attraction: ClassProbabilities,
    /// The selected class distribution `p`, before applicability blending.
    ///
    /// Protection masses derive from it.
    pub selected: ClassProbabilities,
    /// The calibrated applicability `a`, in `0.0..=1.0`.
    pub applicability: UnitFraction,
    /// The frozen strength multiplier `h`, exactly 1 while the strength head is off.
    pub strength: NonNegative,
    /// Layout filler pinning the tail padding; writers emit zero, readers ignore.
    pub _pad: [u8; 4],
}

/// The certified policy table, strictly ascending by relation row.
///
/// [`resolve`] mints the table sorted with duplicate relations refused, so the order is a
/// construction fact. The checked door certifies tables assembled anywhere else.
#[derive(Debug)]
pub(crate) struct CertifiedPolicies(Vec<RelationPolicy>);

impl CertifiedPolicies {
    /// Certifies a table assembled outside [`resolve`].
    ///
    /// Returns [`None`] when the rows are not strictly ascending by relation row.
    #[must_use]
    pub(crate) fn new(policies: Vec<RelationPolicy>) -> Option<Self> {
        policies
            .is_sorted_by(|left, right| left.relation < right.relation)
            .then_some(Self(policies))
    }

    /// Views the rows, strictly ascending by relation row.
    #[must_use]
    pub(crate) const fn as_slice(&self) -> &[RelationPolicy] {
        &self.0
    }
}

impl ops::Deref for CertifiedPolicies {
    type Target = [RelationPolicy];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
