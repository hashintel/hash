use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// Identifies a particular toolComponent object, either the driver or an extension.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ToolComponentReference<'s> {
    /// The [`name`] property of the referenced [`ToolComponent`].
    ///
    /// [`name`]: crate::schema::ToolComponent::name
    /// [`ToolComponent`]: crate::schema::ToolComponent
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub name: Option<Cow<'s, str>>,

    /// An index into the referenced toolComponent in tool.extensions.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub index: Option<usize>,

    /// The [`guid`] property of the referenced [`ToolComponent`].
    ///
    /// [`guid`]: crate::schema::ToolComponent::guid
    /// [`ToolComponent`]: crate::schema::ToolComponent
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub rank: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
