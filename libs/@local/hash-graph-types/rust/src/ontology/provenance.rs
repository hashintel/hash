#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::IsNull;
#[cfg(feature = "postgres")]
use postgres_types::Json;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
#[cfg(feature = "postgres")]
use postgres_types::Type;
use serde::{Deserialize, Serialize};

use crate::{
    account::{EditionArchivedById, EditionCreatedById},
    knowledge::entity::{ActorType, OriginProvenance, SourceProvenance},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyProvenance {
    pub edition: OntologyEditionProvenance,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvidedOntologyEditionProvenance {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceProvenance>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_type: Option<ActorType>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<OriginProvenance>,
}

impl ProvidedOntologyEditionProvenance {
    #[must_use]
    #[expect(clippy::unused_self, clippy::missing_const_for_fn)]
    pub fn is_empty(&self) -> bool {
        true
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
