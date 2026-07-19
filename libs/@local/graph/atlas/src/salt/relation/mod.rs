//! Relation indexes: factorized attraction edges and no-repel protection.
//!
//! The deliverable is [`RelationIndexes`]: the two link-derived structures
//! projector training consumes, built together from one pass over the
//! generation's admitted link instances so both always describe the same
//! edge set.
//!
//! - [`attraction::AttractionIndex`] holds every force-bearing instance, grouped by relation type,
//!   carrying the weight factors of the relation-attraction objective. Factors live where they
//!   vary: the per-relation values (class weights, frozen strength) on the group, the per-instance
//!   values (effective confidence, degree normalization) on the edge. Each factor therefore enters
//!   the objective exactly once, and the grouped layout is the shape minibatch sampling caps
//!   per-relation representation over.
//! - [`protection::ProtectionIndex`] holds the per-pair evidence masses that veto targeted
//!   repulsion between linked endpoint rows. Masses aggregate before attraction admission and
//!   before force pruning, so an edge too weak to pull still vetoes a false-neighbour repulsion.
//!
//! # Input contract
//!
//! Instances are the caller's admission decision over the dataset's edge
//! stream: one [`RelationInstance`] per admitted `(edge, relation)`
//! reading, sharing the edge row's endpoints and confidence scores.
//! Row references and score ranges are the dataset stream's contracts
//! (`crate::dataset`), and each edge row appears at most once per
//! relation because the stream assigns edge rows by position; the build
//! consumes them under those contracts. Every invariant the build itself
//! requires is carried by a validating type: [`Policies`] certifies the
//! policy table once at construction, and the option types are valid by
//! construction.
//!
//! # Weights
//!
//! For an admitted instance of relation `r` between rows `i` and `j`, the
//! per-instance weights are the effective confidence
//!
//! ```text
//! c = c_link * sqrt(c_source * c_target),
//! ```
//!
//! where a missing score contributes the neutral factor 1 and sets a
//! retained provenance bit, and the degree normalization
//!
//! ```text
//! nu = 1 / sqrt((1 + degree_r(i)) * (1 + degree_r(j))),
//! ```
//!
//! where `degree_r` counts the relation's admitted instances at a row.
//! Degrees always cover the complete admitted instance set: force pruning
//! drops an edge from sampling without reweighting its neighbours.
//!
//! The per-relation group carries the class weights
//!
//! ```text
//! coincident = kappa_C * p*_C,        proximal = p*_P,
//! ```
//!
//! the shared Coincident coefficient applied to the effective attraction
//! distribution `p*`; Proximal's unit coefficient is the scale
//! convention of normalized distance. The group's frozen strength
//! multiplier completes the factors.
//!
//! # Protection
//!
//! Protection evidence derives from the selected class distribution `p`
//! and the calibrated applicability `a`: per instance, the
//! applicability-discounted evidence `c * (p_C + p_P) * a` and the
//! undiscounted evidence `c * (p_C + p_P)`, each aggregated by maximum
//! over every instance of an endpoint pair, including instances of
//! different relations and parallel links. A channel's mass under an
//! applicability floor `F` is then exactly
//! `max(discounted, F * undiscounted)`, because the maximum distributes
//! over the per-instance `max(a, F)` - so floors and admission
//! thresholds are both query-time parameters
//! ([`protection::ProtectionView::judge`]), and one built index serves
//! every floor and threshold calibration, including the floor-ablation
//! matrix, unchanged. The index is a symmetric sparse matrix over the
//! node-row domain ([`protection::ProtectionIndex`]): row `i` lists
//! every protected partner of node row `i`, the shape hard-negative
//! mining vets one projected point's candidates against.

use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};
// The policy row vocabulary is `salt::policy`'s deliverable; the
// certified `Policies` view over it stays here with its consumer.
#[cfg(test)]
pub(crate) use crate::salt::policy::ClassProbabilities;
pub(crate) use crate::salt::policy::RelationPolicy;

pub(crate) mod artifact;
pub(crate) mod attraction;
mod build;
mod error;
pub(crate) mod protection;

#[cfg(test)]
mod tests;

/// Confidence scores attached to one link instance.
///
/// Each score lies in `0.0..=1.0`, the dataset stream's confidence
/// contract; `None` is unscored, which [`effective`](Self::effective)
/// treats as the neutral factor 1 while retaining the scored/unscored
/// distinction.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct RelationConfidence {
    /// The store's confidence in the link itself.
    pub link: Option<f32>,
    /// The store's confidence in the link's attachment to its source.
    pub source: Option<f32>,
    /// The store's confidence in the link's attachment to its target.
    pub target: Option<f32>,
}

impl RelationConfidence {
    /// Combines the three scores into one effective confidence.
    ///
    /// The value is `link * sqrt(source * target)` with missing scores
    /// contributing the neutral factor 1; the provenance bits record which
    /// scores were present.
    #[must_use]
    pub(crate) fn effective(self) -> EffectiveConfidence {
        let mut scored = 0;
        if self.link.is_some() {
            scored |= Scored::LINK;
        }
        if self.source.is_some() {
            scored |= Scored::SOURCE;
        }
        if self.target.is_some() {
            scored |= Scored::TARGET;
        }

        let link = self.link.unwrap_or(1.0);
        let source = self.source.unwrap_or(1.0);
        let target = self.target.unwrap_or(1.0);
        EffectiveConfidence {
            value: link * (source * target).sqrt(),
            scored: Scored(scored),
        }
    }
}

/// Presence bits of the three scores behind one effective confidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Scored(u8);

impl Scored {
    const LINK: u8 = 1 << 0;
    const SOURCE: u8 = 1 << 1;
    const TARGET: u8 = 1 << 2;

    /// Returns whether the link score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn link(self) -> bool {
        self.0 & Self::LINK != 0
    }

    /// Returns whether the source-attachment score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn source(self) -> bool {
        self.0 & Self::SOURCE != 0
    }

    /// Returns whether the target-attachment score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn target(self) -> bool {
        self.0 & Self::TARGET != 0
    }
}

/// One link instance's combined confidence and its score provenance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EffectiveConfidence {
    value: f32,
    scored: Scored,
}

impl EffectiveConfidence {
    /// Returns the combined confidence, in `0.0..=1.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn value(self) -> f32 {
        self.value
    }

    /// Returns the presence bits of the three source scores.
    #[inline]
    #[must_use]
    pub(crate) const fn scored(self) -> Scored {
        self.scored
    }
}

/// One admitted link instance: an edge row read under one of its relation
/// types.
///
/// A link entity carrying several relation types yields one instance per
/// type, all referencing the same edge row and confidence scores. The
/// caller admits instances (security mode and conflict quarantine are
/// upstream concerns); every instance handed to the build participates.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationInstance {
    /// The edge row the instance was read from.
    pub edge: EdgeRowId,
    /// The relation type, as an ontology row.
    pub relation: OntologyRowId,
    /// The node the link points from.
    pub source: NodeRowId,
    /// The node the link points to.
    pub target: NodeRowId,
    /// The link's confidence scores.
    pub confidence: RelationConfidence,
}

/// A certified relation policy table.
///
/// Construction checks the table once - strictly ascending by relation
/// row, every value in its domain - so lookups and the build consume it
/// without further validation.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Policies<'policy>(&'policy [RelationPolicy]);

impl<'policy> Policies<'policy> {
    /// Certifies a policy table.
    ///
    /// # Errors
    ///
    /// Returns an error when the policies are not strictly ascending by
    /// relation row, or a policy stores a probability, applicability, or
    /// strength outside its domain.
    pub(crate) fn new(
        policies: &'policy [RelationPolicy],
    ) -> Result<Self, error::RelationIndexError> {
        for (position, policy) in policies.iter().enumerate() {
            if position
                .checked_sub(1)
                .is_some_and(|previous| policies[previous].relation.get() >= policy.relation.get())
            {
                return Err(error::RelationIndexError::PolicyOrder {
                    position,
                    relation: policy.relation,
                });
            }
            if !policy.in_domain() {
                return Err(error::RelationIndexError::PolicyDomain {
                    relation: policy.relation,
                });
            }
        }
        Ok(Self(policies))
    }

    /// Looks up a relation's policy.
    ///
    /// Returns [`None`] when the table does not cover the relation. Time
    /// is `O(log R)` in the table length.
    #[must_use]
    pub(crate) fn get(self, relation: OntologyRowId) -> Option<&'policy RelationPolicy> {
        self.0
            .binary_search_by_key(&relation.get(), |policy| policy.relation.get())
            .ok()
            .map(|position| &self.0[position])
    }
}

/// The build's account of dropped instances and pruned force mass.
///
/// The recorded threshold is the criterion the pruned/retained split
/// was judged against.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct BuildEvidence {
    /// The force-pruning threshold the build applied.
    pub pruning_threshold: f32,
    /// Attraction edges retained by the pruning predicate.
    pub retained_edges: usize,
    /// Attraction edges dropped by the pruning predicate.
    pub pruned_edges: usize,
    /// The summed force mass `c * s+` of the retained edges, accumulated
    /// in double precision.
    pub retained_mass: f64,
    /// The summed force mass of the pruned edges, accumulated in double
    /// precision.
    pub pruned_mass: f64,
    /// Instances dropped because both endpoints are one row; they carry
    /// no geometric force and enter no index.
    pub self_references: usize,
}

impl BuildEvidence {
    /// Returns the fraction of total force mass the pruning dropped.
    ///
    /// This is the quantity the pruning threshold is audited by: a
    /// threshold is admissible while the omitted fraction stays
    /// numerically negligible. An instance set without positive mass
    /// omits nothing.
    #[must_use]
    pub(crate) fn omitted_mass_fraction(&self) -> f64 {
        let total = self.retained_mass + self.pruned_mass;
        if total <= 0.0 {
            return 0.0;
        }
        self.pruned_mass / total
    }
}

/// The relation-force and no-repel structures of one generation.
///
/// Both indexes derive from the same admitted instance set in one build,
/// so the edge an attraction group weights and the pair a protection
/// evidence entry covers can never disagree about the underlying link.
#[derive(Debug, Clone)]
pub(crate) struct RelationIndexes {
    /// Force-bearing instances grouped by relation type.
    pub attraction: attraction::AttractionIndex,
    /// The symmetric per-row no-repel evidence matrix.
    pub protection: protection::ProtectionIndex,
    /// What the build dropped, and the threshold it judged pruning
    /// against.
    pub evidence: BuildEvidence,
}

impl RelationIndexes {
    /// Builds both indexes from the generation's admitted link instances.
    ///
    /// `rows` is the node-row domain the protection matrix spans; every
    /// instance endpoint lies in it under the dataset row contract. The
    /// instances are reordered in place; both indexes are functions of
    /// the instance set alone, identical for any input order. Instances
    /// whose endpoints are one row are dropped and counted in the
    /// evidence: they exert no force between distinct points and protect
    /// nothing. Degrees and protection evidence cover the complete
    /// remaining instance set regardless of pruning.
    ///
    /// Sorting and emission are parallel at two levels: groups build
    /// concurrently, and a group's instances emit over fixed-position
    /// chunks, so one high-volume relation cannot serialize the pass.
    /// The fixed boundaries keep the double-precision evidence sums a
    /// function of the instance set alone. Time is `O(E log E)` in the
    /// instance count; beyond the returned indexes the build allocates
    /// one two-column endpoint scratch per relation group.
    ///
    /// # Errors
    ///
    /// Returns an error when an instance references a relation the
    /// policy table does not cover, or `rows` exceeds the protection
    /// matrix's `u32` column encoding.
    ///
    /// # Panics
    ///
    /// Panics when an instance endpoint lies outside the `rows` domain,
    /// which the dataset row contract excludes.
    pub(crate) fn build(
        rows: usize,
        policies: Policies<'_>,
        instances: &mut [RelationInstance],
        attraction: attraction::AttractionOptions,
    ) -> Result<Self, error::RelationIndexError> {
        build::build(rows, policies, instances, attraction)
    }
}
