//! Retained link instances grouped by relation.
//!
//! [`AttractionIndex`] groups retained non-self instances by relation type for per-type sampling. A
//! group supplies class weights and frozen strength. Each edge supplies effective confidence and
//! share-weighted degree normalization. The [relation weight model](super#weights) defines how
//! these factors combine.

use super::EffectiveConfidence;
use crate::{
    identity::OntologyRowId,
    math::{NonNegative, PositiveUnitFraction},
    salt::projector::verdict::{PlacementClass, ResolvedVerdict},
};

/// Shared class scaling and attraction-pruning settings of one generation.
///
/// The Coincident coefficient `κ_C` scales Coincident relative to Proximal's unit scale. It is zero
/// by default. A nonzero coefficient is accepted without checking any release criterion. The
/// calibration starting grid is `2..=8`, to be judged against the generation's quality evidence.
///
/// The pruning threshold `η_F` drops instances whose mass `c · s · s+` is strictly below it. It is
/// zero by default, retaining every non-self instance, including zero-mass ones. Evaluate a chosen
/// threshold through [`super::BuildMeasurements::omitted_mass_fraction`] and quality measurements.
/// The mass excludes degree normalization, strength and class-energy derivatives, and is not a
/// movement bound. Protection masses never pass through this predicate.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct AttractionOptions {
    coincident_coefficient: NonNegative = NonNegative::ZERO,
    pruning_threshold: NonNegative = NonNegative::ZERO,
}

const impl Default for AttractionOptions {
    fn default() -> Self {
        Self { .. }
    }
}

impl AttractionOptions {
    /// Creates settings from a Coincident coefficient and a pruning threshold.
    ///
    /// Both values must be finite and non-negative. The defaults are `κ_C = 0` and `η_F = 0`,
    /// disabling Coincident weighting and attraction pruning.
    #[cfg(any(test, feature = "bench"))]
    #[must_use]
    pub(crate) const fn new(
        coincident_coefficient: NonNegative,
        pruning_threshold: NonNegative,
    ) -> Self {
        Self {
            coincident_coefficient,
            pruning_threshold,
        }
    }

    /// Returns the shared Coincident coefficient `κ_C`.
    #[inline]
    #[must_use]
    pub(crate) const fn coincident_coefficient(self) -> NonNegative {
        self.coincident_coefficient
    }

    /// Returns the force-pruning threshold `η_F`.
    #[inline]
    #[must_use]
    pub(crate) const fn pruning_threshold(self) -> NonNegative {
        self.pruning_threshold
    }
}

/// One retained link instance under its group's relation.
///
/// These factors vary per instance. [`AttractionGroup`] supplies shared class weights and strength.
/// Retention alone does not imply positive force.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionEdge<N, E> {
    /// The edge row that produced the instance.
    pub edge: E,
    /// The node the link points from.
    pub source: N,
    /// The node the link points to.
    pub target: N,
    /// The instance's effective confidence `c` with score provenance.
    pub confidence: EffectiveConfidence,
    /// The combined degree normalization and reading share, `ν · s`.
    ///
    /// Degrees cover the group's complete non-self instance set before pruning.
    pub normalization: PositiveUnitFraction,
}

/// The per-relation weight factors of one attraction group.
///
/// `coincident` and `proximal` are the class weights `κ_C · p*_C` and `p*_P`: each class
/// probability already carries its shared coefficient, Proximal's being the unit scale convention.
/// `strength` is the relation's frozen multiplier, applied outside the class mixture.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionWeights {
    /// The Coincident class weight `κ_C · p*_C`.
    pub coincident: NonNegative,
    /// The Proximal class weight `p*_P`.
    pub proximal: NonNegative,
    /// The frozen strength multiplier `h`, exactly 1 while the strength head is off.
    pub strength: NonNegative,
}

impl AttractionWeights {
    /// Returns the positive force scale `s+`, the sum of the class weights.
    ///
    /// The pruning mass is confidence times reading share times this scale. Strength remains
    /// separate. Arbitrary weights can overflow the `f32` sum to infinity.
    #[inline]
    #[must_use]
    pub(crate) const fn scale(self) -> NonNegative {
        self.coincident + self.proximal
    }
}

/// One relation type's retained instances and shared weights.
///
/// Edges are strictly ascending by `(source, target, edge)`.
#[derive(Debug, Clone)]
pub(crate) struct AttractionGroup<N, E> {
    relation: OntologyRowId,
    weights: AttractionWeights,
    edges: Vec<AttractionEdge<N, E>>,
}

impl<N, E> AttractionGroup<N, E> {
    /// Assembles one relation's retained instances and shared weights.
    ///
    /// `edges` must be strictly ascending by `(source, target, edge)`.
    pub(super) const fn new(
        relation: OntologyRowId,
        weights: AttractionWeights,
        edges: Vec<AttractionEdge<N, E>>,
    ) -> Self {
        Self {
            relation,
            weights,
            edges,
        }
    }

    /// Returns the relation type the group's instances share.
    #[inline]
    #[must_use]
    pub(crate) const fn relation(&self) -> OntologyRowId {
        self.relation
    }

    /// Returns the relation's shared weight factors.
    #[inline]
    #[must_use]
    pub(crate) const fn weights(&self) -> AttractionWeights {
        self.weights
    }

    /// Borrows the retained instances in strictly ascending `(source, target, edge)` order.
    #[inline]
    #[must_use]
    pub(crate) const fn edges(&self) -> &[AttractionEdge<N, E>] {
        self.edges.as_slice()
    }

    /// Returns whether the group exerts force on the graph.
    pub(crate) const fn exerts_force(&self) -> bool {
        !self.edges().is_empty() && !self.weights().strength.is_zero()
    }

    const fn exerts_proximal_force(&self) -> bool {
        self.exerts_force() && !self.weights().proximal.is_zero()
    }
}

/// Retained link instances of one generation, grouped by relation type.
///
/// Groups ascend strictly by relation row, omitting empty groups. Within a group, edges ascend
/// strictly by `(source, target, edge)`. Under the [instance uniqueness
/// contract](super#input-contract), [`super::RelationIndexes::build`] produces the same index for
/// any input order at the same floating-point implementation.
#[derive(Debug, Clone)]
pub(crate) struct AttractionIndex<N, E> {
    groups: Vec<AttractionGroup<N, E>>,
}

impl<N, E> AttractionIndex<N, E> {
    /// Assembles nonempty groups in strictly ascending relation order.
    ///
    /// Each group must satisfy [`AttractionGroup`]'s edge-order contract.
    pub(super) const fn new(groups: Vec<AttractionGroup<N, E>>) -> Self {
        Self { groups }
    }

    /// Returns an empty attraction index.
    ///
    /// Use this to disable relation attraction while retaining the other objective terms. It does
    /// not alter protection evidence.
    #[must_use]
    pub(crate) const fn vacuous() -> Self {
        Self { groups: Vec::new() }
    }

    /// Borrows the relation groups, ascending by relation row.
    #[inline]
    #[must_use]
    pub(crate) const fn groups(&self) -> &[AttractionGroup<N, E>] {
        self.groups.as_slice()
    }

    /// Returns the retained instance count over all groups.
    #[must_use]
    pub(crate) fn edge_count(&self) -> usize {
        self.groups.iter().map(|group| group.edges.len()).sum()
    }

    pub(crate) fn has_resolved_proximal_verdict(&self, verdicts: &[ResolvedVerdict]) -> bool {
        verdicts
            .iter()
            .filter(|verdict| verdict.placement == PlacementClass::Proximal)
            .any(|verdict| {
                self.groups
                    .binary_search_by_key(&verdict.relation, AttractionGroup::relation)
                    .is_ok_and(|position| self.groups[position].exerts_proximal_force())
            })
    }
}
