use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{
    property_bag::PropertyBag, ArtifactLocation, Message, Rectangle, Region,
};

/// An artifact relevant to a result.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Attachment<'s> {
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

    /// Specifies the location of the attachment.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub artifact_location: ArtifactLocation<'s>,

    /// An array of regions of interest within the attachment.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub regions: Vec<Region<'s>>,

    /// An array of rectangles specifying areas of interest within the image.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub rectangles: Vec<Rectangle<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
