use alloc::{borrow::Cow, collections::BTreeMap};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, ArtifactContent};

/// Describes an HTTP request.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct WebRequest<'s> {
    /// The index within the run.webRequests array of the request object associated with this
    /// result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub index: Option<usize>,

    /// The request protocol.
    ///
    /// Example: "http".
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub protocol: Option<Cow<'s, str>>,

    /// The request version.
    ///
    /// Example: "1.1".
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub version: Option<Cow<'s, str>>,

    /// The target of the request.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub target: Option<Cow<'s, str>>,

    /// The HTTP method.
    ///
    /// Well-known values are "GET", "PUT", "POST", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE",
    /// "CONNECT".
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub method: Option<Cow<'s, str>>,

    /// The request headers.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub headers: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// The request parameters.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub parameters: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// Represents the contents of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub body: ArtifactContent<'s>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl WebRequest<'_> {
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.index.is_none()
            && self.protocol.is_none()
            && self.version.is_none()
            && self.target.is_none()
            && self.method.is_none()
            && self.headers.is_empty()
            && self.parameters.is_empty()
            && self.body.is_empty()
            && self.properties.is_empty()
    }
}
