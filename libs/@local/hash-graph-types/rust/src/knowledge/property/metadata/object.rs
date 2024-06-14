use std::{
    collections::{hash_map, HashMap},
    error::Error,
    mem,
};

use bytes::BytesMut;
use error_stack::Report;
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;

use crate::knowledge::{
    property::metadata::PropertyPathError, Confidence, PropertyMetadataElement, PropertyProvenance,
};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ObjectMetadata {
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
}

impl ObjectMetadata {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.confidence.is_none() && self.provenance.is_empty()
    }
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyMetadataObject {
    pub properties: HashMap<BaseUrl, PropertyMetadataElement>,
    #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
    pub metadata: ObjectMetadata,
}

impl PropertyMetadataObject {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.properties.is_empty() && self.metadata.is_empty()
    }

    pub fn add(
        &mut self,
        key: BaseUrl,
        metadata: PropertyMetadataElement,
    ) -> Option<PropertyMetadataElement> {
        match self.properties.entry(key) {
            hash_map::Entry::Occupied(entry) => Some(mem::replace(entry.into_mut(), metadata)),
            hash_map::Entry::Vacant(entry) => {
                entry.insert(metadata);
                None
            }
        }
    }

    pub fn remove(
        &mut self,
        key: &BaseUrl,
    ) -> Result<PropertyMetadataElement, Report<PropertyPathError>> {
        Ok(self
            .properties
            .remove(key)
            .ok_or_else(|| PropertyPathError::ObjectKeyNotFound { key: key.clone() })?)
    }

    pub fn replace(
        &mut self,
        key: &BaseUrl,
        metadata: PropertyMetadataElement,
    ) -> Result<PropertyMetadataElement, Report<PropertyPathError>> {
        Ok(mem::replace(
            self.properties
                .get_mut(&key)
                .ok_or_else(|| PropertyPathError::ObjectKeyNotFound { key: key.clone() })?,
            metadata,
        ))
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyMetadataObject {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyMetadataObject {
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
