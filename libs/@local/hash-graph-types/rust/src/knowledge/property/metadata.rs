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
use type_system::url::{BaseUrl, VersionedUrl};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{self, schema, Ref, Schema},
    ToSchema,
};

use crate::{
    knowledge::{
        property::{provenance::PropertyProvenance, PatchError, Property},
        Confidence, PropertyDiff, PropertyPatchOperation, PropertyPath, PropertyPathElement,
    },
    ontology::DataTypeId,
};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyMetadataArray {
    #[serde(flatten, skip_serializing_if = "HashMap::is_empty")]
    array: HashMap<usize, PropertyMetadataElement>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    provenance: PropertyProvenance,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyMetadataObject {
    #[serde(flatten, skip_serializing_if = "HashMap::is_empty")]
    object: HashMap<BaseUrl, PropertyMetadataElement>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    provenance: PropertyProvenance,
}

impl PropertyMetadataObject {
    pub fn is_empty(&self) -> bool {
        self.object.is_empty() && self.confidence.is_none() && self.provenance.is_empty()
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyMetadataValue {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    provenance: PropertyProvenance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    data_type_id: Option<VersionedUrl>,
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for PropertyMetadataValue {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for PropertyMetadataValue {
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
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum PropertyMetadataElement {
    Array(PropertyMetadataArray),
    Object(PropertyMetadataObject),
    Value(PropertyMetadataValue),
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

// #[cfg(test)]
// mod tests {
//     use core::iter;
//     use std::collections::HashMap;
//
//     use serde_json::json;
//     use type_system::url::BaseUrl;
//
//     use super::*;
//     use crate::knowledge::{
//         property::PropertyMetadataMap, Confidence, PropertyMetadata, PropertyPathElement,
//         PropertyProvenance,
//     };
//
//     #[test]
//     fn deserialize_element() {
//         let base_url_a =
//             BaseUrl::new("https://example.com/a/".to_owned()).expect("Failed to parse base URL");
//
//         assert_eq!(
//             serde_json::from_value::<PropertyMetadataMap>(json!({
//                "10": {
//                     "metadata": {
//                         "confidence": 0.1
//                     }
//                 }
//             }))
//             .expect("Failed to parse attribute metadata element"),
//             NestedPropertyMetadataMap::Array(HashMap::from([(
//                 10,
//                 PropertyMetadataMapElement {
//                     nested: None,
//                     metadata: Some(PropertyMetadata {
//                         confidence: Confidence::new(0.1),
//                         provenance: PropertyProvenance::default(),
//                     }),
//                 }
//             )]))
//         );
//
//         assert_eq!(
//             serde_json::from_value::<NestedPropertyMetadataMap>(json!({
//                 base_url_a.clone(): {
//                     "metadata": {
//                         "confidence": 0.1
//                     }
//                 }
//             }))
//             .expect("Failed to parse attribute metadata element"),
//             NestedPropertyMetadataMap::Object(HashMap::from([(
//                 base_url_a,
//                 PropertyMetadataMapElement {
//                     nested: None,
//                     metadata: Some(PropertyMetadata {
//                         confidence: Confidence::new(0.1),
//                         provenance: PropertyProvenance::default(),
//                     }),
//                 }
//             )]))
//         );
//     }
//
//     #[test]
//     #[expect(clippy::too_many_lines)]
//     fn find_default() {
//         let base_url_a =
//             BaseUrl::new("https://example.com/a/".to_owned()).expect("Failed to parse base URL");
//         let base_url_b =
//             BaseUrl::new("https://example.com/b/".to_owned()).expect("Failed to parse base URL");
//         let base_url_c =
//             BaseUrl::new("https://example.com/c/".to_owned()).expect("Failed to parse base URL");
//
//         let map: PropertyMetadataMap = serde_json::from_value(json!({
//           "https://example.com/a/": {
//             "https://example.com/b/": {
//               "metadata": {
//                 "confidence": 0.1
//               }
//             },
//             "metadata": {
//               "confidence": 0.2
//             }
//           },
//           "https://example.com/b/": {
//             "5000": {
//               "metadata": {
//                 "confidence": 0.3
//               }
//             },
//             "metadata": {
//               "confidence": 0.4
//             }
//           }
//         }))
//         .expect("Failed to parse metadata map");
//
//         assert_eq!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_a),
//                     PropertyPathElement::from(&base_url_b),
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect("Failed to get value")
//             .expect("metadata should be present")
//             .confidence,
//             Confidence::new(0.1)
//         );
//         assert!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_a),
//                     PropertyPathElement::from(&base_url_b),
//                     PropertyPathElement::from(&base_url_c)
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect("Failed to get value")
//             .is_none()
//         );
//         assert!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_b),
//                     PropertyPathElement::from(1000),
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect("Failed to get value")
//             .is_none()
//         );
//         assert_eq!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_b),
//                     PropertyPathElement::from(5000),
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect("Failed to get value")
//             .expect("metadata should be present")
//             .confidence,
//             Confidence::new(0.3)
//         );
//         assert!(matches!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_a),
//                     PropertyPathElement::from(1000),
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect_err("Unexpectedly got value")
//             .current_context(),
//             PropertyPathError::ObjectExpected { index: 1000 }
//         ));
//         assert!(matches!(
//             map.get(
//                 &[
//                     PropertyPathElement::from(&base_url_b),
//                     PropertyPathElement::from(&base_url_c),
//                 ]
//                 .into_iter()
//                 .collect()
//             )
//             .expect_err("Unexpectedly got value")
//             .current_context(),
//             PropertyPathError::ArrayExpected { key: _ }
//         ));
//         assert_eq!(
//             map.get(&iter::once(PropertyPathElement::from(&base_url_c)).collect())
//                 .expect("Failed to get value"),
//             None
//         );
//
//         let mut metadata = PropertyMetadataMap::default();
//         assert!(matches!(
//             metadata
//                 .set(
//                     &iter::once(PropertyPathElement::from(10)).collect(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.01),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect_err("Unexpectedly set value")
//                 .current_context(),
//             PropertyPathError::ObjectExpected { index: 10 }
//         ));
//
//         assert!(
//             metadata
//                 .set(
//                     &iter::once(PropertyPathElement::from(&base_url_a)).collect(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.02),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect("Failed to set value")
//                 .is_none()
//         );
//         assert!(
//             metadata
//                 .set(
//                     &[
//                         PropertyPathElement::from(&base_url_a),
//                         PropertyPathElement::from(&base_url_b),
//                         PropertyPathElement::from(&base_url_c),
//                     ]
//                     .into_iter()
//                     .collect(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.03),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect("Failed to set value")
//                 .is_none()
//         );
//         assert!(
//             metadata
//                 .set(
//                     &[
//                         PropertyPathElement::from(&base_url_a),
//                         PropertyPathElement::from(&base_url_b),
//                         PropertyPathElement::from(&base_url_b),
//                     ]
//                     .into_iter()
//                     .collect(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.04),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect("Failed to set value")
//                 .is_none()
//         );
//         assert!(matches!(
//             metadata
//                 .set(
//                     &PropertyPath::default(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.05),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect_err("Unexpectedly set value with empty path")
//                 .current_context(),
//             PropertyPathError::EmptyPath,
//         ));
//
//         assert!(matches!(
//             metadata
//                 .set(
//                     &[
//                         PropertyPathElement::from(&base_url_a),
//                         PropertyPathElement::from(10),
//                     ]
//                     .into_iter()
//                     .collect(),
//                     PropertyMetadata {
//                         confidence: Confidence::new(0.07),
//                         provenance: PropertyProvenance::default(),
//                     },
//                 )
//                 .expect_err("Unexpectedly set value")
//                 .current_context(),
//             PropertyPathError::ObjectExpected { index: 10 }
//         ));
//
//         assert_eq!(
//             serde_json::to_value(&metadata).expect("Failed to serialize metadata"),
//             json!({
//               "https://example.com/a/": {
//                 "https://example.com/b/": {
//                   "https://example.com/c/": {
//                     "metadata": {
//                       "confidence": 0.03
//                     }
//                   },
//                   "https://example.com/b/": {
//                     "metadata": {
//                       "confidence": 0.04
//                     }
//                   }
//                 },
//                 "metadata": {
//                   "confidence": 0.02
//                 }
//               }
//             })
//         );
//     }
// }
