use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{ArtifactLocation, PropertyBag};

/// Specifies the information necessary to retrieve a desired revision from a version control
/// system.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct VersionControlDetails<'s> {
    /// The absolute URI of the repository.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub repository_uri: Cow<'s, str>,

    /// A string that uniquely and permanently identifies the revision within the repository.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub revision_id: Option<Cow<'s, str>>,

    /// The name of a branch containing the revision.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub branch: Option<Cow<'s, str>>,

    /// A tag that has been applied to the revision.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub revision_tag: Option<Cow<'s, str>>,

    /// A Coordinated Universal Time (UTC) date and time that can be used to synchronize an
    /// enlistment to the state of the repository at that time.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub as_of_time_utc: Option<Cow<'s, str>>,

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
    pub mapped_to: Option<ArtifactLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
