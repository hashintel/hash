use time::OffsetDateTime;
use url::Url;

use crate::knowledge::entity::EntityId;

/// The type of source material which was used to produce a value.
// This enumeration is expected to grow over time, thus it's marked as non-exhaustive.
// To generate the OpenAPI specs pass `--write-openapi-specs` when running the HASH Graph server.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "schemars",
    derive(schemars::JsonSchema),
    schemars(description = "The kind of material that data was produced from.")
)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
#[non_exhaustive]
pub enum SourceType {
    Webpage,
    Document,
    Integration,
}

/// Where the material came from.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Location {
    /// The name of the place.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[cfg_attr(feature = "schemars", schemars(with = "String", length(max = crate::provenance::validation::MAX_SHORT_TEXT_LENGTH)))]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub name: Option<String>,

    /// The URI the material was retrieved from.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            with = "String",
            description = "The `http` or `https` URI the material was retrieved from.",
            extend("format" = "uri"),
            length(max = crate::provenance::validation::MAX_LONG_TEXT_LENGTH)
        )
    )]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Url"))]
    pub uri: Option<Url>,

    /// A description of the place for a reader.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[cfg_attr(feature = "schemars", schemars(with = "String", length(max = crate::provenance::validation::MAX_LONG_TEXT_LENGTH)))]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<String>,
}

/// Material that data was produced from.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "schemars",
    derive(schemars::JsonSchema),
    schemars(rename = "Source")
)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceProvenance {
    /// The kind of material.
    #[serde(rename = "type")]
    pub ty: SourceType,

    /// The entity in HASH that stands for the material.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            with = "String",
            description = "The entity in HASH that stands for the material: its web ID and UUID, \
                           joined by `~`. A request may not name a draft.",
            example = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d"
        )
    )]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub entity_id: Option<EntityId>,

    /// The people or organizations that wrote the material.
    #[cfg_attr(feature = "schemars", schemars(inner(length(max = crate::provenance::validation::MAX_SHORT_TEXT_LENGTH))))]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,

    /// Where the material came from.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[cfg_attr(feature = "schemars", schemars(with = "Location"))]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub location: Option<Location>,

    /// When the material was first published.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[cfg_attr(
        feature = "schemars",
        schemars(with = "String", extend("format" = "date-time"))
    )]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::time::non_null",
        serialize_with = "hash_codec::serde::time::option::serialize",
        skip_serializing_if = "Option::is_none"
    )]
    pub first_published: Option<OffsetDateTime>,

    /// When the material was last changed.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[cfg_attr(
        feature = "schemars",
        schemars(with = "String", extend("format" = "date-time"))
    )]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::time::non_null",
        serialize_with = "hash_codec::serde::time::option::serialize",
        skip_serializing_if = "Option::is_none"
    )]
    pub last_updated: Option<OffsetDateTime>,

    /// When the material was retrieved.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
    #[cfg_attr(
        feature = "schemars",
        schemars(with = "String", extend("format" = "date-time"))
    )]
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::time::non_null",
        serialize_with = "hash_codec::serde::time::option::serialize",
        skip_serializing_if = "Option::is_none"
    )]
    pub loaded_at: Option<OffsetDateTime>,
}
