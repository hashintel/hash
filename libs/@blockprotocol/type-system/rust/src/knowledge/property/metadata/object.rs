#[cfg(feature = "postgres")]
use core::error::Error;
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};

use super::{PropertyMetadata, PropertyProvenance};
use crate::{knowledge::Confidence, ontology::BaseUrl};

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectMetadata {
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
}

impl ObjectMetadata {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.confidence.is_none() && self.provenance.is_empty()
    }
}

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyObjectMetadata {
    /// Metadata for each field in the object.
    ///
    /// The keys correspond to the property type URLs used in the object property.
    pub value: HashMap<BaseUrl, PropertyMetadata>,

    /// Metadata that applies to the object as a whole.
    #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
    pub metadata: ObjectMetadata,
}

impl PropertyObjectMetadata {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyObjectMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyObjectMetadata {
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
