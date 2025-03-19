//! Ontology provenance module that contains types for tracking ownership and history
//!
//! This module provides types for managing the ownership and provenance of ontology types
//! within the Block Protocol Type System. It defines structures for:
//!
//! 1. Tracking ownership of ontology types (locally owned vs remotely fetched)
//! 2. Recording provenance information about type creation and modifications
//! 3. Managing edition-specific provenance with creator and archiver information
//!
//! These types enable complete tracking of type history and support governance of
//! the ontology across distributed systems.

#[cfg(feature = "postgres")]
use core::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use time::OffsetDateTime;

use crate::{
    provenance::{
        ActorType, EditionArchivedById, EditionCreatedById, OriginProvenance, SourceProvenance,
    },
    web::OwnedById,
};

/// Specifies whether an ontology type is owned locally or fetched from a remote source.
///
/// This enum helps track the provenance of ontology types, distinguishing between:
/// - Types that are created and owned by the local system
/// - Types that have been fetched from external sources
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum OntologyOwnership {
    /// The ontology type is owned by the specified web.
    #[serde(rename_all = "camelCase")]
    Local {
        /// The ID of the web that owns this ontology type locally
        owned_by_id: OwnedById,
    },

    /// The ontology type was fetched from a remote source.
    #[serde(rename_all = "camelCase")]
    Remote {
        /// Timestamp when the ontology type was fetched from the remote source
        #[serde(with = "hash_codec::serde::time")]
        #[cfg_attr(target_arch = "wasm32", tsify(type = "Timestamp"))]
        fetched_at: OffsetDateTime,
    },
}
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyProvenance {
    pub edition: OntologyEditionProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvidedOntologyEditionProvenance {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceProvenance>,
    pub actor_type: ActorType,
    pub origin: OriginProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyEditionProvenance {
    pub created_by_id: EditionCreatedById,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<EditionArchivedById>,
    #[serde(flatten)]
    pub user_defined: ProvidedOntologyEditionProvenance,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyEditionProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for OntologyEditionProvenance {
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
