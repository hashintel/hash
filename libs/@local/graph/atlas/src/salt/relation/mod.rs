//! Relation indexes: factorized attraction edges and no-repel protection.
//!
//! [`RelationIndexes::build`] derives attraction and protection from the same admitted link
//! instances. Attraction assigns geometric weights to typed instances. Protection retains pair
//! evidence independently of attraction pruning, for deciding which negative pairs to exclude.
//!
//! - [`attraction::AttractionIndex`] groups retained instances by relation type. Class weights and
//!   frozen strength belong to the group, effective confidence and share-weighted degree
//!   normalization to the edge. Multiplying these factors into the class energies applies each
//!   exactly once. The grouped layout supports per-relation sampling caps.
//! - [`protection::ProtectionIndex`] aggregates evidence over each endpoint pair. A pruned
//!   attraction instance still contributes protection evidence. Whether that evidence vetoes
//!   repulsion depends on the channel's floor and threshold.
//!
//! # Input contract
//!
//! Supply one [`RelationInstance`] per admitted `(edge, relation)` reading, with endpoints in the
//! node-row domain. Readings of one edge must share endpoints and scores, and each must carry the
//! edge's total admitted reading count. Each `(edge, relation)` must occur at most once. The build
//! assumes these relationships rather than validating them. It treats a zero multiplicity as one
//! and drops self-references before resolving policies.
//!
//! [`Policies`] certifies strictly ascending policy rows. Confidence and option types constrain
//! individual scalar domains. They do not certify instance uniqueness, reading counts or that a
//! policy's class components sum to at most one.
//!
//! # Weights
//!
//! For an admitted instance of relation `r` between rows `i` and `j`, the per-instance weights are
//! the effective confidence
//!
//! ```text
//! c = c_link · √(c_source · c_target),
//! ```
//!
//! where each score lies in `[0, 1]`. A missing score contributes the neutral factor 1, and a
//! presence bit records each supplied score. The reading share is
//!
//! ```text
//! s = 1 / multiplicity,
//! ```
//!
//! which makes a complete set of one edge's readings a mixture of its types' geometric weights
//! before degree normalization. Parallel edges remain independent assertions. This conservation is
//! a real-arithmetic law for the shares and makes no claim about equal realized force after degree
//! normalization. The degree normalization is
//!
//! ```text
//! ν = 1 / √((1 + degree_r(i)) · (1 + degree_r(j))),
//! ```
//!
//! where `degree_r` sums the shares of every non-self instance of relation `r` incident to the row.
//! A complete set of readings contributes one unit across relations at each endpoint in real
//! arithmetic. Degrees cover all non-self instances before pruning: removing an edge from sampling
//! does not reweight its neighbours. The persisted per-instance factor is `ν · s`.
//!
//! Protection uses undivided evidence. Aggregation by maximum lets one reading assert its full
//! evidence even when its attraction share is fractional.
//!
//! The per-relation group carries the class weights
//!
//! ```text
//! coincident = κ_C · p*_C,        proximal = p*_P,
//! ```
//!
//! where `p*` is the policy's effective attraction distribution over the [geometry
//! classes](crate::salt::policy::GeometryClass), and `κ_C` is the non-negative Coincident
//! coefficient. Proximal's unit coefficient fixes the scale convention. The group's frozen
//! non-negative strength multiplier completes the factors.
//!
//! Confidence, shares, degree prefixes and combined normalization compute in `f64`. Class weights
//! narrow to `f32`. These operations round, including prefix subtraction for a row's degree, and
//! confidence products can underflow to zero. Fixed sorted order and fixed emission
//! chunks make build results independent of input order and thread scheduling under the uniqueness
//! contract, at the same floating-point implementation.
//!
//! # Protection
//!
//! Protection derives from the selected class distribution `p` and calibrated applicability `a ∈
//! [0, 1]`. It aggregates the discounted evidence `c · (p_C + p_P) · a` and undiscounted evidence
//! `c · (p_C + p_P)` by independent maxima over all non-self instances of each endpoint pair,
//! across relations and parallel links.
//!
//! A channel's mass under applicability floor `F ∈ [0, 1]` is `max(discounted, F · undiscounted)`.
//! [`protection`] gives the factorization and its rounding convention. Floors and admission
//! thresholds are query-time parameters of [`protection::ProtectionView::judge`]. One built index
//! supports the full floor/threshold calibration grid. Its symmetric sparse matrix exposes each
//! row's partners for both pair lookups and row-wise candidate checks.

use hashql_core::id::Id;

use self::protection::NodePair;
pub(crate) use self::{
    confidence::{EffectiveConfidence, RelationConfidence, Scored},
    error::RelationIndexError,
};
#[cfg(test)]
pub(crate) use crate::salt::policy::ClassProbabilities;
pub(crate) use crate::salt::policy::RelationPolicy;
use crate::{
    identity::OntologyRowId,
    math::{DNonNegative, NonNegative},
    salt::policy::CertifiedPolicies,
};

pub(crate) mod artifact;
pub(crate) mod attraction;
// public for the root bench facade's re-export.
#[cfg(feature = "bench")]
pub mod bench;
mod build;
mod confidence;
mod error;
pub(crate) mod protection;

#[cfg(test)]
mod tests;

/// One admitted reading of an edge row under a relation type.
///
/// A link entity carrying multiple relation types yields one instance per type, all referencing the
/// same edge row and confidence scores. With `multiplicity` equal to the admitted reading count,
/// the shares `1 / multiplicity` sum to one before degree normalization, up to rounding. Admission
/// belongs to the producer. The build drops self-references and applies attraction pruning to the
/// remaining instances.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationInstance<N, E> {
    /// The edge row that produced the instance.
    pub edge: E,
    /// The relation type, as an ontology row.
    pub relation: OntologyRowId,
    /// The node the link points from.
    pub source: N,
    /// The node the link points to.
    pub target: N,
    /// The link's confidence scores.
    pub confidence: RelationConfidence,
    /// The edge's total admitted reading count across its relation types, at least 1.
    ///
    /// The build clamps zero to one without checking that this count matches the supplied
    /// readings.
    pub multiplicity: u32,
}

impl<N, E> RelationInstance<N, E> {
    /// Returns the instance's canonical endpoint pair.
    #[inline]
    #[must_use]
    pub(super) const fn pair(self) -> NodePair<N>
    where
        N: [const] Id,
        E: [const] Id,
    {
        NodePair::new(self.source, self.target)
    }
}

/// A certified relation policy table.
///
/// Construction checks the strictly ascending relation order once, or adopts it from an owned
/// [`CertifiedPolicies`] with the same ordering invariant. The policy's field types constrain
/// individual values. Certification does not check relationships between class probabilities.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Policies<'policy>(&'policy [RelationPolicy]);

impl<'policy> Policies<'policy> {
    /// Certifies a policy table.
    ///
    /// # Errors
    ///
    /// Returns [`RelationIndexError`] for a policy-order violation.
    #[cfg(any(test, feature = "bench"))]
    pub(crate) fn new(
        policies: &'policy [RelationPolicy],
    ) -> Result<Self, error::RelationIndexError> {
        for (previous, [before, policy]) in policies.array_windows().enumerate() {
            if before.relation >= policy.relation {
                return Err(error::RelationIndexError::PolicyOrder {
                    position: previous + 1,
                    relation: policy.relation,
                });
            }
        }

        Ok(Self(policies))
    }

    /// Looks up a relation's policy.
    ///
    /// Returns [`None`] when the table does not cover the relation. Time is `O(log(R + 2))` for
    /// table length `R`.
    #[must_use]
    pub(crate) fn get(self, relation: OntologyRowId) -> Option<&'policy RelationPolicy> {
        self.0
            .binary_search_by_key(&relation.as_u64(), |policy| policy.relation.as_u64())
            .ok()
            .map(|position| &self.0[position])
    }
}

impl<'policy> From<&'policy CertifiedPolicies> for Policies<'policy> {
    fn from(certified: &'policy CertifiedPolicies) -> Self {
        Self(certified.as_slice())
    }
}

/// The build's account of dropped instances and pruned force mass.
///
/// The recorded threshold is the criterion the pruned/retained split was judged against.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct BuildMeasurements {
    /// The force-pruning threshold the build applied.
    pub pruning_threshold: NonNegative,
    /// Attraction edges retained by the pruning predicate.
    pub retained_edges: usize,
    /// Attraction edges dropped by the pruning predicate.
    pub pruned_edges: usize,
    /// The summed force mass `c · s · s+` of the retained edges, accumulated in double precision.
    pub retained_mass: DNonNegative,
    /// The summed force mass of the pruned edges, accumulated in double precision.
    pub pruned_mass: DNonNegative,
    /// Instances dropped because both endpoints are one row.
    ///
    /// They carry no geometric force and enter no index.
    pub self_references: usize,
    /// The edge multiplicity histogram.
    ///
    /// Entry `i` counts edges carrying `i + 1` relation readings. [`RelationIndexes::build`]
    /// leaves this empty. The edge drain supplies the histogram separately.
    pub multi_typed_edges: Vec<u64>,
}

impl BuildMeasurements {
    /// Returns the fraction of total force mass the pruning dropped.
    ///
    /// Compare this fraction with an acceptable omitted-mass budget when choosing a pruning
    /// threshold. It measures `c · s · s+`, excluding degree normalization, frozen strength and
    /// class-energy derivatives, and does not bound layout movement. An instance set without
    /// positive mass returns zero.
    #[must_use]
    #[cfg(any(test, feature = "bench"))]
    pub(crate) fn omitted_mass_fraction(&self) -> crate::math::UnitFraction {
        use crate::math::UnitFraction;

        let total = self.retained_mass.get() + self.pruned_mass.get();

        if total <= 0.0 {
            return UnitFraction::ZERO;
        }

        // A rounded sum of finite non-negative masses is at least each operand. Both stored masses
        // are finite, even if their sum overflows to infinity. Therefore the quotient lies in [0,
        // 1], with an infinite total yielding zero.
        UnitFraction::new(self.pruned_mass.get() / total)
            .expect("a non-negative share of a total at least as large lies in [0, 1]")
    }
}

/// The relation-force and no-repel structures of one generation.
///
/// [`Self::build`] derives both indexes from the same admitted instance set. Protection includes
/// every non-self pair, including pairs whose attraction instances all prune. The public fields do
/// not validate shared provenance when assembled separately.
#[derive(Debug, Clone)]
pub(crate) struct RelationIndexes<N, E> {
    /// Retained link instances grouped by relation type.
    pub attraction: attraction::AttractionIndex<N, E>,
    /// The symmetric per-row no-repel evidence matrix.
    pub protection: protection::ProtectionIndex<N>,
    /// What the build dropped, and the threshold it judged pruning against.
    pub measurements: BuildMeasurements,
}

impl<N, E> RelationIndexes<N, E> {
    /// Builds both indexes from the generation's admitted link instances.
    ///
    /// `rows` is the node-row domain the protection matrix spans. Endpoints must lie in this
    /// domain, and `N` must represent the domain's row positions and end fencepost. Instances must
    /// satisfy the module's uniqueness and multiplicity contract. The build reorders them in place
    /// and drops self-references, counting each dropped instance. Degrees and protection evidence
    /// cover the complete remaining instance set regardless of pruning.
    ///
    /// Groups build concurrently. Within a group, emission uses fixed-position chunks with partial
    /// masses combined in chunk order. Together with the unique sort keys, this gives input-order
    /// and scheduling independence at the same floating-point implementation.
    ///
    /// # Complexity
    ///
    /// For `E` instances, `R` policy rows and `N` node rows, time is:
    ///
    /// `O(E log(E + 1) + E log(R + 1) + N)`.
    ///
    /// Working storage is `O(E + N)` beyond the returned indexes: endpoint columns and their share
    /// prefixes, per-chunk edge buffers, group ranges, protection records and row cursors. The
    /// final protection scatter is sequential.
    ///
    /// # Errors
    ///
    /// Returns [`RelationIndexError`] for an oversized row domain or a non-self instance without a
    /// policy. The row bound is checked first, then missing policies in ascending relation order.
    ///
    /// # Panics
    ///
    /// Panics when a non-self endpoint is outside `rows` or `N` cannot represent a required row
    /// position or fencepost.
    pub(crate) fn build(
        rows: usize,
        policies: Policies<'_>,
        instances: &mut [RelationInstance<N, E>],
        attraction: attraction::AttractionOptions,
    ) -> Result<Self, error::RelationIndexError>
    where
        N: Id,
        E: Id,
    {
        build::build(rows, policies, instances, attraction)
    }
}
