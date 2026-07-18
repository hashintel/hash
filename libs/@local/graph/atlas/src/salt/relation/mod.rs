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
//!   repulsion between linked endpoint rows. Masses aggregate before the attraction gate and before
//!   force pruning, so an edge too weak to pull still vetoes a false-neighbour repulsion.
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
//! Protection masses are computed per channel (hard-negative and
//! ordinary-negative) from the selected class distribution `p` and the
//! calibrated applicability `a`, with a channel-specific floor:
//!
//! ```text
//! m_X = c * max(a, floor_X) * (p_C + p_P),
//! ```
//!
//! aggregated by maximum over every instance of an endpoint pair,
//! including instances of different relations and parallel links. The
//! index stores the masses; admission thresholds judge them at query time
//! ([`protection::ProtectionIndex::judge`]), so recalibrating a threshold
//! reuses the built index.

use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};

pub(crate) mod attraction;
mod build;
mod error;
pub(crate) mod protection;

#[cfg(test)]
mod tests;

/// Confidence scores attached to one link instance.
///
/// Each score lies in `0.0..=1.0` when present; `None` is unscored, which
/// [`effective`](Self::effective) treats as the neutral factor 1 while
/// retaining the scored/unscored distinction.
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
    /// Returns the combined confidence, in `0.0..=1.0` for scores within
    /// that range.
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

/// The Coincident and Proximal components of a relation class
/// distribution.
///
/// Overlay, the third class, carries no geometric weight, so the two
/// stored components are the distribution's entire geometric content.
/// Each component lies in `0.0..=1.0`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClassProbabilities {
    /// The Coincident class probability.
    pub coincident: f32,
    /// The Proximal class probability.
    pub proximal: f32,
}

/// The resolved geometry policy of one relation type.
///
/// The values the indexes weight instances by: the effective attraction
/// distribution feeds attraction weights, the selected distribution and
/// applicability feed protection masses, and the strength multiplier
/// rides the attraction group unchanged.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationPolicy {
    /// The relation type the policy resolves.
    pub relation: OntologyRowId,
    /// The effective attraction distribution `p*`, after applicability
    /// fallback and the generation's Coincident gate.
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

/// The build's account of dropped instances and pruned force mass.
///
/// The recorded threshold is the gate the pruned/retained split was
/// judged against.
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
        if !(total > 0.0) {
            return 0.0;
        }
        self.pruned_mass / total
    }
}

/// The relation-force and no-repel structures of one generation.
///
/// Both indexes derive from the same admitted instance set in one build,
/// so the edge an attraction group weights and the pair a protection mass
/// covers can never disagree about the underlying link.
#[derive(Debug, Clone)]
pub(crate) struct RelationIndexes {
    /// Force-bearing instances grouped by relation type.
    pub attraction: attraction::AttractionIndex,
    /// Pair-aggregated no-repel evidence masses.
    pub protection: protection::ProtectionIndex,
    /// What the build dropped, and the gate it judged pruning against.
    pub evidence: BuildEvidence,
}

impl RelationIndexes {
    /// Builds both indexes from the generation's admitted link instances.
    ///
    /// `rows` is the node-row domain; every instance endpoint must lie in
    /// it. `policies` resolve strictly ascending by relation row and must
    /// cover every relation an instance references. The instance vector is
    /// consumed: the build reorders it in place instead of copying it.
    ///
    /// Instances whose endpoints are one row are dropped and counted in
    /// the evidence; they exert no force between distinct points and
    /// protect nothing. Degrees and protection masses cover the complete
    /// remaining instance set regardless of pruning.
    ///
    /// Sorting is parallel; the result is identical for any input order
    /// of the same instances. Time is `O(E log E)` in the instance count,
    /// memory one transient pair record per instance beside the returned
    /// indexes.
    ///
    /// # Errors
    ///
    /// Returns an error when an option is out of range, the policies are
    /// out of order or hold values outside their domains, an instance
    /// references a missing policy or an out-of-bounds row, a confidence
    /// score lies outside `0.0..=1.0`, or one `(edge, relation)` instance
    /// occurs twice.
    pub(crate) fn build(
        rows: usize,
        policies: &[RelationPolicy],
        instances: Vec<RelationInstance>,
        attraction: attraction::AttractionOptions,
        protection: protection::ProtectionOptions,
    ) -> Result<Self, error::RelationIndexError> {
        build::build(rows, policies, instances, attraction, protection)
    }
}
