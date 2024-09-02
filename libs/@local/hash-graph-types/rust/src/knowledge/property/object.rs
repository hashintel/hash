#[cfg(feature = "postgres")]
use core::error::Error;
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use error_stack::Report;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use type_system::url::BaseUrl;

use crate::knowledge::{
    property::PropertyPathError, ObjectMetadata, Property, PropertyDiff, PropertyMetadataObject,
    PropertyPath, PropertyPathElement, PropertyWithMetadata,
};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyObject(HashMap<BaseUrl, Property>);

impl PropertyObject {
    #[must_use]
    pub const fn new(properties: HashMap<BaseUrl, Property>) -> Self {
        Self(properties)
    }

    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, Property> {
        &self.0
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&BaseUrl, &Property)> {
        self.0.iter()
    }

    pub fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'a>> {
        Property::diff_object(self.properties(), other.properties(), path)
    }

    #[must_use]
    pub fn path_exists(&self, path: &PropertyPath<'_>) -> bool {
        let mut path_iter = path.iter();
        let Some(first) = path_iter.next() else {
            return true;
        };

        let first_key = match first {
            PropertyPathElement::Property(key) => key,
            PropertyPathElement::Index(_) => return false,
        };
        self.0
            .get(&first_key)
            .map_or(false, |property| property.get(path_iter).is_some())
    }
}

impl PartialEq<JsonValue> for PropertyObject {
    fn eq(&self, other: &JsonValue) -> bool {
        let JsonValue::Object(other_object) = other else {
            return false;
        };

        self.0.len() == other_object.len()
            && self.0.iter().all(|(key, value)| {
                other_object
                    .get(key.as_str())
                    .map_or(false, |other_value| value == other_value)
            })
    }
}

impl IntoIterator for PropertyObject {
    type IntoIter = std::collections::hash_map::IntoIter<BaseUrl, Property>;
    type Item = (BaseUrl, Property);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyObject {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        postgres_types::Json(&self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool
    where
        Self: Sized,
    {
        <postgres_types::Json<Self> as ToSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyObject {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let json = postgres_types::Json::from_sql(ty, raw)?;
        Ok(json.0)
    }

    fn accepts(ty: &Type) -> bool
    where
        Self: Sized,
    {
        <postgres_types::Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyWithMetadataObject {
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub value: HashMap<BaseUrl, PropertyWithMetadata>,
    #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
    pub metadata: ObjectMetadata,
}

impl PropertyWithMetadataObject {
    /// Creates a unified representation of the property and its metadata.
    ///
    /// # Errors
    ///
    /// - If the property and metadata types do not match.
    pub fn from_parts(
        properties: PropertyObject,
        metadata: Option<PropertyMetadataObject>,
    ) -> Result<Self, Report<PropertyPathError>> {
        Ok(if let Some(mut metadata_elements) = metadata {
            Self {
                value: properties
                    .into_iter()
                    .map(|(key, property)| {
                        let metadata = metadata_elements.value.remove(&key);
                        Ok::<_, Report<PropertyPathError>>((
                            key,
                            PropertyWithMetadata::from_parts(property, metadata)?,
                        ))
                    })
                    .collect::<Result<_, _>>()?,
                metadata: metadata_elements.metadata,
            }
        } else {
            Self {
                value: properties
                    .into_iter()
                    .map(|(key, property)| {
                        Ok::<_, Report<PropertyPathError>>((
                            key,
                            PropertyWithMetadata::from_parts(property, None)?,
                        ))
                    })
                    .collect::<Result<_, _>>()?,
                metadata: ObjectMetadata::default(),
            }
        })
    }

    #[must_use]
    pub fn into_parts(self) -> (PropertyObject, PropertyMetadataObject) {
        let (properties, metadata_properties) = self
            .value
            .into_iter()
            .map(|(base_url, property_with_metadata)| {
                let (property, metadata) = property_with_metadata.into_parts();
                ((base_url.clone(), property), (base_url, metadata))
            })
            .unzip();
        (
            PropertyObject::new(properties),
            PropertyMetadataObject {
                value: metadata_properties,
                metadata: self.metadata,
            },
        )
    }
}
