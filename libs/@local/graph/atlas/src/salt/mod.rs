//! The SALT pipeline: fitting and serving atlas generations.
//!
//! SALT turns one frozen [`Dataset`](crate::dataset::Dataset) into a
//! published atlas generation: a 2D map over the graph's entities,
//! artifacts on disk under `crate::file`'s formats, and the spatial
//! indexes serving reads from them. The stages land here as they are
//! built; `PLAN.md` at the crate root tracks the order.

// The previous pipeline generation is parked uncompiled at
// `src/salt-BAK` as reference semantics for the port.
mod embedding;
mod knn;
mod landmark;
mod policy;
mod prepare;
mod relation;
mod semantic;
