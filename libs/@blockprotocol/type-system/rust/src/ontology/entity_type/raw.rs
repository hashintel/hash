use std::{collections::HashMap, str::FromStr};

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    raw,
    url::{BaseUrl, ParseVersionedUrlError, VersionedUrl},
    ParseEntityTypeError,
};

const META_SCHEMA_ID: &str = "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type";

/// Will serialize as a constant value `"entityType"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum EntityTypeTag {
    EntityType,
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityType {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "'https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type'")
    )]
    #[serde(rename = "$schema")]
    schema: String,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "'entityType'"))]
    kind: EntityTypeTag,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "VersionedUrl"))]
    #[serde(rename = "$id")]
    pub id: String,
    pub title: String,
    #[cfg_attr(target_arch = "wasm32", tsify(optional))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(flatten)]
    pub all_of: raw::AllOf<EntityTypeReference>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(optional, type = "Record<BaseUrl, any>[]")
    )]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<HashMap<String, serde_json::Value>>,
    #[serde(flatten)]
    pub property_object: raw::Object<raw::ValueOrArray<raw::PropertyTypeReference>>,
    #[serde(flatten)]
    pub links: raw::Links,
}

impl TryFrom<EntityType> for super::EntityType {
    type Error = ParseEntityTypeError;

    fn try_from(entity_type_repr: EntityType) -> Result<Self, Self::Error> {
        let id = VersionedUrl::from_str(&entity_type_repr.id)
            .map_err(ParseEntityTypeError::InvalidVersionedUrl)?;

        if entity_type_repr.schema != META_SCHEMA_ID {
            return Err(ParseEntityTypeError::InvalidMetaSchema(
                entity_type_repr.schema,
            ));
        }

        // TODO - validate examples against the entity type
        let examples = entity_type_repr
            .examples
            .into_iter()
            .map(|example_hash_map| {
                example_hash_map
                    .into_iter()
                    .map(|(url, val)| {
                        Ok((
                            BaseUrl::new(url).map_err(ParseEntityTypeError::InvalidExamplesKey)?,
                            val,
                        ))
                    })
                    .collect()
            })
            .collect::<Result<_, _>>()?;

        let property_object = entity_type_repr
            .property_object
            .try_into()
            .map_err(ParseEntityTypeError::InvalidPropertyTypeObject)?;

        let inherits_from = entity_type_repr
            .all_of
            .try_into()
            .map_err(ParseEntityTypeError::InvalidAllOf)?;

        let links = entity_type_repr
            .links
            .try_into()
            .map_err(ParseEntityTypeError::InvalidLinks)?;

        Ok(Self::new(
            id,
            entity_type_repr.title,
            entity_type_repr.description,
            property_object,
            inherits_from,
            links,
            examples,
        ))
    }
}

impl From<super::EntityType> for EntityType {
    fn from(entity_type: super::EntityType) -> Self {
        let examples = entity_type
            .examples
            .into_iter()
            .map(|example_hash_map| {
                example_hash_map
                    .into_iter()
                    .map(|(url, val)| (url.to_string(), val))
                    .collect()
            })
            .collect();

        Self {
            schema: META_SCHEMA_ID.to_owned(),
            kind: EntityTypeTag::EntityType,
            id: entity_type.id.to_string(),
            title: entity_type.title,
            description: entity_type.description,
            property_object: entity_type.property_object.into(),
            all_of: entity_type.inherits_from.into(),
            examples,
            links: entity_type.links.into(),
        }
    }
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EntityTypeReference {
    #[cfg_attr(target_arch = "wasm32", tsify(type = "VersionedUrl"))]
    #[serde(rename = "$ref")]
    pub url: String,
}

impl TryFrom<EntityTypeReference> for super::EntityTypeReference {
    type Error = ParseVersionedUrlError;

    fn try_from(entity_type_ref_repr: EntityTypeReference) -> Result<Self, Self::Error> {
        let url = VersionedUrl::from_str(&entity_type_ref_repr.url)?;
        Ok(Self::new(url))
    }
}

impl From<super::EntityTypeReference> for EntityTypeReference {
    fn from(entity_type_ref: super::EntityTypeReference) -> Self {
        Self {
            url: entity_type_ref.url.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{raw, url::BaseUrl, utils::tests::check_serialization_from_str, EntityType};

    #[test]
    fn merge_entity_type() {
        let building = check_serialization_from_str::<EntityType, raw::EntityType>(
            graph_test_data::entity_type::BUILDING_V1,
            None,
        );
        let mut church: EntityType = check_serialization_from_str::<EntityType, raw::EntityType>(
            graph_test_data::entity_type::CHURCH_V1,
            None,
        );

        church
            .merge_parents([building])
            .expect("merging entity types failed");

        assert!(
            church.properties().contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/built-at/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(
            church.properties().contains_key(
                &BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/property-type/number-bells/".to_owned()
                )
                .expect("invalid url")
            )
        );
        assert!(church.inherits_from().all_of().is_empty());
    }
}
