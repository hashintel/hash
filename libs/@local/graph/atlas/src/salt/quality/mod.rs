//! The quality suite: map-fidelity metrics and release thresholds.
//!
//! A projected map is judged by how faithfully small neighbourhoods
//! survive the trip from the canonical embedding space to 2D. The
//! suite compares neighbour rankings between three spaces - the 2D
//! map, the 512-component training representation, and exact
//! 3072-component canonical distances over bounded probe sets - and
//! reports recall, trustworthiness, continuity, intrusion rates,
//! triplet agreement, density distortion, and landmark rank
//! correlation, each overall and per subgroup. The 512-versus-3072
//! comparison is the representation baseline the map readings are
//! judged against.
//!
//! [`metric`] holds the rank-based kernels: pure functions over
//! neighbour orderings and distances, independent of which spaces
//! produced them. [`clump`] groups near-duplicate rows over the
//! 512-component neighbour table, so readings can collapse orderings
//! onto clump ids and separate placement error from reshuffling among
//! near-identical siblings. The probe orchestration - anchor sampling,
//! exact canonical rankings through the dataset's probe stream, map
//! queries, and the report with its configured thresholds - layers
//! above the kernels.
//!
//! Every metric here is a function of rankings over a shared
//! comparison universe. Probe-scoped readings are exact over their
//! probe sets and estimates of the corpus-wide quantity; the report
//! carries the probe sizes so a reading is never mistaken for a
//! corpus-complete measurement.

pub(crate) mod clump;
pub(crate) mod metric;

#[cfg(test)]
mod tests;
