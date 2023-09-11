//! General types and traits used throughout the Zanzibar authorization system.

use core::fmt;
use std::borrow::Cow;

use serde::{Deserialize, Serialize};

/// The relation or permission of a [`Resource`] to another [`Resource`].
pub trait Affiliation<R: Resource + ?Sized>: AsRef<str> {}

/// A computed set of [`Resource`]s for another particular [`Resource`].
pub trait Permission<R: Resource + ?Sized>: Affiliation<R> {}

/// Encapsulates the relationship between two [`Resource`]s.
pub trait Relation<R: Resource + ?Sized>: Affiliation<R> {}

pub trait Tuple {
    fn resource_namespace(&self) -> &str;
    fn resource_id(&self) -> &str;
    fn affiliation(&self) -> &str;
    fn subject_namespace(&self) -> &str;
    fn subject_id(&self) -> &str;
    fn subject_set(&self) -> Option<&str>;
}

impl Tuple for UntypedTuple<'_> {
    fn resource_namespace(&self) -> &str {
        self.resource.namespace.as_ref()
    }

    fn resource_id(&self) -> &str {
        self.resource.id.as_ref()
    }

    fn affiliation(&self) -> &str {
        self.affiliation.as_ref()
    }

    fn subject_namespace(&self) -> &str {
        self.subject.namespace.as_ref()
    }

    fn subject_id(&self) -> &str {
        self.subject.id.as_ref()
    }

    fn subject_set(&self) -> Option<&str> {
        self.subject_set.as_ref().map(AsRef::as_ref)
    }
}

impl<R, A, S> Tuple for (R, A, S)
where
    R: Resource,
    A: Affiliation<R>,
    S: Resource,
{
    fn resource_namespace(&self) -> &str {
        self.0.namespace()
    }

    fn resource_id(&self) -> &str {
        self.0.id().as_ref()
    }

    fn affiliation(&self) -> &str {
        self.1.as_ref()
    }

    fn subject_namespace(&self) -> &str {
        self.2.namespace()
    }

    fn subject_id(&self) -> &str {
        self.2.id().as_ref()
    }

    fn subject_set(&self) -> Option<&str> {
        None
    }
}

impl<R, A, S, SA> Tuple for (R, A, S, SA)
where
    R: Resource,
    A: Affiliation<R>,
    S: Resource,
    SA: Affiliation<S>,
{
    fn resource_namespace(&self) -> &str {
        self.0.namespace()
    }

    fn resource_id(&self) -> &str {
        self.0.id().as_ref()
    }

    fn affiliation(&self) -> &str {
        self.1.as_ref()
    }

    fn subject_namespace(&self) -> &str {
        self.2.namespace()
    }

    fn subject_id(&self) -> &str {
        self.2.id().as_ref()
    }

    fn subject_set(&self) -> Option<&str> {
        Some(self.3.as_ref())
    }
}

/// Represent a unique entity that is being modelled.
///
/// `Resource`s are composed of a namespace and an unique identifier and often displayed as those
/// two values separated by a colon.
pub trait Resource {
    /// The unique identifier for this `Resource`.
    type Id: AsRef<str> + ?Sized;

    /// Returns the namespace for this `Resource`.
    fn namespace(&self) -> &str;

    /// Returns the unique identifier for this `Resource`.
    fn id(&self) -> &Self::Id;
}

/// A [`Resource`] that only holds the string representation of it's namespace and id.
///
/// This is useful for when the [`Id`] type is not known at compile-time, e.g. when parsing a
/// [`Tuple`] from a string.
///
/// [`Id`]: Resource::Id
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct UntypedResource<'r> {
    pub namespace: Cow<'r, str>,
    pub id: Cow<'r, str>,
}

impl UntypedResource<'_> {
    #[must_use]
    pub fn into_owned(self) -> UntypedResource<'static> {
        UntypedResource {
            namespace: Cow::Owned(self.namespace.into_owned()),
            id: Cow::Owned(self.id.into_owned()),
        }
    }
}

impl Resource for UntypedResource<'_> {
    type Id = str;

    fn namespace(&self) -> &str {
        &self.namespace
    }

    fn id(&self) -> &Self::Id {
        &self.id
    }
}

impl fmt::Display for UntypedResource<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.namespace, self.id,)
    }
}

/// An untyped [`Tuple`] that only holds it's string representation.
///
/// This is useful for when the tuple types are not known at compile-time, e.g. when parsing a
/// [`Tuple`] from a string.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct UntypedTuple<'t> {
    pub resource: UntypedResource<'t>,
    pub affiliation: Cow<'t, str>,
    pub subject: UntypedResource<'t>,
    pub subject_set: Option<Cow<'t, str>>,
}

impl UntypedTuple<'_> {
    #[must_use]
    pub fn into_owned(self) -> UntypedTuple<'static> {
        UntypedTuple {
            resource: self.resource.into_owned(),
            affiliation: Cow::Owned(self.affiliation.into_owned()),
            subject: self.subject.into_owned(),
            subject_set: self.subject_set.map(|cow| Cow::Owned(cow.into_owned())),
        }
    }
}

impl fmt::Display for UntypedTuple<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "{}#{}@{}",
            self.resource, self.affiliation, self.subject
        )?;
        if let Some(affiliation) = &self.subject_set {
            write!(fmt, "#{affiliation}")?;
        }
        Ok(())
    }
}

impl<'t> UntypedTuple<'t> {
    #[must_use]
    pub fn from_tuple(tuple: &'t impl Tuple) -> Self {
        Self {
            resource: UntypedResource {
                namespace: Cow::Borrowed(tuple.resource_namespace()),
                id: Cow::Borrowed(tuple.resource_id()),
            },
            affiliation: Cow::Borrowed(tuple.affiliation()),
            subject: UntypedResource {
                namespace: Cow::Borrowed(tuple.subject_namespace()),
                id: Cow::Borrowed(tuple.subject_id()),
            },
            subject_set: tuple.subject_set().map(Cow::Borrowed),
        }
    }
}

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
#[derive(Debug)]
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
