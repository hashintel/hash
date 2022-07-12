use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::types::schema::{
    array::{Array, MaybeOrdered},
    combinator::Optional,
    object::Object,
    property_type::PropertyTypeReference,
    Uri, ValidationError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::use_self)]
pub enum EntityTypeTag {
    EntityType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTypeRepr {
    kind: EntityTypeTag,
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    default: HashMap<Uri, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    examples: Vec<HashMap<Uri, serde_json::Value>>,
    #[serde(flatten)]
    properties: Object<PropertyTypeReference>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    links: HashMap<String, Optional<MaybeOrdered<Array>>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    required_links: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "EntityTypeRepr")]
pub struct EntityType {
    #[serde(flatten)]
    repr: EntityTypeRepr,
}

impl EntityType {
    /// Creates a new `EntityType` without validating.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new_unchecked(
        id: Uri,
        title: impl Into<String>,
        description: impl Into<Option<String>>,
        default: impl Into<HashMap<Uri, serde_json::Value>>,
        examples: impl Into<Vec<HashMap<Uri, serde_json::Value>>>,
        properties: impl Into<HashMap<Uri, PropertyTypeReference>>,
        required: impl Into<Vec<Uri>>,
        links: impl Into<HashMap<String, Optional<MaybeOrdered<Array>>>>,
        required_links: impl Into<Vec<String>>,
    ) -> Self {
        Self {
            repr: EntityTypeRepr {
                kind: EntityTypeTag::EntityType,
                id,
                title: title.into(),
                description: description.into(),
                default: default.into(),
                examples: examples.into(),
                properties: Object::new_unchecked(properties, required),
                links: links.into(),
                required_links: required_links.into(),
            },
        }
    }

    /// Creates a new `PropertyType`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::MissingRequiredProperty`] if a required property is not a key in
    ///   `properties`.
    /// - [`ValidationError::MissingRequiredLink`] if a required link is not a key in `links`.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: Uri,
        title: impl Into<String>,
        description: impl Into<Option<String>>,
        default: impl Into<HashMap<Uri, serde_json::Value>>,
        examples: impl Into<Vec<HashMap<Uri, serde_json::Value>>>,
        properties: impl Into<HashMap<Uri, PropertyTypeReference>>,
        required: impl Into<Vec<Uri>>,
        links: impl Into<HashMap<String, Optional<MaybeOrdered<Array>>>>,
        required_links: impl Into<Vec<String>>,
    ) -> Result<Self, ValidationError> {
        let entity_type = Self {
            repr: EntityTypeRepr {
                kind: EntityTypeTag::EntityType,
                id,
                title: title.into(),
                description: description.into(),
                default: default.into(),
                examples: examples.into(),
                properties: Object::new(properties, required)?,
                links: links.into(),
                required_links: required_links.into(),
            },
        };
        entity_type.validate()?;
        Ok(entity_type)
    }

    fn validate(&self) -> Result<(), ValidationError> {
        for link in self.required_links() {
            if !self.links().contains_key(link) {
                return Err(ValidationError::MissingRequiredLink(link.clone()));
            }
        }
        Ok(())
    }

    #[must_use]
    pub const fn id(&self) -> &Uri {
        &self.repr.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.repr.title
    }

    #[must_use]
    pub fn description(&self) -> Option<&str> {
        self.repr.description.as_deref()
    }

    #[must_use]
    pub const fn default(&self) -> &HashMap<Uri, serde_json::Value> {
        &self.repr.default
    }

    #[must_use]
    pub const fn examples(&self) -> &Vec<HashMap<Uri, serde_json::Value>> {
        &self.repr.examples
    }

    #[must_use]
    pub const fn properties(&self) -> &HashMap<Uri, PropertyTypeReference> {
        self.repr.properties.properties()
    }

    #[must_use]
    pub fn required(&self) -> &[Uri] {
        self.repr.properties.required()
    }

    #[must_use]
    pub const fn links(&self) -> &HashMap<String, Optional<MaybeOrdered<Array>>> {
        &self.repr.links
    }

    #[must_use]
    pub fn required_links(&self) -> &[String] {
        &self.repr.required_links
    }

    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.properties().iter().map(|(_, uri)| uri).collect()
    }

    #[must_use]
    pub fn link_references(&self) -> HashSet<&str> {
        self.links().iter().map(|(link, _)| link.as_str()).collect()
    }
}

impl TryFrom<EntityTypeRepr> for EntityType {
    type Error = ValidationError;

    fn try_from(entity_type: EntityTypeRepr) -> Result<Self, ValidationError> {
        let entity_type = Self { repr: entity_type };
        entity_type.validate()?;
        Ok(entity_type)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn test_entity_type_schema(schema: &serde_json::Value) -> EntityType {
        let entity_type: EntityType =
            serde_json::from_value(schema.clone()).expect("invalid schema");
        assert_eq!(
            serde_json::to_value(entity_type.clone()).expect("Could not serialize"),
            *schema,
            "{entity_type:#?}"
        );
        entity_type
    }

    fn test_property_refs(entity_type: &EntityType, uris: impl IntoIterator<Item = &'static str>) {
        let expected_property_references = uris.into_iter().map(Uri::new).collect::<HashSet<_>>();

        let property_references = entity_type
            .property_type_references()
            .into_iter()
            .map(PropertyTypeReference::reference)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(property_references, expected_property_references);
    }

    fn test_link_refs(entity_type: &EntityType, links: impl IntoIterator<Item = &'static str>) {
        let expected_link_references = links.into_iter().collect::<HashSet<_>>();
        let link_references = entity_type.link_references();

        assert_eq!(link_references, expected_link_references);
    }

    #[test]
    fn book() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/book",
            "title": "Book",
            "type": "object",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                },
                "https://blockprotocol.org/types/@alice/property-type/blurb": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/blurb"
                },
                "https://blockprotocol.org/types/@alice/property-type/published-on": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/published-on"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/name"
            ],
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/written-by": {}
            },
            "requiredLinks": [
                "https://blockprotocol.org/types/@alice/property-type/written-by"
            ]
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/name",
            "https://blockprotocol.org/types/@alice/property-type/blurb",
            "https://blockprotocol.org/types/@alice/property-type/published-on",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/written-by",
        ]);
    }

    #[test]
    fn address() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/uk-address",
            "type": "object",
            "title": "UK Address",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/address-line-1": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/address-line-1"
                },
                "https://blockprotocol.org/types/@alice/property-type/postcode": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/postcode"
                },
                "https://blockprotocol.org/types/@alice/property-type/city": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/city"
                }
            },
            "required": [
                "https://blockprotocol.org/types/@alice/property-type/address-line-1",
                "https://blockprotocol.org/types/@alice/property-type/postcode",
                "https://blockprotocol.org/types/@alice/property-type/city"
            ]
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/address-line-1",
            "https://blockprotocol.org/types/@alice/property-type/postcode",
            "https://blockprotocol.org/types/@alice/property-type/city",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn organization() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/organization",
            "type": "object",
            "title": "Organization",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                }
            }
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/name",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn building() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/building",
            "type": "object",
            "title": "Bulding",
            "properties": {},
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/located-at": {},
                "https://blockprotocol.org/types/@alice/property-type/tenant": {}
            }
        }));

        test_property_refs(&entity_type, []);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/located-at",
            "https://blockprotocol.org/types/@alice/property-type/tenant",
        ]);
    }

    #[test]
    fn person() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/person",
            "type": "object",
            "title": "Person",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                }
            },
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/friend-of": {
                    "type": "array",
                    "ordered": false
                }
            }
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/name",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/friend-of",
        ]);
    }

    #[test]
    fn playlist() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/playlist",
            "type": "object",
            "title": "Playlist",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"}
            },
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/contains": {
                    "type": "array",
                    "ordered": true
                }
            }
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/name",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/contains",
        ]);
    }

    #[test]
    fn song() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/Song",
            "type": "object",
            "title": "Song",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/name": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/name"
                }
            }
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/name",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn page() {
        let entity_type = test_entity_type_schema(&json!({
            "kind": "entityType",
            "$id": "https://blockprotocol.org/types/@alice/entity-type/page",
            "type": "object",
            "title": "Page",
            "properties": {
                "https://blockprotocol.org/types/@alice/property-type/text": {
                    "$ref": "https://blockprotocol.org/types/@alice/property-type/text"
                }
            },
            "links": {
                "https://blockprotocol.org/types/@alice/property-type/written-by": {},
                "https://blockprotocol.org/types/@alice/property-type/contains": {
                    "type": "array",
                    "ordered": true
                }
            }
        }));

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/text",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/types/@alice/property-type/written-by",
            "https://blockprotocol.org/types/@alice/property-type/contains",
        ]);
    }
}
