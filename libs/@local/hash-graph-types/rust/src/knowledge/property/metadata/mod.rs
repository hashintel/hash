pub use self::{
    array::ArrayMetadata,
    object::{ObjectMetadata, PropertyMetadataObject},
    value::ValueMetadata,
};

mod array;
mod object;
mod value;

#[cfg(feature = "postgres")]
use core::error::Error;
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use type_system::url::BaseUrl;

use crate::knowledge::{property::Property, PropertyDiff, PropertyPath, PropertyPathElement};

#[derive(Debug, thiserror::Error)]
pub enum PropertyPathError {
    #[error("Property path is empty")]
    EmptyPath,
    #[error("Property path index `{index}` is out of bounds, length is `{len}`")]
    IndexOutOfBounds { index: usize, len: usize },
    #[error("Property path key `{key}` does not exist")]
    InvalidKey { key: BaseUrl },
    #[error("Expected object but got array index `{index}`")]
    UnexpectedIndex { index: usize },
    #[error("Expected array but got object key `{key}`")]
    UnexpectedKey { key: BaseUrl },
    #[error("Tried to add value to existing value")]
    UnexpectedValue,
    #[error("Properties and metadata do not match")]
    PropertyMetadataMismatch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum PropertyMetadataElement {
    Array {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        value: Vec<Self>,
        #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
        metadata: ArrayMetadata,
    },
    Object {
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        value: HashMap<BaseUrl, Self>,
        #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
        metadata: ObjectMetadata,
    },
    Value {
        metadata: ValueMetadata,
    },
}

impl From<PropertyMetadataObject> for PropertyMetadataElement {
    fn from(object: PropertyMetadataObject) -> Self {
        Self::Object {
            value: object.value,
            metadata: object.metadata,
        }
    }
}

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
    ) -> impl Iterator<Item = PropertyDiff<'_>> {
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
