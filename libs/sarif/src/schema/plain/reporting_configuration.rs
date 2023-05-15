#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{Level, PropertyBag};

/// Information about a rule or notification that can be configured at runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ReportingConfiguration<'s> {
    /// Specifies whether the report may be produced during the scan.
    #[cfg_attr(
        feature = "serde",
        serde(
            default = "crate::serde::default_true",
            skip_serializing_if = "crate::serde::is_true"
        )
    )]
    pub enabled: bool,

    /// Specifies the failure level for the report.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub level: Level,

    /// Specifies the relative priority of the report.
    ///
    /// Used for analysis output only.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::rank"
        )
    )]
    pub rank: Option<u8>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}

impl Default for ReportingConfiguration<'_> {
    fn default() -> Self {
        Self {
            enabled: true,
            level: Level::Warning,
            rank: None,
            properties: PropertyBag::default(),
        }
    }
}
