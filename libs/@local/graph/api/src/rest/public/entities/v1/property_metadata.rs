//! The data types and provenance of an entity's property values, in the shape of its properties.

use alloc::borrow::Cow;
use core::{error::Error, fmt};
use std::collections::HashMap;

use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Deserializer, Serialize, de};
use type_system::{
    knowledge::{
        PropertyValue,
        property::{
            Property, PropertyArrayWithMetadata, PropertyObject, PropertyObjectWithMetadata,
            PropertyValueWithMetadata, PropertyWithMetadata, metadata as stored,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
};

use super::provenance::PropertyProvenance;

/// The metadata of properties, keyed by the base URL of their property type.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct PropertyObjectMetadata(HashMap<BaseUrl, PropertyMetadata>);

/// The metadata of a property that holds a value.
#[derive(Debug, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyValueMetadata {
    /// The data type of the value.
    data_type_id: VersionedUrl,
    /// Where the value comes from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PropertyProvenance")]
    provenance: Option<PropertyProvenance>,
}

/// The metadata of a property that holds a list of properties.
#[derive(Debug, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyArrayMetadata {
    /// The metadata of the properties in the list, one entry per property in the same order.
    items: Vec<PropertyMetadata>,
    /// Where the list as a whole comes from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PropertyProvenance")]
    provenance: Option<PropertyProvenance>,
}

/// The metadata of a property that holds properties keyed by base URL.
#[derive(Debug, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NestedPropertyObjectMetadata {
    /// The metadata of the properties, keyed by the base URL of their property type.
    properties: PropertyObjectMetadata,
    /// Where the properties as a whole come from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PropertyProvenance")]
    provenance: Option<PropertyProvenance>,
}

/// The metadata of a property, with exactly one of `dataTypeId`, `items` and `properties`.
#[derive(Debug, PartialEq, Serialize, JsonSchema)]
#[serde(untagged)]
pub(super) enum PropertyMetadata {
    Value(PropertyValueMetadata),
    Array(PropertyArrayMetadata),
    Object(NestedPropertyObjectMetadata),
}

/// A key of property metadata.
#[derive(Deserialize)]
#[serde(field_identifier, rename_all = "camelCase")]
enum PropertyMetadataField {
    DataTypeId,
    Items,
    Properties,
    Provenance,
}

/// Reads property metadata, chooses its variant by its keys and keeps the error of each field.
struct PropertyMetadataVisitor;

impl<'de> de::Visitor<'de> for PropertyMetadataVisitor {
    type Value = PropertyMetadata;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(
            "property metadata, an object with exactly one of `dataTypeId`, `items` and \
             `properties`",
        )
    }

    fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut data_type_id = None;
        let mut items = None;
        let mut properties = None;
        let mut provenance = None;
        while let Some(field) = map.next_key()? {
            match field {
                PropertyMetadataField::DataTypeId => {
                    read_field(&mut map, &mut data_type_id, "dataTypeId")?;
                }
                PropertyMetadataField::Items => read_field(&mut map, &mut items, "items")?,
                PropertyMetadataField::Properties => {
                    read_field(&mut map, &mut properties, "properties")?;
                }
                PropertyMetadataField::Provenance => {
                    read_field(&mut map, &mut provenance, "provenance")?;
                }
            }
        }

        match (data_type_id, items, properties) {
            (Some(data_type_id), None, None) => {
                Ok(PropertyMetadata::Value(PropertyValueMetadata {
                    data_type_id,
                    provenance,
                }))
            }
            (None, Some(items), None) => Ok(PropertyMetadata::Array(PropertyArrayMetadata {
                items,
                provenance,
            })),
            (None, None, Some(properties)) => {
                Ok(PropertyMetadata::Object(NestedPropertyObjectMetadata {
                    properties,
                    provenance,
                }))
            }
            _ => Err(de::Error::custom(
                "property metadata has to have exactly one of `dataTypeId`, `items` and \
                 `properties`",
            )),
        }
    }
}

/// Reads the value of `field` into `slot`, which a previous key of the same name has not filled.
fn read_field<'de, A, T>(
    map: &mut A,
    slot: &mut Option<T>,
    field: &'static str,
) -> Result<(), A::Error>
where
    A: de::MapAccess<'de>,
    T: Deserialize<'de>,
{
    if slot.is_some() {
        return Err(de::Error::duplicate_field(field));
    }
    *slot = Some(map.next_value()?);
    Ok(())
}

impl<'de> Deserialize<'de> for PropertyMetadata {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(PropertyMetadataVisitor)
    }
}

// A derived schema describes the keys by the pattern of `BaseUrl` instead of referencing it as
// `PropertyObject` does.
impl JsonSchema for PropertyObjectMetadata {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("PropertyObjectMetadata")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "type": "object",
            "description": "The metadata of properties, keyed by the base URL of their property \
                            type.",
            "propertyNames": generator.subschema_for::<BaseUrl>(),
            "additionalProperties": generator.subschema_for::<PropertyMetadata>(),
            "examples": [{
                "https://hash.ai/@h/types/property-type/shortname/": {
                    "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
                "https://hash.ai/@h/types/property-type/preferred-name/": {
                    "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
            }],
        })
    }
}

/// A position in an entity's properties.
#[derive(Debug, Clone)]
enum PathElement {
    Key(BaseUrl),
    Index(usize),
}

/// A path through an entity's properties, written like `["https://…/name/"][1]`.
#[derive(Debug, Clone, Default)]
pub(super) struct PropertyMetadataPath(Vec<PathElement>);

impl fmt::Display for PropertyMetadataPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for element in &self.0 {
            match element {
                PathElement::Key(key) => write!(fmt, "[\"{key}\"]")?,
                PathElement::Index(index) => write!(fmt, "[{index}]")?,
            }
        }
        Ok(())
    }
}

/// The property metadata does not fit the properties.
#[derive(Debug, derive_more::Display)]
pub(super) enum PropertyMetadataMismatch {
    #[display("`propertyMetadata` has no entry for `{_0}`, which `properties` contains")]
    Missing(PropertyMetadataPath),
    #[display("`propertyMetadata` names `{_0}`, which `properties` does not contain")]
    Unknown(PropertyMetadataPath),
    #[display("`propertyMetadata` at `{_0}` does not have the shape of the property there")]
    Shape(PropertyMetadataPath),
    #[display(
        "`propertyMetadata` at `{path}` has {actual} entries, but the list in `properties` has \
         {expected}"
    )]
    Length {
        path: PropertyMetadataPath,
        expected: usize,
        actual: usize,
    },
}

impl Error for PropertyMetadataMismatch {}

impl PropertyObjectMetadata {
    /// The public form of an entity's property metadata, leaving out every value without a data
    /// type and every list with such a value.
    ///
    /// The public form has no place for the provenance of an entity's properties as a whole, so it
    /// is left out.
    pub(super) fn from_stored(metadata: stored::PropertyObjectMetadata) -> Self {
        let stored::PropertyObjectMetadata { value, metadata: _ } = metadata;
        Self::from_stored_entries(value)
    }

    fn from_stored_entries(entries: HashMap<BaseUrl, stored::PropertyMetadata>) -> Self {
        Self(
            entries
                .into_iter()
                .filter_map(|(key, metadata)| {
                    PropertyMetadata::from_stored(metadata).map(|metadata| (key, metadata))
                })
                .collect(),
        )
    }

    /// Joins an entity's `properties` with this metadata, which has to cover every value in them.
    ///
    /// Where the metadata gives a data type, the property is a value, also where `properties`
    /// reads it as a list or as properties keyed by base URL, such as `{}` of an object data type.
    ///
    /// # Errors
    ///
    /// - [`Missing`] if the metadata has no entry for a property in `properties`
    /// - [`Unknown`] if the metadata names a property that `properties` does not contain
    /// - [`Shape`] if the metadata of a property does not have the shape of the property
    /// - [`Length`] if the metadata of a list does not have one entry per property in it
    ///
    /// [`Missing`]: PropertyMetadataMismatch::Missing
    /// [`Unknown`]: PropertyMetadataMismatch::Unknown
    /// [`Shape`]: PropertyMetadataMismatch::Shape
    /// [`Length`]: PropertyMetadataMismatch::Length
    pub(super) fn join(
        self,
        properties: PropertyObject,
    ) -> Result<PropertyObjectWithMetadata, PropertyMetadataMismatch> {
        Ok(PropertyObjectWithMetadata {
            value: self.join_entries(properties, &mut PropertyMetadataPath::default())?,
            metadata: stored::ObjectMetadata {
                provenance: stored::PropertyProvenance {
                    sources: Vec::new(),
                },
                confidence: None,
            },
        })
    }

    fn join_entries(
        mut self,
        properties: PropertyObject,
        path: &mut PropertyMetadataPath,
    ) -> Result<HashMap<BaseUrl, PropertyWithMetadata>, PropertyMetadataMismatch> {
        let mut entries = HashMap::with_capacity(properties.properties().len());
        for (key, property) in properties {
            path.0.push(PathElement::Key(key.clone()));
            let Some(metadata) = self.0.remove(&key) else {
                return Err(PropertyMetadataMismatch::Missing(path.clone()));
            };
            let property = metadata.join_at(property, path)?;
            path.0.pop();
            entries.insert(key, property);
        }

        if let Some(key) = self.0.into_keys().next() {
            path.0.push(PathElement::Key(key));
            return Err(PropertyMetadataMismatch::Unknown(path.clone()));
        }

        Ok(entries)
    }
}

impl PropertyMetadata {
    fn from_stored(metadata: stored::PropertyMetadata) -> Option<Self> {
        match metadata {
            stored::PropertyMetadata::Array(stored::PropertyArrayMetadata {
                value,
                metadata:
                    stored::ArrayMetadata {
                        provenance: stored::PropertyProvenance { sources },
                        confidence: _,
                    },
            }) => value
                .into_iter()
                .map(Self::from_stored)
                .collect::<Option<Vec<_>>>()
                .map(|items| {
                    Self::Array(PropertyArrayMetadata {
                        items,
                        provenance: PropertyProvenance::from_stored(sources),
                    })
                }),
            stored::PropertyMetadata::Object(stored::PropertyObjectMetadata {
                value,
                metadata:
                    stored::ObjectMetadata {
                        provenance: stored::PropertyProvenance { sources },
                        confidence: _,
                    },
            }) => Some(Self::Object(NestedPropertyObjectMetadata {
                properties: PropertyObjectMetadata::from_stored_entries(value),
                provenance: PropertyProvenance::from_stored(sources),
            })),
            stored::PropertyMetadata::Value(stored::PropertyValueMetadata {
                metadata:
                    ValueMetadata {
                        provenance: ValueProvenance { sources },
                        confidence: _,
                        data_type_id,
                        original_data_type_id: _,
                        canonical: _,
                    },
            }) => data_type_id.map(|data_type_id| {
                Self::Value(PropertyValueMetadata {
                    data_type_id,
                    provenance: PropertyProvenance::from_stored(sources),
                })
            }),
        }
    }

    fn join_at(
        self,
        property: Property,
        path: &mut PropertyMetadataPath,
    ) -> Result<PropertyWithMetadata, PropertyMetadataMismatch> {
        match (self, property) {
            (
                Self::Array(PropertyArrayMetadata { items, provenance }),
                Property::Array(properties),
            ) => {
                if items.len() != properties.len() {
                    return Err(PropertyMetadataMismatch::Length {
                        path: path.clone(),
                        expected: properties.len(),
                        actual: items.len(),
                    });
                }

                let mut value = Vec::with_capacity(properties.len());
                for (index, (property, metadata)) in properties.into_iter().zip(items).enumerate() {
                    path.0.push(PathElement::Index(index));
                    value.push(metadata.join_at(property, path)?);
                    path.0.pop();
                }

                Ok(PropertyWithMetadata::Array(PropertyArrayWithMetadata {
                    value,
                    metadata: stored::ArrayMetadata {
                        provenance: stored::PropertyProvenance {
                            sources: provenance.map_or_default(PropertyProvenance::into_stored),
                        },
                        confidence: None,
                    },
                }))
            }
            (
                Self::Object(NestedPropertyObjectMetadata {
                    properties: metadata,
                    provenance,
                }),
                Property::Object(properties),
            ) => Ok(PropertyWithMetadata::Object(PropertyObjectWithMetadata {
                value: metadata.join_entries(properties, path)?,
                metadata: stored::ObjectMetadata {
                    provenance: stored::PropertyProvenance {
                        sources: provenance.map_or_default(PropertyProvenance::into_stored),
                    },
                    confidence: None,
                },
            })),
            (
                Self::Value(PropertyValueMetadata {
                    data_type_id,
                    provenance,
                }),
                property,
            ) => Ok(PropertyWithMetadata::Value(PropertyValueWithMetadata {
                value: into_value(property),
                metadata: ValueMetadata {
                    provenance: ValueProvenance {
                        sources: provenance.map_or_default(PropertyProvenance::into_stored),
                    },
                    confidence: None,
                    data_type_id: Some(data_type_id),
                    original_data_type_id: None,
                    canonical: HashMap::new(),
                },
            })),
            (Self::Array(_) | Self::Object(_), _) => {
                Err(PropertyMetadataMismatch::Shape(path.clone()))
            }
        }
    }
}

/// The value that `property` stands for when its metadata gives it a data type.
fn into_value(property: Property) -> PropertyValue {
    match property {
        Property::Array(properties) => {
            PropertyValue::Array(properties.into_iter().map(into_value).collect())
        }
        Property::Object(properties) => PropertyValue::Object(
            properties
                .into_iter()
                .map(|(key, property)| (String::from(key), into_value(property)))
                .collect(),
        ),
        Property::Value(value) => value,
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use serde_json::json;
    use type_system::{
        knowledge::{
            PropertyValue,
            property::{
                PropertyObject, PropertyObjectWithMetadata, PropertyValueWithMetadata,
                PropertyWithMetadata, metadata as stored,
            },
        },
        ontology::BaseUrl,
    };

    use super::{PropertyMetadataMismatch, PropertyObjectMetadata};

    const NAMES: &str = "https://example.com/@alice/types/property-type/names/";
    const ADDRESS: &str = "https://example.com/@alice/types/property-type/address/";
    const CITY: &str = "https://example.com/@alice/types/property-type/city/";
    const TEXT: &str = "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
    const OBJECT: &str = "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";

    fn properties() -> PropertyObject {
        serde_json::from_value(json!({
            NAMES: ["Alice", "Ally"],
            ADDRESS: { CITY: "Berlin" },
        }))
        .expect("should be a property object")
    }

    fn parse(value: serde_json::Value) -> Result<PropertyObjectMetadata, serde_json::Error> {
        serde_json::from_value(value)
    }

    fn metadata(value: serde_json::Value) -> PropertyObjectMetadata {
        parse(value).expect("should be property metadata")
    }

    fn join(
        value: serde_json::Value,
    ) -> Result<PropertyObjectWithMetadata, PropertyMetadataMismatch> {
        metadata(value).join(properties())
    }

    /// Metadata that fits [`properties`], with sources at a value, a list and nested properties.
    fn with_provenance() -> serde_json::Value {
        json!({
            NAMES: {
                "items": [
                    { "dataTypeId": TEXT, "provenance": { "sources": [{ "type": "webpage" }] } },
                    { "dataTypeId": TEXT },
                ],
                "provenance": { "sources": [{ "type": "document" }] },
            },
            ADDRESS: {
                "properties": { CITY: { "dataTypeId": TEXT } },
                "provenance": { "sources": [{ "type": "integration" }] },
            },
        })
    }

    #[test]
    fn parse_kind_none() {
        assert_matches!(
            parse(json!({ NAMES: { "provenance": { "sources": [] } } })),
            Err(error) if error.to_string().contains("exactly one of `dataTypeId`, `items` and")
        );
    }

    #[test]
    fn parse_kind_two() {
        assert_matches!(
            parse(json!({ NAMES: { "dataTypeId": TEXT, "items": [] } })),
            Err(error) if error.to_string().contains("exactly one of `dataTypeId`, `items` and")
        );
    }

    #[test]
    fn parse_list() {
        assert_matches!(
            parse(json!({ NAMES: [{ "dataTypeId": TEXT }] })),
            Err(error) if error.to_string().contains("invalid type: sequence, expected property \
                                                      metadata")
        );
    }

    #[test]
    fn parse_unknown_field() {
        assert_matches!(
            parse(json!({ NAMES: { "dataTypeId": TEXT, "confidence": 0.5 } })),
            Err(error) if error.to_string().contains("unknown field `confidence`")
        );
    }

    #[test]
    fn parse_duplicate_field() {
        let metadata =
            format!(r#"{{ "{NAMES}": {{ "dataTypeId": "{TEXT}", "dataTypeId": "{OBJECT}" }} }}"#);
        assert_matches!(
            serde_json::from_str::<PropertyObjectMetadata>(&metadata),
            Err(error) if error.to_string().contains("duplicate field `dataTypeId`")
        );
    }

    #[test]
    fn parse_provenance_null() {
        assert_matches!(
            parse(json!({ NAMES: { "dataTypeId": TEXT, "provenance": null } })),
            Err(error) if error.to_string().contains("invalid type: null")
        );
    }

    #[test]
    fn parse_inner_error() {
        let source = json!({ "type": "webpage" });
        assert_matches!(
            parse(json!({ NAMES: { "items": [{
                "dataTypeId": TEXT,
                "provenance": { "sources": vec![source; 128] },
            }] } })),
            Err(error) if error.to_string().contains("the list has 128 sources")
        );
    }

    #[test]
    fn join_missing() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }] },
                ADDRESS: { "properties": {} },
            })),
            Err(PropertyMetadataMismatch::Missing(path))
                if path.to_string() == format!("[\"{ADDRESS}\"][\"{CITY}\"]")
        );
    }

    #[test]
    fn join_unknown() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }] },
                ADDRESS: { "properties": {
                    CITY: { "dataTypeId": TEXT },
                    NAMES: { "dataTypeId": TEXT },
                } },
            })),
            Err(PropertyMetadataMismatch::Unknown(path))
                if path.to_string() == format!("[\"{ADDRESS}\"][\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_list_short() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [{ "dataTypeId": TEXT }] },
                ADDRESS: { "properties": { CITY: { "dataTypeId": TEXT } } },
            })),
            Err(PropertyMetadataMismatch::Length { path, expected: 2, actual: 1 })
                if path.to_string() == format!("[\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_list_long() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [
                    { "dataTypeId": TEXT },
                    { "dataTypeId": TEXT },
                    { "dataTypeId": TEXT },
                ] },
                ADDRESS: { "properties": { CITY: { "dataTypeId": TEXT } } },
            })),
            Err(PropertyMetadataMismatch::Length { path, expected: 2, actual: 3 })
                if path.to_string() == format!("[\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_shape() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }] },
                ADDRESS: { "items": [{ "dataTypeId": TEXT }] },
            })),
            Err(PropertyMetadataMismatch::Shape(path)) if path.to_string() == format!("[\"{ADDRESS}\"]")
        );
    }

    #[test]
    fn join_shape_in_list() {
        assert_matches!(
            join(json!({
                NAMES: { "items": [{ "dataTypeId": TEXT }, { "properties": {} }] },
                ADDRESS: { "properties": { CITY: { "dataTypeId": TEXT } } },
            })),
            Err(PropertyMetadataMismatch::Shape(path)) if path.to_string() == format!("[\"{NAMES}\"][1]")
        );
    }

    #[test]
    fn join_value_read_as_properties() {
        let properties: PropertyObject =
            serde_json::from_value(json!({ ADDRESS: {} })).expect("should be a property object");
        let joined = metadata(json!({ ADDRESS: { "dataTypeId": OBJECT } }))
            .join(properties)
            .expect("should fit the properties");

        assert_matches!(
            joined.value.get(&BaseUrl::new(ADDRESS.to_owned()).expect("should be a base URL")),
            Some(PropertyWithMetadata::Value(PropertyValueWithMetadata {
                value: PropertyValue::Object(object),
                metadata,
            })) if object.is_empty()
                && metadata.data_type_id.as_ref().map(ToString::to_string).as_deref() == Some(OBJECT)
        );
    }

    #[test]
    fn join_provenance() {
        let (_, stored) = join(with_provenance())
            .expect("should fit the properties")
            .into_parts();

        assert_eq!(
            serde_json::to_value(stored).expect("should serialize the metadata"),
            json!({ "value": {
                NAMES: {
                    "value": [
                        { "metadata": {
                            "dataTypeId": TEXT,
                            "provenance": { "sources": [{ "type": "webpage" }] },
                        } },
                        { "metadata": { "dataTypeId": TEXT } },
                    ],
                    "metadata": { "provenance": { "sources": [{ "type": "document" }] } },
                },
                ADDRESS: {
                    "value": { CITY: { "metadata": { "dataTypeId": TEXT } } },
                    "metadata": { "provenance": { "sources": [{ "type": "integration" }] } },
                },
            } }),
            "each source should be stored at the value, the list or the properties it was given \
             for"
        );
    }

    #[test]
    fn from_stored_round_trip() {
        let given = json!({
            NAMES: { "items": [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }] },
            ADDRESS: { "properties": { CITY: { "dataTypeId": TEXT } } },
        });
        let (_, stored) = join(given.clone())
            .expect("should fit the properties")
            .into_parts();

        assert_eq!(
            serde_json::to_value(PropertyObjectMetadata::from_stored(stored))
                .expect("should serialize the metadata"),
            given,
            "every data type should come back at its position"
        );
    }

    #[test]
    fn from_stored_provenance() {
        let stored: stored::PropertyObjectMetadata = serde_json::from_value(json!({
            "value": {
                NAMES: {
                    "value": [
                        { "metadata": {
                            "dataTypeId": TEXT,
                            "provenance": { "sources": [{ "type": "webpage" }] },
                        } },
                        { "metadata": { "dataTypeId": TEXT } },
                    ],
                    "metadata": { "provenance": { "sources": [{ "type": "document" }] } },
                },
                ADDRESS: {
                    "value": { CITY: { "metadata": { "dataTypeId": TEXT } } },
                    "metadata": { "provenance": { "sources": [{ "type": "integration" }] } },
                },
            },
            "metadata": { "provenance": { "sources": [{ "type": "webpage" }] } },
        }))
        .expect("should be stored metadata");

        assert_eq!(
            serde_json::to_value(PropertyObjectMetadata::from_stored(stored))
                .expect("should serialize the metadata"),
            with_provenance(),
            "each source should be shown at its position, and the sources of the properties as a \
             whole should be left out"
        );
    }

    #[test]
    fn from_stored_list_missing_data_type() {
        let stored: stored::PropertyObjectMetadata = serde_json::from_value(json!({ "value": {
            NAMES: { "value": [
                { "metadata": { "dataTypeId": TEXT } },
                { "metadata": { "dataTypeId": null } },
            ] },
            ADDRESS: { "value": { CITY: { "metadata": { "dataTypeId": TEXT } } } },
        } }))
        .expect("should be stored metadata");

        assert_eq!(
            serde_json::to_value(PropertyObjectMetadata::from_stored(stored))
                .expect("should serialize the metadata"),
            json!({ ADDRESS: { "properties": { CITY: { "dataTypeId": TEXT } } } }),
            "a list with a value without data type should be left out"
        );
    }
}
