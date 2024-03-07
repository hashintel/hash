use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    url::{BaseUrl, VersionedUrl},
    EntityType, EntityTypeReference, Links, PropertyTypeReference, ValueOrArray,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityTypeSchemaData {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityType {
    pub schemas: HashMap<VersionedUrl, ClosedEntityTypeSchemaData>,
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub required: HashSet<BaseUrl>,
    #[serde(flatten)]
    pub links: Links,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    pub inherits_from: HashSet<EntityTypeReference>,
}

impl From<EntityType> for ClosedEntityType {
    fn from(entity_type: EntityType) -> Self {
        Self {
            schemas: HashMap::from([(
                entity_type.id,
                ClosedEntityTypeSchemaData {
                    title: entity_type.title,
                    description: entity_type.description,
                },
            )]),
            properties: entity_type.property_object.properties,
            required: entity_type.property_object.required,
            links: entity_type.links,
            inherits_from: entity_type.inherits_from.elements.into_iter().collect(),
        }
    }
}

impl FromIterator<EntityType> for ClosedEntityType {
    fn from_iter<T: IntoIterator<Item = EntityType>>(iter: T) -> Self {
        let iter = iter.into_iter();

        let mut entity_type = Self {
            schemas: HashMap::with_capacity(iter.size_hint().0),
            properties: HashMap::new(),
            required: HashSet::new(),
            links: Links(HashMap::new()),
            inherits_from: HashSet::new(),
        };
        entity_type.extend(iter);
        entity_type
    }
}

impl Extend<Self> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for other in iter {
            self.inherits_from.extend(other.inherits_from);
            self.schemas.extend(other.schemas);
            self.properties.extend(other.properties);
            self.required.extend(other.required);
            self.links.extend_one(other.links);
        }

        self.inherits_from
            .retain(|x| !self.schemas.contains_key(x.url()));
    }
}

impl Extend<EntityType> for ClosedEntityType {
    fn extend<T: IntoIterator<Item = EntityType>>(&mut self, iter: T) {
        for other in iter {
            self.inherits_from.extend(other.inherits_from.elements);
            self.schemas.insert(
                other.id,
                ClosedEntityTypeSchemaData {
                    title: other.title,
                    description: other.description,
                },
            );
            self.properties.extend(other.property_object.properties);
            self.required.extend(other.property_object.required);
            self.links.extend_one(other.links);
        }

        self.inherits_from
            .retain(|x| !self.schemas.contains_key(x.url()));
    }
}
