//! Map-fidelity measurements and admission thresholds.
//!
//! The suite judges neighbourhood preservation between the 2D map, the 512-component training
//! representation and the 3072-component canonical space. Map-versus-representation rankings cover
//! every non-anchor row. Comparisons involving canonical embeddings use a bounded shared sample.
//! The representation-versus-canonical reading supplies a baseline for the map's canonical reading
//! at that sampled scale.
//!
//! [`metric`] holds rank-based recall, trustworthiness, continuity, intrusion/extrusion and
//! triplet-agreement kernels. [`clump`] groups rows through near-duplicate edges in the stored
//! neighbour table. Collapsing recall onto these component labels measures overlap with row
//! identity relaxed, without certifying compactness or within-component placement. [`probe`]
//! samples anchors and comparisons, fetches canonical embeddings and produces per-anchor readings.
//! [`report`] aggregates these into whole-probe measurements, per-type neighbourhood rows and
//! subgroup flags, with density distortion from neighbourhood radii and a threshold verdict.
//! [`runner`] assesses a published generation against a dataset.
//!
//! Rankings use computed distances over their stated universe. Aggregates retain anchor-sampling
//! uncertainty even where ranking coverage is exact, and a sampled k-neighbourhood measures a
//! coarser scale than the same k over the corpus. Reports retain both universe sizes. Admission
//! checks the observed map-versus-representation metrics, density spread and sampled triplet
//! agreement. Canonical comparisons and subgroup flags remain report-only.

pub(crate) mod clump;
pub(crate) mod error;
pub(crate) mod metric;
pub(crate) mod probe;
pub(crate) mod report;
pub(crate) mod runner;

#[cfg(test)]
mod tests;

/// A metric checked by the admission thresholds.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum QualityMetric {
    /// Shared map-versus-representation neighbourhoods.
    Recall,
    /// Neighbourhood trustworthiness.
    Trustworthiness,
    /// Neighbourhood continuity.
    Continuity,
    /// The intrusion rate.
    IntrusionRate,
    /// The density spread.
    DensitySpread,
    /// Triplet agreement.
    TripletAgreement,
}

impl QualityMetric {
    /// Every admission metric, in report-control order.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the index runs over the variant count, an order of magnitude inside u8"
    )]
    pub const ALL: [Self; core::mem::variant_count::<Self>()] =
        // SAFETY: a fieldless `repr(u8)` enum has u8 size and requires a valid discriminant. These
        // six variants have implicit consecutive discriminants starting at zero. `from_fn`
        // supplies exactly those indices, and each fits in u8. Therefore every transmute produces
        // a valid variant.
        core::array::from_fn(const |index| unsafe { core::mem::transmute(index as u8) });

    /// Returns the metric noun used in its threshold key.
    ///
    /// For example, `minimum_recall` uses `recall` and `maximum_density_spread` uses `density
    /// spread`.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Recall => "recall",
            Self::Trustworthiness => "trustworthiness",
            Self::Continuity => "continuity",
            Self::IntrusionRate => "intrusion rate",
            Self::DensitySpread => "density spread",
            Self::TripletAgreement => "triplet agreement",
        }
    }
}
