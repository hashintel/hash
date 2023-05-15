use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{ExternalPropertyFileReference, PropertyBag};

/// References to external property files that should be inlined with the content of a root log
/// file.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ExternalPropertyFileReferences<'s> {
    /// Contains information that enables a SARIF consumer to locate the external property file
    /// that contains the value of an externalized property associated with the run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub conversion: Option<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing a run.graphs object to be merged with the
    /// root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub graphs: Vec<ExternalPropertyFileReference<'s>>,

    /// Contains information that enables a SARIF consumer to locate the external property file
    /// that contains the value of an externalized property associated with the run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub external_properties: Option<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.artifacts arrays to be merged with the
    /// root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub artifacts: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.invocations arrays to be merged with the
    /// root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub invocations: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.logicalLocations arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub logical_locations: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.threadFlowLocations arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub thread_flow_locations: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.results arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub results: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.taxonomies arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxonomies: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.addresses arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub addresses: Vec<ExternalPropertyFileReference<'s>>,

    /// Contains information that enables a SARIF consumer to locate the external property file
    /// that contains the value of an externalized property associated with the run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        ),
    )]
    pub driver: Option<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.extensions arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub extensions: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.policies arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub policies: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.translations arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub translations: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.requests arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub web_requests: Vec<ExternalPropertyFileReference<'s>>,

    /// An array of external property files containing run.responses arrays to be merged
    /// with the root log file.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub web_responses: Vec<ExternalPropertyFileReference<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
