use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, ArtifactLocation, Replacement};

/// A change to a single artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ArtifactChange<'s> {
    /// Specifies the location of an artifact.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub artifact_location: ArtifactLocation<'s>,

    /// An array of replacement objects, each of which represents the replacement of a single
    /// region in a single artifact specified by [`ArtifactLocation`].
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub replacements: Vec<Replacement<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
