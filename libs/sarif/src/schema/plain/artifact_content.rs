use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, MultiformatMessageString};

/// Represents the contents of an artifact.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ArtifactContent<'s> {
    /// UTF-8-encoded content from a text artifact.
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

    /// MIME Base64-encoded content from a binary artifact, or from a text artifact in its original
    /// encoding.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub binary: Option<Cow<'s, str>>,

    /// A message string or message format string rendered in multiple formats.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub rendered: Option<MultiformatMessageString<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl ArtifactContent<'_> {
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.text.is_none()
            && self.binary.is_none()
            && self.rendered.is_none()
            && self.properties.is_empty()
    }
}
