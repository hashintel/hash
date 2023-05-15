use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::{
    Address, Artifact, Conversion, Graph, Invocation, LogicalLocation, PropertyBag, Result,
    SchemaVersion, ThreadFlowLocation, ToolComponent, WebRequest, WebResponse,
};

/// The top-level element of an external property file.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ExternalProperties<'s> {
    /// The URI of the JSON schema corresponding to the version of the external property file
    /// format.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            rename = "$schema",
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub schema: Option<Cow<'s, str>>,

    /// The SARIF format version of this external properties object.
    pub version: SchemaVersion,

    /// A stable, unique identifier for this external properties object, in the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub guid: Option<Uuid>,

    /// A stable, unique identifier for the run associated with this external properties object, in
    /// the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub run_guid: Option<Uuid>,

    /// A conversion object that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub conversion: Option<Conversion<'s>>,

    /// An array of graph objects that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub graphs: Vec<Graph<'s>>,

    /// Key/value pairs that provide additional information that will be merged with an external
    /// run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub externalized_properties: PropertyBag<'s>,

    /// An array of artifact objects that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub artifacts: Vec<Artifact<'s>>,

    /// Describes the invocation of the analysis tool that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub invocations: Vec<Invocation<'s>>,

    /// An array of logical locations such as namespaces, types or functions that will be merged
    /// with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub logical_locations: Vec<LogicalLocation<'s>>,

    /// An array of threadFlowLocation objects that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub thread_flow_locations: Vec<ThreadFlowLocation<'s>>,

    /// An array of result objects that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub results: Vec<Result<'s>>,

    /// Tool taxonomies that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxonomies: Vec<ToolComponent<'s>>,

    /// The analysis tool object that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub driver: Option<ToolComponent<'s>>,

    /// Tool extensions that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub extensions: Option<ToolComponent<'s>>,

    /// Tool policies that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub policies: Option<ToolComponent<'s>>,

    /// Tool translations that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub translations: Option<ToolComponent<'s>>,

    /// Addresses that will be merged with with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Address::is_empty")
    )]
    pub addresses: Address<'s>,

    /// Requests that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "WebRequest::is_empty")
    )]
    pub web_requests: WebRequest<'s>,

    /// Responses that will be merged with an external run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "WebResponse::is_empty")
    )]
    pub web_responses: WebResponse<'s>,

    /// Key/value pairs that provide additional information about the external properties.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
