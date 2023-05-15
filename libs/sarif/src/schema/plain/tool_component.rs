use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::plain::{
    MultiformatMessageString, PropertyBag, ReportingDescriptor, ToolComponentReference,
    TranslationMetadata,
};

/// A component, such as a plug-in or the driver, of the analysis tool that was run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct ToolComponent<'s> {
    /// A unique identifier for the tool component in the form of a GUID.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub guid: Option<Uuid>,

    /// The name of the tool component.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub name: Cow<'s, str>,

    /// The organization or company that produced the tool component.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub organization: Option<Cow<'s, str>>,

    /// A product suite to which the tool component belongs.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub product: Option<Cow<'s, str>>,

    /// A localizable string containing the name of the suite of products to which the tool
    /// component belongs.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub product_suite: Option<Cow<'s, str>>,

    /// A message string or message format string rendered in multiple formats.
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

    /// A message string or message format string rendered in multiple formats.
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

    /// The name of the tool component along with its version and any other useful identifying
    /// information, such as its locale.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub full_name: Option<Cow<'s, str>>,

    /// The tool component version, in whatever format the component natively provides.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub version: Option<Cow<'s, str>>,

    /// The tool component version in the format specified by Semantic Versioning 2.0.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub semantic_version: Option<semver::Version>,

    /// The binary version of the tool component's primary executable file expressed as four
    /// non-negative integers separated by a period (for operating systems that express file
    /// versions in this way).
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub dotted_quad_file_version: Option<Cow<'s, str>>,

    /// A string specifying the UTC date (and optionally, the time) of the component's release.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub release_date_utc: Option<Cow<'s, str>>,

    /// The absolute URI from which the tool component can be downloaded.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub download_uri: Option<Cow<'s, str>>,

    /// The absolute URI at which information about this version of the tool component can be
    /// found.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub information_uri: Option<Cow<'s, str>>,

    /// A dictionary, each of whose keys is a resource identifier and each of whose values is a
    /// multiformatMessageString object, which holds message strings in plain text and (optionally)
    /// Markdown format. The strings can include placeholders, which can be used to construct a
    /// message in combination with an arbitrary number of additional string arguments.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub global_message_strings: BTreeMap<Cow<'s, str>, MultiformatMessageString<'s>>,

    /// An array of [`ReportingDescriptor`]s relevant to the notifications related to the
    /// configuration and runtime execution of the tool component.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub notifications: Vec<ReportingDescriptor<'s>>,

    /// An array of [`ReportingDescriptor`]s relevant to the analysis performed by the tool
    /// component.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub rules: Vec<ReportingDescriptor<'s>>,

    /// An array of [`ReportingDescriptor`]s relevant to the definitions of both standalone and
    /// tool-defined taxonomies.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub taxa: Vec<ReportingDescriptor<'s>>,

    /// The language of the messages emitted into the log file during this run (expressed as an ISO
    /// 639-1 two-letter lowercase language code) and an optional region (expressed as an ISO
    /// 3166-1 two-letter uppercase subculture code associated with a country or region). The
    /// casing is recommended but not required (in order for this data to conform to RFC5646).
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

    /// The kinds of data contained in this object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub contents: Vec<Cow<'s, str>>,

    ///Specifies whether this object contains a complete definition of the localizable and/or
    /// non-localizable data for this component, as opposed to including only data that is relevant
    /// to the results persisted to this log file.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub is_comprehensive: bool,

    /// The semantic version of the localized strings defined in this component; maintained by
    /// components that provide translations.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub localized_data_semantic_version: Option<semver::Version>,

    /// The minimum value of localizedDataSemanticVersion required in translations consumed by this
    /// component; used by components that consume translations.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub minimum_required_localized_data_semantic_version: Option<semver::Version>,

    /// Identifies a particular toolComponent object, either the driver or an extension.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "crate::serde::is_default")
    )]
    pub component_id: ToolComponentReference<'s>,

    /// Provides additional metadata related to translation.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub translation_metadata: Option<TranslationMetadata<'s>>,

    /// An array of toolComponentReference objects to declare the taxonomies supported by the tool
    /// component.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub supported_taxonomies: Vec<ToolComponentReference<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
