use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// Encapsulates a message intended to be read by the end user.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Message<'s> {
    /// A plain text message string.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub text: Option<Cow<'s, str>>,

    /// A Markdown message string.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub markdown: Option<Cow<'s, str>>,

    /// The identifier for this message.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub id: Option<Cow<'s, str>>,

    /// An array of strings to substitute into the message string.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub arguments: Vec<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
