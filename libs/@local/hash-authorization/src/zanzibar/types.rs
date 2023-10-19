//! General types and traits used throughout the Zanzibar authorization system.

pub use self::{
    relationship::{Relationship, RelationshipFilter},
    resource::{Resource, ResourceFilter},
    subject::{Subject, SubjectFilter},
};

mod relationship;
mod resource;
mod subject;

use std::borrow::Cow;

use serde::{Deserialize, Serialize};

/// The relation or permission of a [`Subject`] to another [`Resource`].
pub trait Affiliation<O: Resource> {}

impl<O: Resource> Affiliation<O> for ! {}

/// A computed set of [`Subject`]s for another particular [`Resource`].
pub trait Permission<O: Resource>: Affiliation<O> {}

/// Encapsulates the relationship between an [`Resource`] and a [`Subject`].
pub trait Relation<O: Resource>: Affiliation<O> {}

/// Provide causality metadata between Write and Check requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Zookie<'t>(Cow<'t, str>);

impl Zookie<'_> {
    pub(crate) const fn empty() -> Self {
        Self(Cow::Borrowed(""))
    }
}

/// Specifies the desired consistency level on a per-request basis.
///
/// This allows for the API consumers dynamically trade-off less fresh data for more performance
/// when possible.
#[derive(Debug, Copy, Clone)]
pub enum Consistency<'z> {
    /// Attempts to minimize the latency of the API call, using whatever caches are available.
    ///
    /// > ## Warning
    /// >
    /// > If used exclusively, this can lead to a window of time where the New Enemy Problem can
    /// > occur.
    MinimalLatency,
    /// Ensures that all data used for computing the response is at least as fresh as the
    /// point-in-time specified in the [`Zookie`].
    ///
    /// If newer information is available, it will be used.
    AtLeastAsFresh(&'z Zookie<'z>),
    /// Ensures that all data used for computing the response is that found at the exact
    /// point-in-time specified in the [`Zookie`].
    ///
    /// If the snapshot is not available, an error will be raised.
    AtExactSnapshot(&'z Zookie<'z>),
    /// Ensure that all data used is fully consistent with the latest data available within the
    /// SpiceDB datastore.
    ///
    /// Note that the snapshot used will be loaded at the beginning of the API call, and that new
    /// data written after the API starts executing will be ignored.
    ///
    /// > ## Warning
    /// >
    /// > Use of `FullyConsistent` means little caching will be available, which means performance
    /// > will suffer. Only use if a [`Zookie`] is not available or absolutely latest information
    /// > is required.
    FullyConsistent,
}
