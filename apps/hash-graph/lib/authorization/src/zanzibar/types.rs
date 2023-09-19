//! General types and traits used throughout the Zanzibar authorization system.

use core::fmt;
use std::{borrow::Cow, fmt::Display};

use serde::{Deserialize, Serialize};

/// The relation or permission of a [`Resource`] to another [`Resource`].
pub trait Affiliation<R: Resource + ?Sized>: AsRef<str> {}

/// A computed set of [`Resource`]s for another particular [`Resource`].
pub trait Permission<R: Resource + ?Sized>: Affiliation<R> {}

/// Encapsulates the relationship between two [`Resource`]s.
pub trait Relation<R: Resource + ?Sized>: Affiliation<R> {}

pub trait Tuple {
    type Object: Resource;
    type User: Resource;

    fn object_id(&self) -> &<Self::Object as Resource>::Id;
    fn affiliation(&self) -> &str;
    fn user_id(&self) -> &<Self::User as Resource>::Id;
    fn user_set(&self) -> Option<&str>;
}

impl<O, A, U> Tuple for (O, A, U)
where
    O: Resource,
    A: Affiliation<O>,
    U: Resource,
{
    type Object = O;
    type User = U;

    fn object_id(&self) -> &O::Id {
        self.0.id()
    }

    fn affiliation(&self) -> &str {
        self.1.as_ref()
    }

    fn user_id(&self) -> &U::Id {
        self.2.id()
    }

    fn user_set(&self) -> Option<&str> {
        None
    }
}

impl<O, A, U, UA> Tuple for (O, A, U, UA)
where
    O: Resource,
    A: Affiliation<O>,
    U: Resource,
    UA: Affiliation<U>,
{
    type Object = O;
    type User = U;

    fn object_id(&self) -> &O::Id {
        self.0.id()
    }

    fn affiliation(&self) -> &str {
        self.1.as_ref()
    }

    fn user_id(&self) -> &U::Id {
        self.2.id()
    }

    fn user_set(&self) -> Option<&str> {
        Some(self.3.as_ref())
    }
}

/// Represent a unique entity that is being modelled.
///
/// `Resource`s are composed of a namespace and an unique identifier and often displayed as those
/// two values separated by a colon.
pub trait Resource {
    /// The unique identifier for this `Resource`.
    type Id: Serialize + Display + ?Sized;

    /// Returns the namespace for this `Resource`.
    fn namespace() -> &'static str;

    /// Returns the unique identifier for this `Resource`.
    fn id(&self) -> &Self::Id;
}

/// An untyped [`Tuple`] that only holds it's string representation.
///
/// This is useful for when the tuple types are not known at compile-time, e.g. when parsing a
/// [`Tuple`] from a string.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct UntypedTuple<'t> {
    pub object_namespace: Cow<'t, str>,
    pub object_id: Cow<'t, str>,
    pub affiliation: Cow<'t, str>,
    pub user_namespace: Cow<'t, str>,
    pub user_id: Cow<'t, str>,
    pub user_set: Option<Cow<'t, str>>,
}

impl UntypedTuple<'_> {
    #[must_use]
    pub fn into_owned(self) -> UntypedTuple<'static> {
        UntypedTuple {
            object_namespace: Cow::Owned(self.object_namespace.into_owned()),
            object_id: Cow::Owned(self.object_id.into_owned()),
            affiliation: Cow::Owned(self.affiliation.into_owned()),
            user_namespace: Cow::Owned(self.user_namespace.into_owned()),
            user_id: Cow::Owned(self.user_id.into_owned()),
            user_set: self.user_set.map(|cow| Cow::Owned(cow.into_owned())),
        }
    }
}

impl fmt::Display for UntypedTuple<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "{}:{}#{}@{}:{}",
            self.object_namespace,
            self.object_id,
            self.affiliation,
            self.user_namespace,
            self.user_id
        )?;
        if let Some(affiliation) = &self.user_set {
            write!(fmt, "#{affiliation}")?;
        }
        Ok(())
    }
}

impl<'t> UntypedTuple<'t> {
    #[must_use]
    pub fn from_tuple<T: Tuple>(tuple: &'t T) -> Self {
        Self {
            object_namespace: Cow::Borrowed(<T::Object as Resource>::namespace()),
            object_id: Cow::Owned(tuple.object_id().to_string()),
            affiliation: Cow::Borrowed(tuple.affiliation()),
            user_namespace: Cow::Borrowed(<T::User as Resource>::namespace()),
            user_id: Cow::Owned(tuple.user_id().to_string()),
            user_set: tuple.user_set().map(Cow::Borrowed),
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
