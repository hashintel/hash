use alloc::{borrow::Cow, collections::BTreeMap};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, ArtifactContent};

/// Describes the response to an HTTP request.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct WebResponse<'s> {
    /// The index within the run.webResponses array of the response object associated with this
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

    /// The response protocol.
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

    /// The response version.
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

    /// The response status code.
    ///
    /// Example: 451.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub status_code: Option<u16>,

    /// The response reason.
    ///
    /// Example: 'Not found'.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub reason_phrase: Option<Cow<'s, str>>,

    /// The response headers.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub headers: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// Represents the contents of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub body: ArtifactContent<'s>,

    /// Specifies whether a response was received from the server.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub no_response_received: bool,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl WebResponse<'_> {
    pub(crate) fn is_empty(&self) -> bool {
        self.index.is_none()
            && self.protocol.is_none()
            && self.version.is_none()
            && self.status_code.is_none()
            && self.reason_phrase.is_none()
            && self.headers.is_empty()
            && self.body.is_empty()
            && !self.no_response_received
            && self.properties.is_empty()
    }
}
