//! Permission-filtered generation snapshot inputs.
//!
//! Store-backed extraction supplies permission results from the existing graph
//! store APIs. This module keeps admission pure: a link is exposed to later
//! geometry only when its selected link edition, both selected endpoint
//! editions, and every required entity-type record are visible.

mod admit;
mod error;
mod permission;

pub(crate) use self::{
    admit::{AuthorizedLink, EntityAtEdition, LinkCandidate, LinkRejection, authorize_link},
    error::SnapshotError,
    permission::{AuthorizedSnapshot, LinkRejectionCounts, authorize_snapshot},
};

#[cfg(test)]
mod tests;
