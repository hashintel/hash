use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    schema::{
        EntityType, EntityTypeReference, PropertyTypeReference, PropertyValueArray, ValueOrArray,
        entity_type::extend_links, one_of::OneOfSchema,
    },
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityTypeSchemaData {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityType {
    pub schemas: HashMap<VersionedUrl, ClosedEntityTypeSchemaData>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub required: HashSet<BaseUrl>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub all_of: HashSet<EntityTypeReference>,
}

impl From<EntityType> for ClosedEntityType {
    fn from(entity_type: EntityType) -> Self {
        Self {
            schemas: HashMap::from([(entity_type.id, ClosedEntityTypeSchemaData {
                title: entity_type.title,
                description: entity_type.description,
            })]),
            properties: entity_type.properties,
            required: entity_type.required,
            links: entity_type.links,
            all_of: entity_type.all_of.into_iter().collect(),
        }
    }
}

impl FromIterator<EntityType> for ClosedEntityType {
    fn from_iter<T: IntoIterator<Item = EntityType>>(iter: T) -> Self {
        let mut entity_type = Self::default();
        entity_type.extend(iter);
        entity_type
    }
}

impl FromIterator<Self> for ClosedEntityType {
    fn from_iter<T: IntoIterator<Item = Self>>(iter: T) -> Self {
        let mut entity_type = Self::default();
        entity_type.extend(iter);
        entity_type
    }
}

impl Extend<Self> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for other in iter {
            self.all_of.extend(other.all_of);
            self.schemas.extend(other.schemas);
            self.properties.extend(other.properties);
            self.required.extend(other.required);
            extend_links(&mut self.links, other.links);
        }

        self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
    }
}

impl Extend<EntityType> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = EntityType>>(&mut self, iter: T) {
        for other in iter {
            self.all_of.extend(other.all_of);
            self.schemas.insert(other.id, ClosedEntityTypeSchemaData {
                title: other.title,
                description: other.description,
            });
            self.properties.extend(other.properties);
            self.required.extend(other.required);
            extend_links(&mut self.links, other.links);
        }

        self.all_of.retain(|x| !self.schemas.contains_key(&x.url));
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        schema::{ClosedEntityType, EntityType},
        url::BaseUrl,
        utils::tests::{JsonEqualityCheck, ensure_serialization_from_str},
    };

    #[test]
    fn merge_entity_type() {
        let building = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::BUILDING_V1,
            JsonEqualityCheck::Yes,
        );
        let church: EntityType = ensure_serialization_from_str::<EntityType>(
            graph_test_data::entity_type::CHURCH_V1,
            JsonEqualityCheck::Yes,
        );

        let closed_church: ClosedEntityType = [building, church].into_iter().collect();

        assert!(
            closed_church.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/built-at/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(
            closed_church.properties.contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/number-bells/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(closed_church.all_of.is_empty());
    }
}
