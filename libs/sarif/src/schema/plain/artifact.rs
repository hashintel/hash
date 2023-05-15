use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::plain::{property_bag::PropertyBag, ArtifactContent, ArtifactLocation, Message};

#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub enum ArtifactRole {
    AnalysisTarget,
    Attachment,
    ResponseFile,
    ResultFile,
    StandardStream,
    TracedFile,
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Uncontrolled,
    Driver,
    Extension,
    Translation,
    Taxonomy,
    Policy,
    ReferencedOnCommandLine,
    MemoryContents,
    Directory,
    UserSpecifiedConfiguration,
    ToolSpecifiedConfiguration,
    DebugOutputFile,
}

/// A single artifact. In some cases, this artifact might be nested within another artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Artifact<'s> {
    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub description: Option<Message<'s>>,

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
    pub location: Option<ArtifactLocation<'s>>,

    /// Identifies the index of the immediate parent of the artifact, if this artifact is nested.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub parent_index: Option<usize>,

    /// The offset in bytes of the artifact within its containing artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub offset: Option<usize>,

    /// The length of the artifact in bytes.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "crate::serde::default_minus_one",
        )
    )]
    pub length: Option<usize>,

    /// The role or roles played by the artifact in the analysis.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub roles: Vec<ArtifactRole>,

    /// The MIME type ([RFC 2045]) of the artifact.
    ///
    /// [RFC 2045]: https://tools.ietf.org/html/rfc2045
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub mime_type: Option<Cow<'s, str>>,

    /// Represents the contents of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "ArtifactContent::is_empty")
    )]
    pub contents: ArtifactContent<'s>,

    /// Specifies the encoding for an artifact object that refers to a text file.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub encoding: Option<Cow<'s, str>>,

    /// Specifies the source language for any artifact object that refers to a text file that
    /// contains source code.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub source_language: Option<Cow<'s, str>>,

    /// A dictionary, each of whose keys is the name of a hash function and each of whose values is
    /// the hashed value of the artifact produced by the specified hash function.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub hashes: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// The Coordinated Universal Time (UTC) date and time at which the artifact was most recently
    /// modified.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub last_modified_time_utc: Option<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
