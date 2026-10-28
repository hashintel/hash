//! The data types of an entity's property values, in the shape of its properties.

use alloc::borrow::Cow;
use core::{error::Error, fmt};
use std::collections::HashMap;

use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Serialize};
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

/// The metadata of properties, keyed by the base URL of their property type.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct PropertyObjectMetadata(HashMap<BaseUrl, PropertyMetadata>);

/// The metadata of a list of properties, one entry per property in the same order.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub(super) struct PropertyArrayMetadata(Vec<PropertyMetadata>);

/// The metadata of a property value.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyValueMetadata {
    /// The data type of the value.
    data_type_id: VersionedUrl,
}

/// The metadata of a property: of a list, of properties keyed by base URL, or of a value.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub(super) enum PropertyMetadata {
    Array(PropertyArrayMetadata),
    Object(PropertyObjectMetadata),
    Value(PropertyValueMetadata),
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
    /// The public form of `metadata`, leaving out every value without a data type and every list
    /// with such a value.
    pub(super) fn from_stored(metadata: stored::PropertyObjectMetadata) -> Self {
        Self(
            metadata
                .value
                .into_iter()
                .filter_map(|(key, metadata)| {
                    PropertyMetadata::from_stored(metadata).map(|metadata| (key, metadata))
                })
                .collect(),
        )
    }

    /// Joins `properties` with this metadata, which has to cover every value in them.
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
        self.join_at(properties, &mut PropertyMetadataPath::default())
    }

    fn join_at(
        mut self,
        properties: PropertyObject,
        path: &mut PropertyMetadataPath,
    ) -> Result<PropertyObjectWithMetadata, PropertyMetadataMismatch> {
        let mut value = HashMap::with_capacity(properties.properties().len());
        for (key, property) in properties {
            path.0.push(PathElement::Key(key.clone()));
            let Some(metadata) = self.0.remove(&key) else {
                return Err(PropertyMetadataMismatch::Missing(path.clone()));
            };
            let property = metadata.join_at(property, path)?;
            path.0.pop();
            value.insert(key, property);
        }

        if let Some(key) = self.0.into_keys().next() {
            path.0.push(PathElement::Key(key));
            return Err(PropertyMetadataMismatch::Unknown(path.clone()));
        }

        Ok(PropertyObjectWithMetadata {
            value,
            metadata: stored::ObjectMetadata::default(),
        })
    }
}

impl PropertyMetadata {
    fn from_stored(metadata: stored::PropertyMetadata) -> Option<Self> {
        match metadata {
            stored::PropertyMetadata::Array(array) => array
                .value
                .into_iter()
                .map(Self::from_stored)
                .collect::<Option<Vec<_>>>()
                .map(|elements| Self::Array(PropertyArrayMetadata(elements))),
            stored::PropertyMetadata::Object(object) => {
                Some(Self::Object(PropertyObjectMetadata::from_stored(object)))
            }
            stored::PropertyMetadata::Value(value) => value
                .metadata
                .data_type_id
                .map(|data_type_id| Self::Value(PropertyValueMetadata { data_type_id })),
        }
    }

    fn join_at(
        self,
        property: Property,
        path: &mut PropertyMetadataPath,
    ) -> Result<PropertyWithMetadata, PropertyMetadataMismatch> {
        match (self, property) {
            (Self::Array(PropertyArrayMetadata(elements)), Property::Array(properties)) => {
                if elements.len() != properties.len() {
                    return Err(PropertyMetadataMismatch::Length {
                        path: path.clone(),
                        expected: properties.len(),
                        actual: elements.len(),
                    });
                }

                let mut value = Vec::with_capacity(properties.len());
                for (index, (property, metadata)) in
                    properties.into_iter().zip(elements).enumerate()
                {
                    path.0.push(PathElement::Index(index));
                    value.push(metadata.join_at(property, path)?);
                    path.0.pop();
                }

                Ok(PropertyWithMetadata::Array(PropertyArrayWithMetadata {
                    value,
                    metadata: stored::ArrayMetadata::default(),
                }))
            }
            (Self::Object(object), Property::Object(properties)) => Ok(
                PropertyWithMetadata::Object(object.join_at(properties, path)?),
            ),
            (Self::Value(PropertyValueMetadata { data_type_id }), property) => {
                Ok(PropertyWithMetadata::Value(PropertyValueWithMetadata {
                    value: into_value(property),
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: None,
                        data_type_id: Some(data_type_id),
                        original_data_type_id: None,
                        canonical: HashMap::new(),
                    },
                }))
            }
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

    fn metadata(value: serde_json::Value) -> PropertyObjectMetadata {
        serde_json::from_value(value).expect("should be property metadata")
    }

    fn join(
        value: serde_json::Value,
    ) -> Result<PropertyObjectWithMetadata, PropertyMetadataMismatch> {
        metadata(value).join(properties())
    }

    #[test]
    fn join_missing() {
        assert_matches!(
            join(json!({ NAMES: [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }], ADDRESS: {} })),
            Err(PropertyMetadataMismatch::Missing(path))
                if path.to_string() == format!("[\"{ADDRESS}\"][\"{CITY}\"]")
        );
    }

    #[test]
    fn join_unknown() {
        assert_matches!(
            join(json!({
                NAMES: [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }],
                ADDRESS: { CITY: { "dataTypeId": TEXT }, NAMES: { "dataTypeId": TEXT } },
            })),
            Err(PropertyMetadataMismatch::Unknown(path))
                if path.to_string() == format!("[\"{ADDRESS}\"][\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_list_short() {
        assert_matches!(
            join(json!({ NAMES: [{ "dataTypeId": TEXT }], ADDRESS: { CITY: { "dataTypeId": TEXT } } })),
            Err(PropertyMetadataMismatch::Length { path, expected: 2, actual: 1 })
                if path.to_string() == format!("[\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_list_long() {
        assert_matches!(
            join(json!({
                NAMES: [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }, { "dataTypeId": TEXT }],
                ADDRESS: { CITY: { "dataTypeId": TEXT } },
            })),
            Err(PropertyMetadataMismatch::Length { path, expected: 2, actual: 3 })
                if path.to_string() == format!("[\"{NAMES}\"]")
        );
    }

    #[test]
    fn join_shape() {
        assert_matches!(
            join(json!({
                NAMES: [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }],
                ADDRESS: [{ "dataTypeId": TEXT }],
            })),
            Err(PropertyMetadataMismatch::Shape(path)) if path.to_string() == format!("[\"{ADDRESS}\"]")
        );
    }

    #[test]
    fn join_shape_in_list() {
        assert_matches!(
            join(json!({
                NAMES: [{ "dataTypeId": TEXT }, {}],
                ADDRESS: { CITY: { "dataTypeId": TEXT } },
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
    fn from_stored_round_trip() {
        let given = json!({
            NAMES: [{ "dataTypeId": TEXT }, { "dataTypeId": TEXT }],
            ADDRESS: { CITY: { "dataTypeId": TEXT } },
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
            json!({ ADDRESS: { CITY: { "dataTypeId": TEXT } } }),
            "a list with a value without data type should be left out"
        );
    }
}
