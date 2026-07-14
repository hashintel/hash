//! Canonical coordinate indexes and immutable base artifacts.

mod error;
mod importance;
mod morton;

pub(crate) use self::{
    error::ImportanceError,
    importance::{
        CoordinateBounds, ImportanceConfig, ImportanceInput, RankedPoint, rank_importance,
    },
    morton::MortonKey,
};

#[cfg(test)]
mod tests;
