//! Global, immutable data accessible to all agents.
//!
//! Both, [`Globals`] and [`Dataset`] contains immutable data. [`Globals`] is a key-value-store
//! while [`Dataset`] may contain arbitrary data structures like JSON or CSV files.

mod dataset;
mod globals;

pub use self::{
    dataset::{Dataset, SharedDataset, SharedStore},
    globals::Globals,
};
