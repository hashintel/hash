//! Force-bearing instances grouped by relation.
//!
//! [`AttractionIndex`] stores every admitted instance that survives force pruning, contiguously per
//! relation type. A group carries the factors shared by its relation (class weights, frozen
//! strength); its edges carry the per-instance factors (effective confidence, degree
//! normalization). Training weights one edge by multiplying the group and edge factors into its
//! class energies, so every factor of the relation-attraction objective enters exactly once by
//! construction.

use super::EffectiveConfidence;
use crate::{
    identity::OntologyRowId,
    math::{NonNegative, PositiveUnitFraction},
};

/// Shared attraction settings of one generation, valid by construction.
///
/// The Coincident coefficient `κ_C` scales the Coincident energy relative to Proximal's unit scale.
/// It stays 0 until the generation meets its Coincident release criterion; after that, tuning grids
/// ratios in `2..=8` (the composite-objective tuning protocol), so enabling runs start there.
///
/// The pruning threshold `η_F` drops instances whose force mass `c · s · s+` cannot move the
/// layout, and 0 retains every instance. The omitted-mass fraction a threshold produces
/// ([`super::BuildMeasurements::omitted_mass_fraction`]) audits it, and the threshold controls only
/// attraction sampling. Protection masses never pass through it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
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
    /// Both values carry their domain in the type, so construction validates nothing. The
    /// default is `κ_C = 0` (the Coincident class exerts no pull until the generation meets its
    /// release criterion) and `η_F = 0` (every admitted instance survives).
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

/// One force-bearing link instance under its group's relation.
///
/// The stored factors are the ones that vary per instance; the class weights and strength
/// multiplier live on the owning [`AttractionGroup`].
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
    /// The degree normalization `ν`.
    ///
    /// Computed over the complete admitted instance set of the group's relation.
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
    /// An instance's force mass is its confidence times its reading share times this scale; the
    /// pruning predicate compares that mass against the threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn scale(self) -> NonNegative {
        self.coincident + self.proximal
    }
}

/// One relation type's retained instances and shared weights.
#[derive(Debug, Clone)]
pub(crate) struct AttractionGroup<N, E> {
    relation: OntologyRowId,
    weights: AttractionWeights,
    edges: Vec<AttractionEdge<N, E>>,
}

impl<N, E> AttractionGroup<N, E> {
    /// Assembles a group.
    ///
    /// The builder upholds the documented edge order.
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

    /// Borrows the retained instances, ascending by `(source, target, edge)`.
    #[inline]
    #[must_use]
    pub(crate) const fn edges(&self) -> &[AttractionEdge<N, E>] {
        self.edges.as_slice()
    }
}

/// Force-bearing instances of one generation, grouped by relation type.
///
/// Groups ascend by relation row; a relation none of whose instances survived pruning stores no
/// group. Within a group, edges ascend by `(source, target, edge)`. Both orders are total, so the
/// index is identical for any input order of the same instances.
#[derive(Debug, Clone)]
pub(crate) struct AttractionIndex<N, E> {
    groups: Vec<AttractionGroup<N, E>>,
}

impl<N, E> AttractionIndex<N, E> {
    /// Assembles the index.
    ///
    /// The builder upholds the documented group order.
    pub(super) const fn new(groups: Vec<AttractionGroup<N, E>>) -> Self {
        Self { groups }
    }

    /// Returns the index carrying no force at all.
    ///
    /// The trainer's vacuous run consumes it. A placement configured to withhold the relation
    /// evidence trains against every other term while the published relation artifacts stay real.
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
}
