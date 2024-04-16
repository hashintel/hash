use std::collections::HashSet;
#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use time::OffsetDateTime;
use url::Url;
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{ObjectBuilder, OneOfBuilder, RefOr, Schema, SchemaType},
    ToSchema,
};

use crate::account::{CreatedById, EditionArchivedById, EditionCreatedById};

/// The type of source material which was used to produce a value.
// This enumeration is expected to grow over time, thus it's marked as non-exhaustive.
// To generate the OpenAPI specs pass `--write-openapi-specs` when running the HASH Graph server.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
#[non_exhaustive]
pub enum SourceType {
    Webpage,
    Document,
}

/// A location where the source material can be found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    pub uri: Option<Url>,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// The source material used in producing a value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SourceProvenance {
    /// The type of source material.
    #[serde(rename = "type")]
    pub ty: SourceType,

    /// The people or organizations that authored the material.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,

    /// The location the material was retrieved from.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,

    /// The datetime at which the material was first published.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub first_published: Option<OffsetDateTime>,

    /// The datetime at which the material was last updated.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub last_updated: Option<OffsetDateTime>,

    /// The datetime at which the material was retrieved from its location.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub loaded_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum OriginType {
    WebApp,
    MobileApp,
    BrowserExtension,
    Api,
    Flow {
        #[serde(default, skip_serializing_if = "HashSet::is_empty")]
        step_ids: HashSet<String>,
    },
    Migration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OriginProvenance {
    #[serde(rename = "type")]
    pub ty: OriginType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The origin version, in whatever format the origin natively provides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The origin version in the format specified by Semantic Versioning 2.0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_version: Option<semver::Version>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_public_id: Option<String>,
}

#[cfg(feature = "utoipa")]
impl<'__s> ToSchema<'__s> for OriginProvenance {
    fn schema() -> (&'__s str, RefOr<Schema>) {
        let common_types: [(&'static str, RefOr<Schema>); 7] = [
            (
                "id",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "version",
                RefOr::T(Schema::from(
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .description(Some(
                            "The origin version, in whatever format the origin natively
provides.",
                        )),
                )),
            ),
            (
                "semanticVersion",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "environment",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "deviceId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "sessionId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "apiKeyPublicId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
        ];

        let mut builder = OneOfBuilder::new();
        for ty in [
            "web-app",
            "mobile-app",
            "browser-extension",
            "api",
            "flow",
            "migration",
        ] {
            let mut item_builder = ObjectBuilder::new();
            item_builder = item_builder
                .property(
                    "type",
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .enum_values(Some([ty])),
                )
                .required("type");
            for (key, schema) in &common_types {
                item_builder = item_builder.property(*key, schema.clone());
            }

            if ty == "flow" {
                item_builder = item_builder.property(
                    "stepIds",
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .to_array_builder(),
                );
            }

            builder = builder.item(item_builder);
        }

        ("OriginProvenance", RefOr::T(Schema::from(builder)))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum ActorType {
    Human,
    #[serde(rename = "ai")]
    AI,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityEditionProvenance {
    pub created_by_id: EditionCreatedById,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<EditionArchivedById>,
    #[serde(flatten)]
    pub provided: ProvidedEntityEditionProvenance,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for EntityEditionProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for EntityEditionProvenance {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvidedEntityEditionProvenance {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceProvenance>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<ActorType>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<OriginProvenance>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InferredEntityProvenance {
    pub created_by_id: CreatedById,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for InferredEntityProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for InferredEntityProvenance {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityProvenance {
    // #[cfg_attr(feature = "utoipa", schema(inline))]
    #[serde(flatten)]
    pub inferred: InferredEntityProvenance,
    pub edition: EntityEditionProvenance,
}
