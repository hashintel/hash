use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{MultiformatMessageString, PropertyBag};

/// Provides additional metadata related to translation.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct TranslationMetadata<'s> {
    /// The name associated with the translation metadata.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub name: Cow<'s, str>,

    /// The full name associated with the translation metadata.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub full_name: Option<Cow<'s, str>>,

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
    pub short_description: Option<MultiformatMessageString<'s>>,

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
    pub full_description: Option<MultiformatMessageString<'s>>,

    /// The absolute URI from which the translation metadata can be downloaded.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub download_uri: Option<Cow<'s, str>>,

    /// The absolute URI from which information related to the translation metadata can be
    /// downloaded.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub information_uri: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
