use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::{
    plain::{LogicalLocation, Result, Tool},
    Address, Artifact, ArtifactLocation, Conversion, ExternalPropertyFileReferences, Invocation,
    PropertyBag, RunAutomationDetails, SpecialLocation, ThreadFlowLocation, ToolComponent,
    VersionControlDetails, WebRequest, WebResponse,
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub enum ColumnKind {
    Utf16CodeUnits,
    UnicodeCodePoints,
}

/// Describes a single run of an analysis tool, and contains the reported output of that run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
#[non_exhaustive]
pub struct Run<'s> {
    /// Information about the tool or tool pipeline that generated the results in this run
    ///
    /// A run can only contain results produced by a single tool or tool pipeline. A run can
    /// aggregate results from multiple log files, as long as context around the tool run (tool
    /// command-line arguments and the like) is identical for all aggregated files.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub tool: Tool<'s>,

    /// Describes the invocation of the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub invocations: Vec<Invocation<'s>>,

    /// Describes how a converter transformed the output of a static analysis tool from the
    /// analysis tool's native output format into the SARIF format.
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

    /// The language of the messages emitted into the log file during this run (expressed as an ISO
    /// 639-1 two-letter lowercase culture code) and an optional region (expressed as an ISO 3166-1
    /// two-letter uppercase subculture code associated with a country or region). The casing is
    /// recommended but not required (in order for this data to conform to RFC5646).
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub language: Option<Cow<'s, str>>,

    /// Specifies the revision in version control of the artifacts that were scanned.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub version_control_provenance: Vec<VersionControlDetails<'s>>,

    /// The artifact location specified by each uriBaseId symbol on the machine where the tool
    /// originally ran.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub original_uri_base_ids: BTreeMap<Cow<'s, str>, ArtifactLocation<'s>>,

    /// An array of artifact objects relevant to the run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub artifacts: Vec<Artifact<'s>>,

    /// An array of logical locations such as namespaces, types or functions.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub logical_locations: Vec<LogicalLocation<'s>>,

    /// An array of zero or more unique graph objects associated with the run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub graphs: Vec<LogicalLocation<'s>>,

    /// The set of results contained in an SARIF log. The results array can be omitted when a run
    /// is solely exporting rules metadata. It must be present (but may be empty) if a log file
    /// represents an actual scan.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub results: Vec<Result<'s>>,

    /// Information that describes a run's identity and role within an engineering system process.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub automation_details: Option<RunAutomationDetails<'s>>,

    /// Automation details that describe the aggregate of runs to which this run belongs.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub run_aggregates: Vec<RunAutomationDetails<'s>>,

    /// The 'guid' property of a previous SARIF 'run' that comprises the baseline that was used to
    /// compute result 'baselineState' properties for the run.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub baseline_guid: Option<Uuid>,

    /// An array of strings used to replace sensitive information in a redaction-aware property.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub redaction_tokens: Vec<Cow<'s, str>>,

    /// Specifies the default encoding for any artifact object that refers to a text file.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub default_encoding: Option<Cow<'s, str>>,

    /// Specifies the default source language for any artifact object that refers to a text file
    /// that contains source code.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub default_source_language: Option<Cow<'s, str>>,

    /// An ordered list of character sequences that were treated as line breaks when computing
    /// region information for the run.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub newline_sequences: Vec<Cow<'s, str>>,

    /// Specifies the unit in which the tool measures columns.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub column_kind: Option<ColumnKind>,

    /// References to external property files that should be inlined with the content of a root log
    /// file.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub external_property_file_references: Option<ExternalPropertyFileReferences<'s>>,

    /// An array of threadFlowLocation objects cached at run level.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub thread_flow_locations: Vec<ThreadFlowLocation<'s>>,

    /// An array of toolComponent objects relevant to a taxonomy in which results are categorized.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxonomies: Vec<ToolComponent<'s>>,

    /// Addresses associated with this run instance, if any.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub addresses: Vec<Address<'s>>,

    /// The set of available translations of the localized data provided by the tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub translations: Vec<ToolComponent<'s>>,

    /// Contains configurations that may potentially override both
    /// reportingDescriptor.defaultConfiguration (the tool's default severities) and
    /// invocation.configurationOverrides (severities established at run-time from the command
    /// line).
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub policies: Vec<ToolComponent<'s>>,

    /// An array of request objects cached at run level.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub web_requests: Vec<WebRequest<'s>>,

    /// An array of response objects cached at run level.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub web_responses: Vec<WebResponse<'s>>,

    /// Defines locations of special significance to SARIF consumers.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub special_locations: Option<SpecialLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
