//! Offline fitting and artifact construction for atlas generations.
//!
//! [`fit`] builds a 2D map and its spatial indexes from a [`Dataset`](crate::dataset::Dataset),
//! publishing artifacts in [`crate::file`]'s formats for `crate::serve`. The input must provide
//! the consistent view required by the dataset contract. [`runner`] connects datasets and embedding
//! providers to fitting and report generation.

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
