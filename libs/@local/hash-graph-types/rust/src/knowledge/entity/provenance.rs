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

use crate::account::{CreatedById, EditionArchivedById, EditionCreatedById};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Tool {
    /// The name of the tool.
    pub name: String,

    /// The tool version, in whatever format the tool natively provides.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// The tool version in the format specified by Semantic Versioning 2.0.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = String))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_version: Option<semver::Version>,

    /// The organization or company that produced the tool.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Artifact {
    /// The name of the tool.
    pub name: String,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Specifies the location of an artifact.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<ArtifactLocation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ArtifactLocation {
    /// A string containing a valid relative or absolute URI.
    pub uri: Url,

    /// Encapsulates a message intended to be read by the end user.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum SourceType {
    Webpage,
    Document,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SourceProvenance {
    #[serde(rename = "type")]
    pub ty: SourceType,
    pub artifact: Artifact,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_type: Option<ActorType>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub first_published: Option<OffsetDateTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub last_updated: Option<OffsetDateTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub loaded_at: Option<OffsetDateTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = Timestamp))]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::time::option"
    )]
    pub analyzed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum OriginType {
    WebApp,
    MobileApp,
    BrowserExtension,
    Api,
    Flows,
    Migration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OriginProvenance {
    #[serde(rename = "type")]
    pub ty: OriginType,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The origin version, in whatever format the origin natively provides.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The origin version in the format specified by Semantic Versioning 2.0.
    #[cfg_attr(feature = "utoipa", schema(nullable = false, value_type = String))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_version: Option<semver::Version>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_public_id: Option<String>,
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityEditionProvenanceMetadata {
    pub created_by_id: EditionCreatedById,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<EditionArchivedById>,
    #[serde(flatten)]
    pub user_defined: ProvidedEntityEditionProvenanceMetadata,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for EntityEditionProvenanceMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for EntityEditionProvenanceMetadata {
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
pub struct ProvidedEntityEditionProvenanceMetadata {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub source: Vec<SourceProvenance>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<ActorType>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<Tool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifacts: Vec<Url>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<OriginProvenance>,
}

impl ProvidedEntityEditionProvenanceMetadata {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.source.is_empty()
            && self.actor.is_none()
            && self.tools.is_empty()
            && self.artifacts.is_empty()
            && self.origin.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InferredEntityProvenanceMetadata {
    pub created_by_id: CreatedById,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for InferredEntityProvenanceMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for InferredEntityProvenanceMetadata {
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
pub struct EntityProvenanceMetadata {
    pub created_by_id: CreatedById,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    pub edition: EntityEditionProvenanceMetadata,
}
