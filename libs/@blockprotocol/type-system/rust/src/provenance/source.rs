use time::OffsetDateTime;
use url::Url;

use crate::knowledge::entity::EntityId;

/// The type of source material which was used to produce a value.
// This enumeration is expected to grow over time, thus it's marked as non-exhaustive.
// To generate the OpenAPI specs pass `--write-openapi-specs` when running the HASH Graph server.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
#[non_exhaustive]
pub enum SourceType {
    Webpage,
    Document,
    Integration,
}

/// A location where the source material can be found.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Location {
    /// A string containing the name of the location.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// A string containing a valid relative or absolute URI.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Url"))]
    pub uri: Option<Url>,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// The source material used in producing a value.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceProvenance {
    /// The type of source material.
    #[serde(rename = "type")]
    pub ty: SourceType,

    /// The entity Id of the HASH entity that mirrors the source.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<EntityId>,

    /// The people or organizations that authored the material.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,

    /// The location the material was retrieved from.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,

    /// The datetime at which the material was first published.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "hash_codec::serde::time::option"
    )]
    pub first_published: Option<OffsetDateTime>,

    /// The datetime at which the material was last updated.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "hash_codec::serde::time::option"
    )]
    pub last_updated: Option<OffsetDateTime>,

    /// The datetime at which the material was retrieved from its location.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "hash_codec::serde::time::option"
    )]
    pub loaded_at: Option<OffsetDateTime>,
}
