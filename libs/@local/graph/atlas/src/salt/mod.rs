//! SALT canonical generation and atlas publication.
//!
//! SALT builds one immutable atlas generation from a permission-filtered graph
//! snapshot. A generation binds its inputs, learned policy, semantic graph,
//! projector, coordinates, indexes, and release evidence by content hash.
//! Revision identities distinguish immutable base and delta domains; the
//! current reader admits only `BaseRevision(0)` with `DeltaRevision(0)` and
//! rejects mutation rather than presenting incomplete incremental semantics.
//!
//! The implementation keeps three identity domains distinct:
//!
//! - graph [`EntityId`] values are durable external identities;
//! - generation row identifiers remain stable for one generation;
//! - artifact ordinals are dense, local indexes whose meaning is fixed by an explicit identity map.
//!
//! Generation candidates are written to immutable storage and become visible
//! only through a separate compare-and-swap activation. This prevents a
//! partially written or ungated candidate from becoming the active atlas.
//!
//! [`EntityId`]: type_system::knowledge::entity::id::EntityId

mod activation;
mod alignment;
mod analytic;
#[cfg(feature = "salt-benchmarks")]
pub mod benchmark;
mod card;
mod classifier;
mod embedding;
mod evaluation;
mod format;
mod generation;
mod graph;
mod hash;
mod identity;
mod landmark;
mod manifest;
mod materialize;
mod policy;
mod projector;
mod relation;
mod release;
mod representation;
mod revision;
mod simd;
mod snapshot;
mod storage;
mod strength;
