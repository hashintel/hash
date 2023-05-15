#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::{ArtifactLocation, PropertyBag};

/// Contains information that enables a SARIF consumer to locate the external property file that
/// contains the value of an externalized property associated with the run.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ExternalPropertyFileReference<'s> {
    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::serde::optional")
    )]
    pub location: Option<ArtifactLocation<'s>>,

    /// A stable, unique identifier for the external property file in the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::serde::optional")
    )]
    pub guid: Option<Uuid>,

    /// A non-negative integer specifying the number of items contained in the external property
    /// file.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub item_count: Option<usize>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
