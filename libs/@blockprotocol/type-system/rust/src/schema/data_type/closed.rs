use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{
    data_type::constraint::StringFormat, DataType, DataTypeLabel, JsonSchemaValueType,
};

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedDataType {
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    // constraints for any types
    #[serde(rename = "type")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonSchemaValueType]"))]
    pub json_type: Vec<JsonSchemaValueType>,
    #[serde(rename = "enum", default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonValue, ...JsonValue[]]"))]
    pub enum_values: Vec<JsonValue>,

    // constraints for number types
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[number, ...number[]]"))]
    pub multiple_of: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_maximum: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_minimum: bool,

    // constraints for string types
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty",
        with = "codec::serde::regex::iter"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[string, ...string[]]"))]
    pub pattern: Vec<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

impl ClosedDataType {
    #[must_use]
    pub fn new(data_type: DataType) -> Self {
        Self {
            label: data_type.label,
            json_type: vec![data_type.json_type],
            // We don't need to check if `enum` matches `const` as this is done in the validation
            // step
            enum_values: data_type
                .const_value
                .map_or(data_type.enum_values, |const_value| vec![const_value]),
            multiple_of: data_type.multiple_of.map(|x| vec![x]).unwrap_or_default(),
            maximum: data_type.maximum,
            exclusive_maximum: data_type.exclusive_maximum,
            minimum: data_type.minimum,
            exclusive_minimum: data_type.exclusive_minimum,
            min_length: data_type.min_length,
            max_length: data_type.max_length,
            pattern: data_type.pattern.map(|x| vec![x]).unwrap_or_default(),
            format: data_type.format,
        }
    }
}

// impl From<DataType> for ClosedDataType {
//     fn from(entity_type: DataType) -> Self {
//         Self {
//             schemas: HashMap::from([(
//                 entity_type.id,
//                 ClosedDataTypeSchemaData {
//                     title: entity_type.title,
//                     description: entity_type.description,
//                 },
//             )]),
//             properties: entity_type.properties,
//             required: entity_type.required,
//             links: entity_type.links,
//             all_of: entity_type.all_of.into_iter().collect(),
//         }
//     }
// }
//
// impl FromIterator<DataType> for ClosedDataType {
//     fn from_iter<T: IntoIterator<Item = DataType>>(iter: T) -> Self {
//         let mut entity_type = Self::default();
//         entity_type.extend(iter);
//         entity_type
//     }
// }
//
// impl FromIterator<Self> for ClosedDataType {
//     fn from_iter<T: IntoIterator<Item = Self>>(iter: T) -> Self {
//         let mut entity_type = Self::default();
//         entity_type.extend(iter);
//         entity_type
//     }
// }
//
// impl Extend<Self> for ClosedDataType {
//     fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
//         for other in iter {
//             self.all_of.extend(other.all_of);
//             self.schemas.extend(other.schemas);
//             self.properties.extend(other.properties);
//             self.required.extend(other.required);
//             extend_links(&mut self.links, other.links);
//         }
//
//         self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
//     }
// }
//
// impl Extend<DataType> for ClosedDataType {
//     fn extend<T: IntoIterator<Item = DataType>>(&mut self, iter: T) {
//         for other in iter {
//             self.all_of.extend(other.all_of);
//             self.schemas.insert(
//                 other.id,
//                 ClosedDataTypeSchemaData {
//                     title: other.title,
//                     description: other.description,
//                 },
//             );
//             self.properties.extend(other.properties);
//             self.required.extend(other.required);
//             extend_links(&mut self.links, other.links);
//         }
//
//         self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
//     }
// }
//
// #[cfg(test)]
// mod tests {
//     use crate::{
//         schema::ClosedDataType,
//         url::BaseUrl,
//         utils::tests::{ensure_serialization_from_str, JsonEqualityCheck},
//         DataType,
//     };
//
//     #[test]
//     fn merge_entity_type() {
//         let building = ensure_serialization_from_str::<DataType>(
//             graph_test_data::entity_type::BUILDING_V1,
//             JsonEqualityCheck::Yes,
//         );
//         let church: DataType = ensure_serialization_from_str::<DataType>(
//             graph_test_data::entity_type::CHURCH_V1,
//             JsonEqualityCheck::Yes,
//         );
//
//         let closed_church: ClosedDataType = [building, church].into_iter().collect();
//
//         assert!(
//             closed_church.properties.contains_key(
//                 &BaseUrl::new(
//                     "https://blockprotocol.org/@alice/types/property-type/built-at/".to_owned()
//                 )
//                 .expect("invalid url")
//             )
//         );
//         assert!(
//             closed_church.properties.contains_key(
//                 &BaseUrl::new(
//                     "https://blockprotocol.org/@alice/types/property-type/number-bells/".to_owned()
//                 )
//                 .expect("invalid url")
//             )
//         );
//         assert!(closed_church.all_of.is_empty());
//     }
// }
