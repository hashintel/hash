pub use self::{
    closed::{ClosedEntityType, ClosedEntityTypeSchemaData},
    reference::EntityTypeReference,
    validation::{EntityTypeValidationError, EntityTypeValidator},
};

mod closed;
mod raw;
mod reference;
mod validation;

use std::collections::{HashMap, HashSet, hash_map::Entry};

use serde::{Deserialize, Serialize, Serializer};

use crate::{
    schema::{PropertyTypeReference, PropertyValueArray, ValueOrArray, one_of::OneOfSchema},
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "raw::EntityType")]
pub struct EntityType {
    pub id: VersionedUrl,
    pub title: String,
    pub description: Option<String>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    pub required: HashSet<BaseUrl>,
    pub all_of: HashSet<EntityTypeReference>,
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
    #[deprecated]
    pub examples: Vec<HashMap<BaseUrl, serde_json::Value>>,
}

impl Serialize for EntityType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::EntityType::from(self).serialize(serializer)
    }
}

impl EntityType {
    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.properties
            .values()
            .map(|property_def| match property_def {
                ValueOrArray::Value(url) => url,
                ValueOrArray::Array(array) => &array.items,
            })
            .collect()
    }

    #[must_use]
    pub fn link_mappings(&self) -> HashMap<&EntityTypeReference, Option<&[EntityTypeReference]>> {
        self.links
            .iter()
            .map(|(link_entity_type, destination_constraint_entity_types)| {
                (
                    <&EntityTypeReference>::from(link_entity_type),
                    destination_constraint_entity_types
                        .items
                        .as_ref()
                        .map(|one_of| one_of.possibilities.as_slice()),
                )
            })
            .collect()
    }
}

fn extend_links(
    current: &mut HashMap<
        VersionedUrl,
        PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>,
    >,
    iter: impl IntoIterator<
        Item = (
            VersionedUrl,
            PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>,
        ),
    >,
) {
    for (id, new_destinations) in iter {
        match current.entry(id) {
            Entry::Vacant(entry) => {
                entry.insert(new_destinations);
            }
            Entry::Occupied(mut entry) => {
                let entry = entry.get_mut();
                let existing_destination_items = &mut entry.items;
                let new_destination_items = new_destinations.items;

                match (
                    new_destination_items.as_ref(),
                    existing_destination_items.as_mut(),
                ) {
                    (Some(destinations), Some(existing_destinations)) => {
                        existing_destinations
                            .possibilities
                            .retain(|existing_destination| {
                                destinations.possibilities.contains(existing_destination)
                            });
                    }
                    (Some(_), None) => {
                        *existing_destination_items = new_destination_items;
                    }
                    (None, _) => {}
                }

                match (new_destinations.min_items, entry.min_items) {
                    (Some(min_items), Some(existing_min_items)) => {
                        entry.min_items = Some(existing_min_items.max(min_items));
                    }
                    (Some(_), None) => {
                        entry.min_items = new_destinations.min_items;
                    }
                    (None, _) => {}
                }
                match (new_destinations.max_items, entry.max_items) {
                    (Some(max_items), Some(existing_max_items)) => {
                        entry.max_items = Some(existing_max_items.min(max_items));
                    }
                    (Some(_), None) => {
                        entry.max_items = new_destinations.max_items;
                    }
                    (None, _) => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        JsonEqualityCheck, ensure_failed_validation, ensure_validation_from_str,
    };

    fn test_property_type_references(
        entity_type: &EntityType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let property_type_references = entity_type
            .property_type_references()
            .into_iter()
            .map(|property_type_ref| property_type_ref.url.clone())
            .collect::<HashSet<_>>();

        assert_eq!(property_type_references, expected_property_type_references);
    }

    fn test_link_mappings(
        entity_type: &EntityType,
        links: impl IntoIterator<Item = (&'static str, Vec<&'static str>)>,
    ) {
        let expected_link_entity_type_references = links
            .into_iter()
            .map(|(link_entity_type_url, entity_type_urls)| {
                (
                    VersionedUrl::from_str(link_entity_type_url).expect("invalid URL"),
                    entity_type_urls
                        .into_iter()
                        .map(|entity_type_url| {
                            VersionedUrl::from_str(entity_type_url).expect("invalid URL")
                        })
                        .collect::<Vec<_>>(),
                )
            })
            .collect::<HashMap<_, _>>();

        let link_entity_type_references = entity_type
            .link_mappings()
            .into_iter()
            .map(|(link_entity_type_url, entity_type_ref)| {
                (
                    link_entity_type_url.url.clone(),
                    entity_type_ref.map_or(vec![], |inner| {
                        inner
                            .iter()
                            .map(|reference| reference.url.clone())
                            .collect()
                    }),
                )
            })
            .collect::<HashMap<_, _>>();

        assert_eq!(
            link_entity_type_references,
            expected_link_entity_type_references
        );
    }

    #[tokio::test]
    async fn book() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::BOOK_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
            "https://blockprotocol.org/@alice/types/property-type/blurb/v/1",
            "https://blockprotocol.org/@alice/types/property-type/published-on/v/1",
        ]);

        test_link_mappings(&entity_type, [(
            "https://blockprotocol.org/@alice/types/entity-type/written-by/v/1",
            vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
        )]);
    }

    #[tokio::test]
    async fn address() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::UK_ADDRESS_V1,
            EntityTypeValidator,
            JsonEqualityCheck::No,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/address-line-1/v/1",
            "https://blockprotocol.org/@alice/types/property-type/postcode/v/1",
            "https://blockprotocol.org/@alice/types/property-type/city/v/1",
        ]);

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn organization() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::ORGANIZATION_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn building() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::BUILDING_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/built-at/v/1",
        ]);

        test_link_mappings(&entity_type, [
            (
                "https://blockprotocol.org/@alice/types/entity-type/located-at/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/uk-address/v/1"],
            ),
            (
                "https://blockprotocol.org/@alice/types/entity-type/tenant/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
            ),
        ]);
    }

    #[tokio::test]
    async fn person() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::PERSON_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
            "https://blockprotocol.org/@alice/types/property-type/age/v/1",
            "https://blockprotocol.org/@alice/types/property-type/interests/v/1",
        ]);

        test_link_mappings(&entity_type, [
            (
                "https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
            ),
            (
                "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
            ),
        ]);
    }

    #[tokio::test]
    async fn playlist() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::PLAYLIST_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_mappings(&entity_type, [(
            "https://blockprotocol.org/@alice/types/entity-type/contains/v/1",
            vec!["https://blockprotocol.org/@alice/types/entity-type/song/v/1"],
        )]);
    }

    #[tokio::test]
    async fn song() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::SONG_V1,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/name/v/1",
        ]);

        test_link_mappings(&entity_type, []);
    }

    #[tokio::test]
    async fn page() {
        let entity_type = ensure_validation_from_str::<EntityType, _>(
            graph_test_data::entity_type::PAGE_V2,
            EntityTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_references(&entity_type, [
            "https://blockprotocol.org/@alice/types/property-type/text/v/1",
        ]);

        test_link_mappings(&entity_type, [
            (
                "https://blockprotocol.org/@alice/types/entity-type/written-by/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/person/v/1"],
            ),
            (
                "https://blockprotocol.org/@alice/types/entity-type/contains/v/1",
                vec!["https://blockprotocol.org/@alice/types/entity-type/block/v/1"],
            ),
        ]);
    }

    #[tokio::test]
    async fn invalid_url() {
        assert!(matches!(
            ensure_failed_validation::<EntityType, _>(
                json!({
                    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                    "kind": "entityType",
                    "$id": "https://blockprotocol.org/@alice/types/entity-type/invalid/v/1",
                    "type": "object",
                    "title": "Invalid",
                    "properties": {
                        "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_b/v/1" }
                    }
                }),
                EntityTypeValidator,
                JsonEqualityCheck::Yes,
            ).await,
            EntityTypeValidationError::InvalidPropertyReference {..}
        ));
    }
}
