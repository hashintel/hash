#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{
    plain::{property_bag::PropertyBag, ArtifactLocation, Region},
    Address,
};

/// A physical location relevant to a [`Result`].
///
/// Specifies a reference to a programming artifact together with a range of bytes or characters
/// within that artifact.
///
/// [`Result`]: crate::schema::plain::Result
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct PhysicalLocation<'s> {
    /// A physical or virtual address, or a range of addresses, in an 'addressable region' (memory
    /// or a binary file).
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub address: Address<'s>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub artifact_location: Option<ArtifactLocation<'s>>,

    /// A region within an artifact where a result was detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub region: Option<Region<'s>>,

    /// A region within an artifact where a result was detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub context_region: Option<Region<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
