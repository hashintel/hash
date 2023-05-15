use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{ArtifactChange, Message, PropertyBag};

/// A proposed fix for the problem represented by a result object. A fix specifies a set of
/// artifacts to modify. For each artifact, it specifies a set of bytes to remove, and provides a
/// set of new bytes to replace them.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Fix<'s> {
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

    /// One or more artifact changes that comprise a fix for a result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub artifact_changes: Vec<ArtifactChange<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
