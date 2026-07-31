//! The quality suite: map-fidelity metrics and release thresholds.
//!
//! A projected map is judged by how faithfully small neighbourhoods survive the trip from the
//! canonical embedding space to 2D. The suite compares neighbour rankings between three spaces -
//! the 2D map, the 512-component training representation, and exact 3072-component canonical
//! distances over bounded probe sets - and reports recall, trustworthiness, continuity, intrusion
//! rates, triplet agreement, density distortion, and landmark rank correlation, each overall and
//! per subgroup. The 512-versus-3072 comparison is the representation baseline the map readings are
//! judged against.
//!
//! [`metric`] holds the rank-based kernels: pure functions over neighbour orderings and distances,
//! independent of which spaces produced them. [`clump`] groups near-duplicate rows over the
//! 512-component neighbour table, so readings can collapse orderings onto clump ids and separate
//! placement error from reshuffling among near-identical siblings. [`probe`] orchestrates the
//! measurement: anchor and comparison sampling, canonical embeddings through the dataset's
//! probe-scoped stream, rankings in all three spaces, and per-anchor reading grids. [`report`]
//! renders the readings under configured thresholds: overall and per-subgroup metric rows, the
//! subgroup degradation flags, and the release verdict.
//!
//! Every metric here is a function of rankings over a shared comparison universe. Probe-scoped
//! readings are exact over their probe sets and estimates of the corpus-wide quantity; the report
//! carries the probe sizes so a reading is never mistaken for a corpus-complete measurement.

pub(crate) mod clump;
pub(crate) mod error;
pub(crate) mod metric;
pub(crate) mod probe;
pub(crate) mod report;
pub(crate) mod runner;

#[cfg(test)]
mod tests;

/// One quality metric of the admission probe's six-threshold set.
///
/// The suite's gated vocabulary: each variant names one control of the release battery, so a
/// report's verdict and an observer's reading identify a metric the same way.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum QualityMetric {
    /// The neighbour backend's measured recall.
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
    /// Every metric of the battery, in the order a report's controls carry them.
    ///
    /// An observer rendering the battery needs the set before the probe reports any of it, and the
    /// readings arrive in one burst at the end of the probe, so this list carries the order rather
    /// than arrival.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the index runs over the variant count, an order of magnitude inside u8"
    )]
    pub const ALL: [Self; core::mem::variant_count::<Self>()] =
        // SAFETY: every variant is a unit variant of a `repr(u8)` enum. Its discriminants are then
        // exactly the range `0..variant_count`, and `from_fn` calls the closure once per index of
        // that range.
        core::array::from_fn(const |index| unsafe { core::mem::transmute(index as u8) });

    /// The metric's name, in the vocabulary its own threshold key uses.
    ///
    /// Each name is the noun of the report's own key, so `minimum_recall` is `recall` and
    /// `maximum_density_spread` is `density spread`. A rendered reading and the threshold that
    /// moves it therefore name one control.
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
