//! The attraction index: force-bearing instances grouped by relation.
//!
//! [`AttractionIndex`] stores every admitted instance that survives force
//! pruning, contiguously per relation type. A group carries the factors
//! shared by its relation (class weights, frozen strength); its edges
//! carry the per-instance factors (effective confidence, degree
//! normalization). Training weights one edge by multiplying the group and
//! edge factors into its class energies, so every factor of the
//! relation-attraction objective is applied exactly once by construction.

use super::{EffectiveConfidence, error::RelationIndexError};
use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};

/// Shared attraction settings of one generation.
///
/// The Coincident coefficient `kappa_C` scales the Coincident energy
/// relative to Proximal's unit scale. It stays 0 until the generation's
/// Coincident release gate is met; after that, tuning grids ratios in
/// `2..=8` (the composite-objective tuning protocol), so enabling runs
/// start there.
///
/// The pruning threshold `eta_F` drops instances whose force mass
/// `c * s+` cannot move the layout; 0 retains every instance. A
/// threshold is audited by the omitted-mass fraction it produces
/// ([`super::BuildEvidence::omitted_mass_fraction`]) and controls only
/// attraction sampling: protection masses never pass through it.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct AttractionOptions {
    /// The shared Coincident coefficient `kappa_C`, finite and
    /// non-negative. Defaults to 0: the Coincident class exerts no pull
    /// until its release gate is met.
    pub coincident_coefficient: f32 = 0.0,
    /// The force-pruning threshold `eta_F`, finite and non-negative.
    /// Defaults to 0: every admitted instance is retained.
    pub pruning_threshold: f32 = 0.0,
}

impl AttractionOptions {
    /// Checks both settings against their domains.
    ///
    /// # Errors
    ///
    /// Returns an error when the Coincident coefficient or the pruning
    /// threshold is negative or not finite.
    pub(super) fn validate(self) -> Result<(), RelationIndexError> {
        if !self.coincident_coefficient.is_finite() || self.coincident_coefficient < 0.0 {
            return Err(RelationIndexError::CoincidentCoefficient {
                value: self.coincident_coefficient,
            });
        }
        if !self.pruning_threshold.is_finite() || self.pruning_threshold < 0.0 {
            return Err(RelationIndexError::PruningThreshold {
                value: self.pruning_threshold,
            });
        }
        Ok(())
    }
}

/// One force-bearing link instance under its group's relation.
///
/// The stored factors are the ones that vary per instance; the class
/// weights and strength multiplier live on the owning
/// [`AttractionGroup`].
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionEdge {
    /// The edge row the instance was read from.
    pub edge: EdgeRowId,
    /// The node the link points from.
    pub source: NodeRowId,
    /// The node the link points to.
    pub target: NodeRowId,
    /// The instance's effective confidence `c` with score provenance.
    pub confidence: EffectiveConfidence,
    /// The degree normalization `nu`, in `(0, 1]`, computed over the
    /// complete admitted instance set of the group's relation.
    pub degree_normalization: f32,
}

/// The per-relation weight factors of one attraction group.
///
/// `coincident` and `proximal` are the class weights
/// `kappa_C * p*_C` and `p*_P`: each class probability already carries
/// its shared coefficient, Proximal's being the unit scale convention.
/// `strength` is the relation's frozen multiplier, applied outside the
/// class mixture.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AttractionWeights {
    /// The Coincident class weight `kappa_C * p*_C`.
    pub coincident: f32,
    /// The Proximal class weight `p*_P`.
    pub proximal: f32,
    /// The frozen strength multiplier `h`; exactly 1 while the strength
    /// head is disabled.
    pub strength: f32,
}

impl AttractionWeights {
    /// Returns the positive force scale `s+`, the sum of the class
    /// weights.
    ///
    /// An instance's force mass is its confidence times this scale; the
    /// pruning predicate compares that mass against the threshold.
    #[inline]
    #[must_use]
    pub(crate) fn scale(self) -> f32 {
        self.coincident + self.proximal
    }
}

/// One relation type's retained instances and shared weights.
#[derive(Debug, Clone)]
pub(crate) struct AttractionGroup {
    pub(super) relation: OntologyRowId,
    pub(super) weights: AttractionWeights,
    pub(super) edges: Vec<AttractionEdge>,
}

impl AttractionGroup {
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

    /// Borrows the retained instances, ascending by `(source, target,
    /// edge)`.
    #[inline]
    #[must_use]
    pub(crate) fn edges(&self) -> &[AttractionEdge] {
        &self.edges
    }
}

/// Force-bearing instances of one generation, grouped by relation type.
///
/// Groups ascend by relation row; a relation none of whose instances
/// survived pruning stores no group. Within a group, edges ascend by
/// `(source, target, edge)`. Both orders are total, so the index is
/// identical for any input order of the same instances.
#[derive(Debug, Clone)]
pub(crate) struct AttractionIndex {
    pub(super) groups: Vec<AttractionGroup>,
}

impl AttractionIndex {
    /// Borrows the relation groups, ascending by relation row.
    #[inline]
    #[must_use]
    pub(crate) fn groups(&self) -> &[AttractionGroup] {
        &self.groups
    }

    /// Returns the retained instance count over all groups.
    #[must_use]
    pub(crate) fn edges(&self) -> usize {
        self.groups.iter().map(|group| group.edges.len()).sum()
    }
}
