use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, Message};

/// Specifies the location of an artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ArtifactLocation<'s> {
    /// A string containing a valid relative or absolute URI.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub uri: Option<Cow<'s, str>>,

    /// A string which indirectly specifies the absolute URI with respect to which a relative URI
    /// in the "uri" property is interpreted.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub uri_base_id: Option<Cow<'s, str>>,

    /// The index within the run artifacts array of the artifact object associated with the
    /// artifact location.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub index: Option<usize>,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub description: Option<Message<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
