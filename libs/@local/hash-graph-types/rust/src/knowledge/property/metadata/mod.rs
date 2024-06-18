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
        value: Vec<Self>,
        metadata: ArrayMetadata,
    },
    Object(PropertyMetadataObject),
    Value {
        metadata: ValueMetadata,
    },
}

impl From<PropertyMetadataObject> for PropertyMetadataElement {
    fn from(object: PropertyMetadataObject) -> Self {
        Self::Object(object)
    }
}

impl From<ValueMetadata> for PropertyMetadataElement {
    fn from(metadata: ValueMetadata) -> Self {
        Self::Value { metadata }
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
