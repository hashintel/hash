use alloc::vec::Vec;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{plain::PropertyBag, ArtifactLocation, Invocation, Tool};

/// Describes how a converter transformed the output of a static analysis tool from the analysis
/// tool's native output format into the SARIF format.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Conversion<'s> {
    /// The analysis tool that was run.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub tool: Tool<'s>,

    /// The runtime environment of the analysis tool run.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub invocation: Option<Invocation<'s>>,

    /// The locations of the analysis tool's per-run log files.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub analysis_tool_log_files: Vec<ArtifactLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
