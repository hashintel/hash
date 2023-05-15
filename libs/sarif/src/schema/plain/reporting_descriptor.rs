use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::plain::{
    MultiformatMessageString, PropertyBag, ReportingConfiguration, ReportingDescriptorRelationship,
};

/// Metadata that describes a specific report produced by the tool, as part of the analysis it
/// provides or its runtime reporting.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct ReportingDescriptor<'s> {
    /// A stable, opaque identifier for the report.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub id: Cow<'s, str>,

    /// An array of stable, opaque identifiers by which this report was known in some previous
    /// version of the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub deprecated_ids: Vec<Cow<'s, str>>,

    /// A unique identifier for the report in the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub guid: Option<Uuid>,

    /// An array of unique identifies in the form of a GUID by which this report was known in some
    /// previous version of the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub deprecated_guids: Vec<Uuid>,

    /// A report identifier that is understandable to an end user.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub name: Option<Cow<'s, str>>,

    /// An array of readable identifiers by which this report was known in some previous version of
    /// the analysis tool.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub deprecated_names: Vec<Cow<'s, str>>,

    /// A concise description of the report.
    ///
    /// Should be a single sentence that is understandable when visible space is limited to a
    /// single line of text.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub short_description: Option<MultiformatMessageString<'s>>,

    /// A description of the report.
    ///
    /// Should, as far as possible, provide details sufficient to enable resolution of any problem
    /// indicated by the result.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub full_description: Option<MultiformatMessageString<'s>>,

    /// A set of name/value pairs with arbitrary names.
    ///
    /// Each value is a [`MultiformatMessageString`] object, which holds message strings in plain
    /// text and (optionally) Markdown format. The strings can include placeholders, which can
    /// be used to construct a message in combination with an arbitrary number of additional
    /// string arguments.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub message_strings: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// Information about a rule or notification that can be configured at runtime.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub default_configuration: ReportingConfiguration<'s>,

    /// Provides the primary documentation for the report, useful when there is no online
    /// documentation.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub help: Option<MultiformatMessageString<'s>>,

    /// A URI where the primary documentation for the report can be found.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub help_uri: Option<Cow<'s, str>>,

    /// An array of objects that describe relationships between this reporting descriptor and
    /// others.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub relationships: Vec<ReportingDescriptorRelationship<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
