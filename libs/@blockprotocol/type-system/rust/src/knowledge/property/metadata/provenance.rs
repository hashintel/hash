#[cfg(feature = "postgres")]
use core::error::Error;

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, Json, Type};

use crate::provenance::SourceProvenance;

/// Where a property, or one end of a link, comes from.
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyProvenance {
    /// The material it was produced from.
    #[cfg_attr(
        feature = "schemars",
        schemars(length(max = crate::provenance::validation::MAX_SOURCES))
    )]
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
