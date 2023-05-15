use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};
use core::num::NonZeroU64;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::{
    plain::{location::Location, property_bag::PropertyBag},
    ArtifactLocation, CodeFlow, Fix, Graph, GraphTraversal, Level, Message,
    ReportingDescriptorReference, ResultProvenance, Stack, Suppression, WebRequest, WebResponse,
};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub enum ResultKind {
    NotApplicable,
    Pass,
    #[default]
    Fail,
    Review,
    Open,
    Informational,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub enum ResultState {
    New,
    Unchanged,
    Updated,
    Absent,
}

/// A result produced by an analysis tool.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Result<'s> {
    /// The stable, unique identifier of the rule, if any, to which this result is relevant.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub rule_id: Option<Cow<'s, str>>,

    /// The index within the tool component rules array of the rule object associated with this
    /// result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one"
        )
    )]
    pub rule_index: Option<usize>,

    /// Information about how to locate a relevant reporting descriptor.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub rule: Option<ReportingDescriptorReference<'s>>,

    /// A value that categorizes results by evaluation state.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub kind: ResultKind,

    /// A value specifying the severity level of the result.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub level: Level,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub message: Message<'s>,

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
    pub analysis_target: Option<ArtifactLocation<'s>>,

    /// The set of locations where the result was detected.
    ///
    /// Specify only one location unless the problem indicated by the result can only be corrected
    /// by making a change at every specified location.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub locations: Vec<Location<'s>>,

    /// A stable, unique identifier for the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub guid: Option<Uuid>,

    /// A stable, unique identifier for the equivalence class of logically identical results to
    /// which this result belongs.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub correlation_guid: Option<Uuid>,

    /// A positive integer specifying the number of times this logically unique result was observed
    /// in this run.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub occurrence_count: Option<NonZeroU64>,

    /// A set of strings that contribute to the stable, unique identity of the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub partial_fingerprints: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// A set of strings each of which individually defines a stable, unique identity for the
    /// result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub fingerprints: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// An array of 'stack' objects relevant to the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub stacks: Vec<Stack<'s>>,

    /// An array of 'codeFlow' objects relevant to the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub code_flows: Vec<CodeFlow<'s>>,

    /// An array of zero or more unique graph objects associated with the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub graphs: Vec<Graph<'s>>,

    /// An array of one or more unique 'graphTraversal' objects.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub graph_traversals: Vec<GraphTraversal<'s>>,

    /// A set of locations relevant to this result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub related_locations: Vec<Location<'s>>,

    /// A set of suppressions relevant to this result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub suppressions: Vec<Suppression<'s>>,

    /// The state of a result relative to a baseline of a previous run.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub baseline_state: Option<ResultState>,

    /// A number representing the priority or importance of the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::rank"
        )
    )]
    pub rank: Option<u8>,

    /// A set of artifacts relevant to the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub attachments: Vec<Suppression<'s>>,

    /// An absolute URI at which the result can be viewed.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub hosted_viewer_uri: Option<Cow<'s, str>>,

    /// The URIs of the work items associated with this result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub work_item_uris: Vec<Cow<'s, str>>,

    /// Contains information about how and when a result was detected.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub provenance: Option<ResultProvenance<'s>>,

    /// An array of 'fix' objects, each of which represents a proposed fix to the problem indicated
    /// by the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub fixes: Vec<Fix<'s>>,

    /// An array of references to taxonomy reporting descriptors that are applicable to the result.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxa: Vec<ReportingDescriptorReference<'s>>,

    /// Describes an HTTP request.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub web_request: Option<WebRequest<'s>>,

    /// Describes the response to an HTTP request.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub web_response: Option<WebResponse<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
