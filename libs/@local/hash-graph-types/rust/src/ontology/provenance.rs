use std::error::Error;

use bytes::BytesMut;
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};

use crate::account::{EditionArchivedById, EditionCreatedById};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyProvenanceMetadata {
    pub edition: OntologyEditionProvenanceMetadata,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UserOntologyEditionProvenanceMetadata {
    /// This field is only used to generate a TS type.
    #[serde(default, rename = "__placeholder")]
    __placeholder: (),
}

impl UserOntologyEditionProvenanceMetadata {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        true
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyEditionProvenanceMetadata {
    pub created_by_id: EditionCreatedById,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<EditionArchivedById>,
    #[serde(flatten)]
    pub user_defined: UserOntologyEditionProvenanceMetadata,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyEditionProvenanceMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for OntologyEditionProvenanceMetadata {
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
