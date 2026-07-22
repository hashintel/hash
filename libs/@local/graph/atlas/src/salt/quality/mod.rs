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

#[cfg(feature = "bench")]
pub mod bench;
pub(crate) mod clump;
pub(crate) mod metric;
pub(crate) mod probe;
pub(crate) mod report;
pub(crate) mod runner;

#[cfg(test)]
mod tests;
