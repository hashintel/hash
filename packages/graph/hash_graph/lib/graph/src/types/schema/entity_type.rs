use std::collections::{HashMap, HashSet};

use error_stack::Result;
use serde::{Deserialize, Serialize};

use crate::types::{
    schema::{
        array::{Array, MaybeOrdered},
        combinator::Optional,
        link::Links,
        object::Object,
        property_type::PropertyTypeReference,
        ValidationError, VersionedUri,
    },
    BaseUri,
};

/// Will serialize as a constant value `"entityType"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::use_self)]
pub enum EntityTypeTag {
    EntityType,
}

/// Intermediate representation used during deserialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityType {
    kind: EntityTypeTag,
    #[serde(rename = "$id")]
    id: VersionedUri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    default: HashMap<VersionedUri, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    examples: Vec<HashMap<VersionedUri, serde_json::Value>>,
    #[serde(flatten)]
    property_object: Object<PropertyTypeReference>,
    #[serde(flatten)]
    links: Links,
}

impl EntityType {
    /// Creates a new `EntityType` without validating.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new_unchecked(
        id: VersionedUri,
        title: String,
        description: Option<String>,
        default: HashMap<VersionedUri, serde_json::Value>,
        examples: Vec<HashMap<VersionedUri, serde_json::Value>>,
        properties: HashMap<BaseUri, PropertyTypeReference>,
        required: Vec<BaseUri>,
        links: HashMap<VersionedUri, Optional<MaybeOrdered<Array>>>,
        required_links: Vec<VersionedUri>,
    ) -> Self {
        Self {
            kind: EntityTypeTag::EntityType,
            id,
            title,
            description,
            default,
            examples,
            property_object: Object::new_unchecked(properties, required),
            links: Links::new_unchecked(links, required_links),
        }
    }

    /// Creates a new `EntityType`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::MissingRequiredProperty`] if a required property is not a key in
    ///   `properties`.
    /// - [`ValidationError::MissingRequiredLink`] if a required link is not a key in `links`.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: VersionedUri,
        title: String,
        description: Option<String>,
        default: HashMap<VersionedUri, serde_json::Value>,
        examples: Vec<HashMap<VersionedUri, serde_json::Value>>,
        properties: HashMap<BaseUri, PropertyTypeReference>,
        required: Vec<BaseUri>,
        links: HashMap<VersionedUri, Optional<MaybeOrdered<Array>>>,
        required_links: Vec<VersionedUri>,
    ) -> Result<Self, ValidationError> {
        Ok(Self {
            kind: EntityTypeTag::EntityType,
            id,
            title,
            description,
            default,
            examples,
            property_object: Object::new(properties, required)?,
            links: Links::new(links, required_links)?,
        })
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUri {
        &self.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[must_use]
    pub const fn default(&self) -> &HashMap<VersionedUri, serde_json::Value> {
        &self.default
    }

    #[must_use]
    pub const fn examples(&self) -> &Vec<HashMap<VersionedUri, serde_json::Value>> {
        &self.examples
    }

    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUri, PropertyTypeReference> {
        self.property_object.properties()
    }

    #[must_use]
    pub fn required(&self) -> &[BaseUri] {
        self.property_object.required()
    }

    #[must_use]
    pub const fn links(&self) -> &HashMap<VersionedUri, Optional<MaybeOrdered<Array>>> {
        self.links.links()
    }

    #[must_use]
    pub fn required_links(&self) -> &[VersionedUri] {
        self.links.required()
    }

    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.properties().iter().map(|(_, uri)| uri).collect()
    }

    #[must_use]
    pub fn link_references(&self) -> HashSet<&VersionedUri> {
        self.links().iter().map(|(link, _)| link).collect()
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

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
        let expected_property_references = uris
            .into_iter()
            .map(ToString::to_string)
            .collect::<HashSet<_>>();

        let property_references = entity_type
            .property_type_references()
            .into_iter()
            .map(|reference| reference.uri().to_string())
            .collect::<HashSet<_>>();

        assert_eq!(property_references, expected_property_references);
    }

    fn test_link_refs(entity_type: &EntityType, links: impl IntoIterator<Item = &'static str>) {
        let expected_link_references = links
            .into_iter()
            .map(|uri| VersionedUri::from_str(uri).expect("Invalid URI"))
            .collect::<HashSet<_>>();
        let link_references = entity_type
            .link_references()
            .into_iter()
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(link_references, expected_link_references);
    }

    #[test]
    fn book() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::BOOK_V1).expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
            "https://blockprotocol.org/@alice/types/property-type/blurb/v/1",
            "https://blockprotocol.org/@alice/types/property-type/published-on/v/1",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/written-by/v/1",
        ]);
    }

    #[test]
    fn address() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::ADDRESS_V1).expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/address-line-1/v/1",
            "https://blockprotocol.org/@alice/types/property-type/postcode/v/1",
            "https://blockprotocol.org/@alice/types/property-type/city/v/1",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn organization() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::ORGANIZATION_V1)
                .expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn building() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::BUILDING_V1)
                .expect("invalid JSON"),
        );

        test_property_refs(&entity_type, []);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/located-at/v/1",
            "https://blockprotocol.org/@alice/types/property-type/tenant/v/1",
        ]);
    }

    #[test]
    fn person() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::PERSON_V1).expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/friend-of/v/1",
        ]);
    }

    #[test]
    fn playlist() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::PLAYLIST_V1)
                .expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/contains/v/1",
        ]);
    }

    #[test]
    fn song() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::SONG_V1).expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_refs(&entity_type, []);
    }

    #[test]
    fn page() {
        let entity_type = test_entity_type_schema(
            &serde_json::from_str(crate::test_data::entity_type::PAGE_V1).expect("invalid JSON"),
        );

        test_property_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/text/v/1",
        ]);

        test_link_refs(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/written-by/v/1",
            "https://blockprotocol.org/@alice/types/property-type/contains/v/1",
        ]);
    }
}
