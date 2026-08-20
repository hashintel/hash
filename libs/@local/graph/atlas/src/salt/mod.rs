//! The SALT pipeline, which fits and serves atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a published atlas generation:
//!
//! - a 2D map over the graph's entities
//! - artifacts on disk under `crate::file`'s formats
//! - the spatial indexes serving reads from them

pub(crate) mod adjacency;
pub(crate) mod embedding;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod fit;
pub(crate) mod importance;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod knn;
// Crate-visible for the metadata document's ladder evidence.
pub(crate) mod ladder;
pub(crate) mod landmark;
// Crate-visible for the serving surface's schedule reads.
pub(crate) mod lod;
pub(crate) mod policy;
// Crate-visible for the serving surface's TYPE_MASK reads.
pub(crate) mod postings;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod projector;
pub(crate) mod quality;
pub(crate) mod relation;
// Crate-visible for the root `bench` facade's re-exports.
pub(crate) mod runner;
pub(crate) mod semantic;
// Crate-visible for the serving surface's response assembly.
mod vector;
pub(crate) mod wire;
