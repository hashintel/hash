//! SALT generation, incremental placement, and atlas publication.
//!
//! SALT builds one immutable atlas generation from a permission-filtered graph
//! snapshot. A generation binds its inputs, learned policy, semantic graph,
//! projector, coordinates, indexes, and release evidence by content hash. New
//! graph data is represented by revisioned delta state so base coordinates stay
//! immutable between major generations.
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

mod card;
mod classifier;
mod hash;
mod identity;
mod policy;
mod representation;
mod revision;
mod simd;
mod storage;
mod strength;
