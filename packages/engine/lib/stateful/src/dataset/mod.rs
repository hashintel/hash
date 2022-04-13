//! Immutable, arbitrary data accessible to all agents.
//!
//! For a high-level concept of datasets, please see the [HASH documentation].
//!
//! In comparison to [`Globals`], a [`Dataset`] is stored in a memory [`Segment`] and can be
//! constructed from a [`SharedDataset`].
//!
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/datasets
//! [`Globals`]: crate::globals::Globals
//! [`Segment`]: memory::shared_memory::Segment

mod segment;
mod shared;

pub use self::{segment::Dataset, shared::SharedDataset};
