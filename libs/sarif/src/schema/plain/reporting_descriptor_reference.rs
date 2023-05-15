use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::plain::{property_bag::PropertyBag, ToolComponentReference};

/// Information about how to locate a relevant reporting descriptor.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ReportingDescriptorReference<'s> {
    /// The id of the descriptor.
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

    /// The index into an array of descriptors in [`rules`], [`notifications`], or [`taxa`],
    /// depending on context.
    ///
    /// [`rules`]: crate::schema::ToolComponent::rules
    /// [`notifications`]: crate::schema::ToolComponent::notifications
    /// [`taxa`]: crate::schema::ToolComponent::taxa
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub index: Option<usize>,

    /// A guid that uniquely identifies the descriptor.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub guid: Option<Uuid>,

    /// Identifies a particular [`ToolComponent`] object, either the driver or an extension.
    ///
    /// [`ToolComponent`]: crate::schema::ToolComponent
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub tool_component: ToolComponentReference<'s>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
