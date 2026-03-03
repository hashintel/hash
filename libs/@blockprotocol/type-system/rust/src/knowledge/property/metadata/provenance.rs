#[cfg(feature = "postgres")]
use core::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};

use crate::provenance::SourceProvenance;

#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyProvenance {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceProvenance>,
}

impl PropertyProvenance {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.sources.is_empty()
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyProvenance {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn from_sql_null(_: &Type) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::default())
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyProvenance {
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
