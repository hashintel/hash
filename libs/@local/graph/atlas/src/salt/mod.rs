//! The SALT pipeline, which fits and serves atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a published atlas generation:
//!
//! - a 2D map over the graph's entities
//! - artifacts on disk under `crate::file`'s formats
//! - the spatial indexes serving reads from them

pub(crate) mod adjacency;
pub(crate) mod embedding;
mod file;
pub(crate) mod fit;
pub(crate) mod importance;
pub(crate) mod knn;
pub(crate) mod ladder;
pub(crate) mod landmark;
pub(crate) mod lod;
pub(crate) mod policy;
pub(crate) mod postings;
pub(crate) mod projector;
pub(crate) mod quality;
pub(crate) mod relation;
pub(crate) mod runner;
pub(crate) mod semantic;
pub(crate) mod wire;
