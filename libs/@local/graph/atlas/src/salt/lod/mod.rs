//! The level-of-detail structure of one generation.
//!
//! [`stage`] derives the spatial serving columns from one generation's coordinate rows. It fits the
//! world frame and normalizes coordinates into the wire frame. It also derives Morton keys
//! ([`key`]) and an importance ranking ([`rank`]). The first-occupant [`cascade`] assigns each
//! point a minimum grid-depth bucket. [`order`] sorts every served column into the base delivery
//! order, and [`quad`] partitions that order into tile runs.
//!
//! Rebuilding requires the same coordinates, rank columns, seed, and [`stage::LodConfig`]. Ranking
//! replay also depends on identity-byte encoding and the equal-key ordering described by
//! [`rank::Ranking::new`]. [`stage::Lod::measurements`] and [`quad::QuadTree::measurements`] report
//! build statistics for calibrating the schedule.

#[cfg(feature = "bench")]
pub mod bench;
pub(crate) mod cascade;
pub(crate) mod key;
pub(crate) mod order;
pub(crate) mod quad;
pub(crate) mod rank;
pub(crate) mod stage;

#[cfg(test)]
mod tests;
