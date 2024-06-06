use std::collections::{hash_map::RawEntryMut, HashMap};
#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use error_stack::{Report, ResultExt};
use json_patch::{AddOperation, PatchOperation, RemoveOperation, ReplaceOperation};
use jsonptr::Pointer;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value as JsonValue;
use type_system::url::BaseUrl;
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{self, schema, Ref, Schema},
    ToSchema,
};

use crate::knowledge::{
    property::{provenance::PropertyProvenance, PatchError, Property},
    Confidence, PropertyDiff, PropertyPatchOperation, PropertyPath, PropertyPathElement,
};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyMetadata {
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyMetadata {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyMetadata {
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
enum NestedPropertyMetadataMap {
    #[serde(with = "codec::serde::string_hash_map")]
    Array(HashMap<usize, PropertyMetadataMapElement>),
    Object(HashMap<BaseUrl, PropertyMetadataMapElement>),
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for NestedPropertyMetadataMap {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "NestedPropertyMetadataMap",
            Schema::Object(
                schema::ObjectBuilder::new()
                    .additional_properties(Some(Ref::from_schema_name(
                        PropertyMetadataMapElement::schema().0,
                    )))
                    .build(),
            )
            .into(),
        )
    }
}

trait PropertyPathIndex {
    type Value;

    fn get(
        &self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&Self::Value>, Report<PropertyPathError>>;

    fn get_mut(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&mut Self::Value>, Report<PropertyPathError>>;

    fn get_or_insert_with(
        &mut self,
        path_token: PropertyPathElement<'_>,
        default: impl FnOnce() -> Self::Value,
    ) -> Result<&mut Self::Value, Report<PropertyPathError>>;

    fn remove(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<Self::Value>, Report<PropertyPathError>>;
}

impl<T> PropertyPathIndex for HashMap<BaseUrl, T> {
    type Value = T;

    fn get(
        &self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => Ok(self.get(key)),
            PropertyPathElement::Index(index) => {
                Err(Report::new(PropertyPathError::ObjectExpected {
                    index: *index,
                }))
            }
        }
    }

    fn get_mut(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&mut Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => Ok(self.get_mut(key)),
            PropertyPathElement::Index(index) => {
                Err(Report::new(PropertyPathError::ObjectExpected {
                    index: *index,
                }))
            }
        }
    }

    fn get_or_insert_with(
        &mut self,
        path_token: PropertyPathElement<'_>,
        default: impl FnOnce() -> Self::Value,
    ) -> Result<&mut Self::Value, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => Ok(match self.raw_entry_mut().from_key(&key) {
                RawEntryMut::Occupied(entry) => entry.into_mut(),
                RawEntryMut::Vacant(entry) => entry.insert(key.into_owned(), default()).1,
            }),
            PropertyPathElement::Index(index) => {
                Err(Report::new(PropertyPathError::ObjectExpected { index }))
            }
        }
    }

    fn remove(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => Ok(self.remove(key)),
            PropertyPathElement::Index(index) => {
                Err(Report::new(PropertyPathError::ObjectExpected {
                    index: *index,
                }))
            }
        }
    }
}

impl<T> PropertyPathIndex for HashMap<usize, T> {
    type Value = T;

    fn get(
        &self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => {
                Err(Report::new(PropertyPathError::ArrayExpected {
                    key: key.clone().into_owned(),
                }))
            }
            PropertyPathElement::Index(index) => Ok(self.get(index)),
        }
    }

    fn get_mut(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&mut Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => {
                Err(Report::new(PropertyPathError::ArrayExpected {
                    key: key.clone().into_owned(),
                }))
            }
            PropertyPathElement::Index(index) => Ok(self.get_mut(index)),
        }
    }

    fn get_or_insert_with(
        &mut self,
        path_token: PropertyPathElement<'_>,
        default: impl FnOnce() -> Self::Value,
    ) -> Result<&mut Self::Value, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => {
                Err(Report::new(PropertyPathError::ArrayExpected {
                    key: key.into_owned(),
                }))
            }
            PropertyPathElement::Index(index) => Ok(self.entry(index).or_insert_with(default)),
        }
    }

    fn remove(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<Self::Value>, Report<PropertyPathError>> {
        match path_token {
            PropertyPathElement::Property(key) => {
                Err(Report::new(PropertyPathError::ArrayExpected {
                    key: key.clone().into_owned(),
                }))
            }
            PropertyPathElement::Index(index) => Ok(self.remove(index)),
        }
    }
}

impl PropertyPathIndex for NestedPropertyMetadataMap {
    type Value = PropertyMetadataMapElement;

    fn get(
        &self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&Self::Value>, Report<PropertyPathError>> {
        match self {
            Self::Object(map) => PropertyPathIndex::get(map, path_token),
            Self::Array(array) => PropertyPathIndex::get(array, path_token),
        }
    }

    fn get_mut(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<&mut Self::Value>, Report<PropertyPathError>> {
        match self {
            Self::Object(map) => PropertyPathIndex::get_mut(map, path_token),
            Self::Array(array) => PropertyPathIndex::get_mut(array, path_token),
        }
    }

    fn get_or_insert_with(
        &mut self,
        path_token: PropertyPathElement<'_>,
        default: impl FnOnce() -> Self::Value,
    ) -> Result<&mut Self::Value, Report<PropertyPathError>> {
        match self {
            Self::Object(map) => PropertyPathIndex::get_or_insert_with(map, path_token, default),
            Self::Array(array) => PropertyPathIndex::get_or_insert_with(array, path_token, default),
        }
    }

    fn remove(
        &mut self,
        path_token: &PropertyPathElement<'_>,
    ) -> Result<Option<Self::Value>, Report<PropertyPathError>> {
        match self {
            Self::Object(map) => PropertyPathIndex::remove(map, path_token),
            Self::Array(array) => PropertyPathIndex::remove(array, path_token),
        }
    }
}

impl From<HashMap<usize, PropertyMetadataMapElement>> for NestedPropertyMetadataMap {
    fn from(value: HashMap<usize, PropertyMetadataMapElement>) -> Self {
        Self::Array(value)
    }
}

impl From<HashMap<BaseUrl, PropertyMetadataMapElement>> for NestedPropertyMetadataMap {
    fn from(value: HashMap<BaseUrl, PropertyMetadataMapElement>) -> Self {
        Self::Object(value)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PropertyPathError {
    #[error("Property path is empty")]
    EmptyPath,
    #[error("Expected object but got array index `{index}`")]
    ObjectExpected { index: usize },
    #[error("Expected array but got object key `{key}`")]
    ArrayExpected { key: BaseUrl },
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct PropertyMetadataMapElement {
    #[serde(flatten, deserialize_with = "deserialize_metadata_element")]
    nested: Option<NestedPropertyMetadataMap>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    metadata: Option<PropertyMetadata>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for PropertyMetadataMapElement {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "PropertyMetadataMapElement",
            Schema::Object(
                schema::ObjectBuilder::new()
                    .property("metadata", Ref::from_schema_name("PropertyMetadata"))
                    .additional_properties(Some(Ref::from_schema_name(
                        "PropertyMetadataMapElement",
                    )))
                    .build(),
            )
            .into(),
        )
    }
}

// Serde does not deserialize into `None` if the flattened field is absent, so we do this manually
fn deserialize_metadata_element<'de, D>(
    deserializer: D,
) -> Result<Option<NestedPropertyMetadataMap>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(
        match NestedPropertyMetadataMap::deserialize(deserializer)? {
            NestedPropertyMetadataMap::Array(array) if array.is_empty() => None,
            NestedPropertyMetadataMap::Array(array) => Some(array.into()),
            NestedPropertyMetadataMap::Object(object) => Some(object.into()),
        },
    )
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PropertyMetadataMap(HashMap<BaseUrl, PropertyMetadataMapElement>);

impl PropertyMetadataMap {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the metadata for the given property path.
    ///
    /// # Errors
    ///
    /// - [`EmptyPath`] if the path is empty
    /// - [`ArrayExpected`] if an array index was expected but an object key was found
    /// - [`ObjectExpected`] if an object key was expected but an array index was found
    ///
    /// [`EmptyPath`]: PropertyPathError::EmptyPath
    /// [`ArrayExpected`]: PropertyPathError::ArrayExpected
    /// [`ObjectExpected`]: PropertyPathError::ObjectExpected
    pub fn get<'s>(
        &'s self,
        property_path: &PropertyPath<'_>,
    ) -> Result<Option<&'s PropertyMetadata>, Report<PropertyPathError>> {
        let mut property_path = property_path.into_iter();

        let Some(path_token) = property_path.next() else {
            return Err(Report::new(PropertyPathError::EmptyPath));
        };

        let Some(mut element) = PropertyPathIndex::get(&self.0, &path_token)? else {
            return Ok(None);
        };

        for path_token in property_path {
            let Some(nested) = element.nested.as_ref() else {
                return Ok(None);
            };
            let Some(nested_element) = nested.get(&path_token)? else {
                return Ok(None);
            };
            element = nested_element;
        }

        Ok(element.metadata.as_ref())
    }

    /// Sets the metadata for the given property path.
    ///
    /// Returns the previous metadata if it was present.
    ///
    /// # Errors
    ///
    /// - [`EmptyPath`] if the path is empty
    /// - [`ArrayExpected`] if an array index was expected but an object key was found
    /// - [`ObjectExpected`] if an object key was expected but an array index was found
    ///
    /// [`EmptyPath`]: PropertyPathError::EmptyPath
    /// [`ArrayExpected`]: PropertyPathError::ArrayExpected
    /// [`ObjectExpected`]: PropertyPathError::ObjectExpected
    pub fn set(
        &mut self,
        property_path: &PropertyPath<'_>,
        metadata: PropertyMetadata,
    ) -> Result<Option<PropertyMetadata>, Report<PropertyPathError>> {
        let mut property_path = property_path.into_iter();

        let mut metadata_element = if let Some(first) = property_path.next() {
            PropertyPathIndex::get_or_insert_with(
                &mut self.0,
                first,
                PropertyMetadataMapElement::default,
            )?
        } else {
            return Err(Report::new(PropertyPathError::EmptyPath));
        };

        for path_token in property_path {
            metadata_element = metadata_element
                .nested
                .get_or_insert_with(|| match path_token {
                    PropertyPathElement::Property(_) => {
                        NestedPropertyMetadataMap::Object(HashMap::default())
                    }
                    PropertyPathElement::Index(_) => {
                        NestedPropertyMetadataMap::Array(HashMap::default())
                    }
                })
                .get_or_insert_with(path_token, PropertyMetadataMapElement::default)?;
        }

        Ok(metadata_element.metadata.replace(metadata))
    }

    /// Removes the metadata for the given property path.
    ///
    /// Returns the previous metadata if it was present.
    ///
    /// # Errors
    ///
    /// - [`ArrayExpected`] if an array index was expected but an object key was found
    /// - [`ObjectExpected`] if an object key was expected but an array index was found
    ///
    /// [`ArrayExpected`]: PropertyPathError::ArrayExpected
    /// [`ObjectExpected`]: PropertyPathError::ObjectExpected
    pub fn remove(
        &mut self,
        property_path: &PropertyPath<'_>,
    ) -> Result<Option<PropertyMetadata>, Report<PropertyPathError>> {
        let mut property_path = property_path.into_iter().peekable();

        let Some(first_path_element) = property_path.next() else {
            // The path is empty, so we remove all metadata
            self.0.clear();
            return Ok(None);
        };

        if property_path.peek().is_none() {
            // The path has only one element, so we remove the metadata for that element
            return Ok(PropertyPathIndex::remove(&mut self.0, &first_path_element)?
                .and_then(|element| element.metadata));
        }

        let Some(mut map_entry) = PropertyPathIndex::get_mut(&mut self.0, &first_path_element)?
        else {
            return Ok(None);
        };

        while let Some(path_token) = property_path.next() {
            let is_last = property_path.peek().is_none();

            let Some(nested) = map_entry.nested.as_mut() else {
                return Ok(None);
            };

            if is_last {
                // The path has only one element, so we remove the metadata for that element
                return Ok(PropertyPathIndex::remove(&mut self.0, &first_path_element)?
                    .and_then(|element| element.metadata));
            } else if let Some(next) = nested.get_mut(&path_token)? {
                map_entry = next;
            } else {
                break;
            }
        }
        Ok(None)
    }

    /// Applies the given patch operations to the object.
    ///
    /// # Errors
    ///
    /// Returns an error if the patch operation failed
    pub fn patch(
        &mut self,
        operations: &[PropertyPatchOperation],
    ) -> Result<(), Report<PatchError>> {
        for operation in operations {
            match operation {
                PropertyPatchOperation::Add {
                    path,
                    value: _,
                    confidence,
                    provenance,
                } => {
                    if path.is_empty() {
                        if confidence.is_some() || !provenance.is_empty() {
                            return Err(Report::new(PatchError)
                                .attach_printable("Cannot set metadata for root object"));
                        }
                    } else {
                        self.set(
                            path,
                            PropertyMetadata {
                                confidence: *confidence,
                                provenance: provenance.clone(),
                            },
                        )
                        .change_context(PatchError)?;
                    }
                }
                PropertyPatchOperation::Remove { path } => {
                    self.remove(path).change_context(PatchError)?;
                }
                PropertyPatchOperation::Replace {
                    path,
                    value: _,
                    confidence,
                    provenance,
                } => {
                    if path.is_empty() {
                        if confidence.is_some() || !provenance.is_empty() {
                            return Err(Report::new(PatchError)
                                .attach_printable("Cannot set metadata for root object"));
                        }
                    } else {
                        self.set(
                            path,
                            PropertyMetadata {
                                confidence: *confidence,
                                provenance: provenance.clone(),
                            },
                        )
                        .change_context(PatchError)?;
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyMetadataMap {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyMetadataMap {
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
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
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

    /// Applies the given patch operations to the object.
    ///
    /// # Errors
    ///
    /// Returns an error if the patch operation failed
    pub fn patch(
        &mut self,
        operations: &[PropertyPatchOperation],
    ) -> Result<(), Report<PatchError>> {
        let patches = operations
            .iter()
            .map(|operation| {
                Ok(match operation {
                    PropertyPatchOperation::Add {
                        path,
                        value,
                        confidence: _,
                        provenance: _,
                    } => PatchOperation::Add(AddOperation {
                        path: Pointer::new(path),
                        value: serde_json::to_value(value).change_context(PatchError)?,
                    }),
                    PropertyPatchOperation::Remove { path } => {
                        PatchOperation::Remove(RemoveOperation {
                            path: Pointer::new(path),
                        })
                    }
                    PropertyPatchOperation::Replace {
                        path,
                        value,
                        confidence: _,
                        provenance: _,
                    } => PatchOperation::Replace(ReplaceOperation {
                        path: Pointer::new(path),
                        value: serde_json::to_value(value).change_context(PatchError)?,
                    }),
                })
            })
            .collect::<Result<Vec<_>, Report<PatchError>>>()?;

        // TODO: Implement more efficient patching without serialization
        #[expect(
            clippy::needless_borrows_for_generic_args,
            reason = "value would be moved"
        )]
        let mut this = serde_json::to_value(&self).change_context(PatchError)?;
        json_patch::patch(&mut this, &patches).change_context(PatchError)?;
        *self = serde_json::from_value(this).change_context(PatchError)?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use core::iter;
    use std::collections::HashMap;

    use serde_json::json;
    use type_system::url::BaseUrl;

    use super::*;
    use crate::knowledge::{
        property::PropertyMetadataMap, Confidence, PropertyMetadata, PropertyPathElement,
        PropertyProvenance,
    };

    #[test]
    fn deserialize_element() {
        let base_url_a =
            BaseUrl::new("https://example.com/a/".to_owned()).expect("Failed to parse base URL");

        assert_eq!(
            serde_json::from_value::<NestedPropertyMetadataMap>(json!({
               "10": {
                    "metadata": {
                        "confidence": 0.1
                    }
                }
            }))
            .expect("Failed to parse attribute metadata element"),
            NestedPropertyMetadataMap::Array(HashMap::from([(
                10,
                PropertyMetadataMapElement {
                    nested: None,
                    metadata: Some(PropertyMetadata {
                        confidence: Confidence::new(0.1),
                        provenance: PropertyProvenance::default(),
                    }),
                }
            )]))
        );

        assert_eq!(
            serde_json::from_value::<NestedPropertyMetadataMap>(json!({
                base_url_a.clone(): {
                    "metadata": {
                        "confidence": 0.1
                    }
                }
            }))
            .expect("Failed to parse attribute metadata element"),
            NestedPropertyMetadataMap::Object(HashMap::from([(
                base_url_a,
                PropertyMetadataMapElement {
                    nested: None,
                    metadata: Some(PropertyMetadata {
                        confidence: Confidence::new(0.1),
                        provenance: PropertyProvenance::default(),
                    }),
                }
            )]))
        );
    }

    #[test]
    #[expect(clippy::too_many_lines)]
    fn find_default() {
        let base_url_a =
            BaseUrl::new("https://example.com/a/".to_owned()).expect("Failed to parse base URL");
        let base_url_b =
            BaseUrl::new("https://example.com/b/".to_owned()).expect("Failed to parse base URL");
        let base_url_c =
            BaseUrl::new("https://example.com/c/".to_owned()).expect("Failed to parse base URL");

        let map: PropertyMetadataMap = serde_json::from_value(json!({
          "https://example.com/a/": {
            "https://example.com/b/": {
              "metadata": {
                "confidence": 0.1
              }
            },
            "metadata": {
              "confidence": 0.2
            }
          },
          "https://example.com/b/": {
            "5000": {
              "metadata": {
                "confidence": 0.3
              }
            },
            "metadata": {
              "confidence": 0.4
            }
          }
        }))
        .expect("Failed to parse metadata map");

        assert_eq!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_a),
                    PropertyPathElement::from(&base_url_b),
                ]
                .into_iter()
                .collect()
            )
            .expect("Failed to get value")
            .expect("metadata should be present")
            .confidence,
            Confidence::new(0.1)
        );
        assert!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_a),
                    PropertyPathElement::from(&base_url_b),
                    PropertyPathElement::from(&base_url_c)
                ]
                .into_iter()
                .collect()
            )
            .expect("Failed to get value")
            .is_none()
        );
        assert!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_b),
                    PropertyPathElement::from(1000),
                ]
                .into_iter()
                .collect()
            )
            .expect("Failed to get value")
            .is_none()
        );
        assert_eq!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_b),
                    PropertyPathElement::from(5000),
                ]
                .into_iter()
                .collect()
            )
            .expect("Failed to get value")
            .expect("metadata should be present")
            .confidence,
            Confidence::new(0.3)
        );
        assert!(matches!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_a),
                    PropertyPathElement::from(1000),
                ]
                .into_iter()
                .collect()
            )
            .expect_err("Unexpectedly got value")
            .current_context(),
            PropertyPathError::ObjectExpected { index: 1000 }
        ));
        assert!(matches!(
            map.get(
                &[
                    PropertyPathElement::from(&base_url_b),
                    PropertyPathElement::from(&base_url_c),
                ]
                .into_iter()
                .collect()
            )
            .expect_err("Unexpectedly got value")
            .current_context(),
            PropertyPathError::ArrayExpected { key: _ }
        ));
        assert_eq!(
            map.get(&iter::once(PropertyPathElement::from(&base_url_c)).collect())
                .expect("Failed to get value"),
            None
        );

        let mut metadata = PropertyMetadataMap::default();
        assert!(matches!(
            metadata
                .set(
                    &iter::once(PropertyPathElement::from(10)).collect(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.01),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect_err("Unexpectedly set value")
                .current_context(),
            PropertyPathError::ObjectExpected { index: 10 }
        ));

        assert!(
            metadata
                .set(
                    &iter::once(PropertyPathElement::from(&base_url_a)).collect(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.02),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect("Failed to set value")
                .is_none()
        );
        assert!(
            metadata
                .set(
                    &[
                        PropertyPathElement::from(&base_url_a),
                        PropertyPathElement::from(&base_url_b),
                        PropertyPathElement::from(&base_url_c),
                    ]
                    .into_iter()
                    .collect(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.03),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect("Failed to set value")
                .is_none()
        );
        assert!(
            metadata
                .set(
                    &[
                        PropertyPathElement::from(&base_url_a),
                        PropertyPathElement::from(&base_url_b),
                        PropertyPathElement::from(&base_url_b),
                    ]
                    .into_iter()
                    .collect(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.04),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect("Failed to set value")
                .is_none()
        );
        assert!(matches!(
            metadata
                .set(
                    &PropertyPath::default(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.05),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect_err("Unexpectedly set value with empty path")
                .current_context(),
            PropertyPathError::EmptyPath,
        ));

        assert!(matches!(
            metadata
                .set(
                    &[
                        PropertyPathElement::from(&base_url_a),
                        PropertyPathElement::from(10),
                    ]
                    .into_iter()
                    .collect(),
                    PropertyMetadata {
                        confidence: Confidence::new(0.07),
                        provenance: PropertyProvenance::default(),
                    },
                )
                .expect_err("Unexpectedly set value")
                .current_context(),
            PropertyPathError::ObjectExpected { index: 10 }
        ));

        assert_eq!(
            serde_json::to_value(&metadata).expect("Failed to serialize metadata"),
            json!({
              "https://example.com/a/": {
                "https://example.com/b/": {
                  "https://example.com/c/": {
                    "metadata": {
                      "confidence": 0.03
                    }
                  },
                  "https://example.com/b/": {
                    "metadata": {
                      "confidence": 0.04
                    }
                  }
                },
                "metadata": {
                  "confidence": 0.02
                }
              }
            })
        );
    }
}
