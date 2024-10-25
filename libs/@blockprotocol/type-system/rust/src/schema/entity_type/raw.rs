use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    schema::{
        EntityTypeReference, OneOfSchema, PropertyTypeReference, PropertyValueArray, ValueOrArray,
        entity_type::InverseEntityTypeMetadata,
    },
    url::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
enum EntityTypeKindTag {
    EntityType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
enum EntityTypeTag {
    Object,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
enum EntityTypeSchemaTag {
    #[serde(rename = "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type")]
    V3,
}

type Links = HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTypeSchemaMetadata<'a> {
    #[serde(rename = "$id")]
    id: Cow<'a, VersionedUrl>,
    title: Cow<'a, str>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title_plural: Option<Cow<'a, str>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<Cow<'a, str>>,
    #[serde(default, skip_serializing_if = "InverseEntityTypeMetadata::is_empty")]
    inverse: InverseEntityTypeMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedEntityType<'a> {
    #[serde(flatten)]
    metadata: EntityTypeSchemaMetadata<'a>,
    properties: Cow<'a, HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[BaseUrl, ...BaseUrl[]]"))]
    required: Cow<'a, HashSet<BaseUrl>>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            type = "Record<VersionedUrl, PropertyValueArray<OneOfSchema<EntityTypeReference> | \
                    Record<string, never>>>"
        )
    )]
    #[serde(with = "links", default, skip_serializing_if = "HashMap::is_empty")]
    links: Links,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityType<'a> {
    #[serde(rename = "$schema")]
    schema: EntityTypeSchemaTag,
    kind: EntityTypeKindTag,
    r#type: EntityTypeTag,
    #[serde(flatten)]
    metadata: EntityTypeSchemaMetadata<'a>,
    properties: Cow<'a, HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[BaseUrl, ...BaseUrl[]]"))]
    required: Cow<'a, HashSet<BaseUrl>>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            type = "Record<VersionedUrl, PropertyValueArray<OneOfSchema<EntityTypeReference> | \
                    Record<string, never>>>"
        )
    )]
    #[serde(with = "links", default, skip_serializing_if = "HashMap::is_empty")]
    links: Links,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeReference, ...EntityTypeReference[]]")
    )]
    all_of: Cow<'a, HashSet<EntityTypeReference>>,
    #[serde(default, skip_serializing_if = "<[_]>::is_empty")]
    examples: Cow<'a, [HashMap<BaseUrl, JsonValue>]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedMultiEntityType<'a> {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeSchemaMetadata, ...EntityTypeSchemaMetadata[]]")
    )]
    all_of: Cow<'a, [super::EntityTypeSchemaMetadata]>,
    properties: Cow<'a, HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[BaseUrl, ...BaseUrl[]]"))]
    required: Cow<'a, HashSet<BaseUrl>>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            type = "Record<VersionedUrl, PropertyValueArray<OneOfSchema<EntityTypeReference> | \
                    Record<string, never>>>"
        )
    )]
    #[serde(with = "links", default, skip_serializing_if = "HashMap::is_empty")]
    links: Links,
}

mod links {
    use core::fmt;
    use std::collections::HashMap;

    use serde::{Deserialize, Serialize};

    use crate::{
        schema::{EntityTypeReference, OneOfSchema, PropertyValueArray, entity_type::raw::Links},
        url::VersionedUrl,
    };

    // This struct is needed because it's used inside generic parameters of other structs like
    // `Array`. Those structs can't apply serde's `default` or `skip_serializing_if` which means
    // the option doesn't de/serialize as required unless wrapped in an intermediary struct.
    #[derive(Serialize, Deserialize)]
    struct Maybe<T> {
        #[serde(flatten, default = "None", skip_serializing_if = "Option::is_none")]
        inner: Option<T>,
    }

    pub(super) fn serialize<S>(links: &Links, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;

        let mut map = serializer.serialize_map(Some(links.len()))?;
        for (url, val) in links {
            map.serialize_entry(&url, &PropertyValueArray {
                items: Maybe {
                    inner: val.items.as_ref(),
                },
                min_items: val.min_items,
                max_items: val.max_items,
            })?;
        }
        map.end()
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<Links, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::MapAccess;

        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Links;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a map")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut links = HashMap::new();
                while let Some((key, value)) = map.next_entry::<VersionedUrl, PropertyValueArray<Maybe<OneOfSchema<EntityTypeReference>>>>()? {
                    links.insert(key, PropertyValueArray {
                        items: value.items.inner,
                        min_items: value.min_items,
                        max_items: value.max_items,
                    });
                }

                Ok(links)
            }
        }

        deserializer.deserialize_map(Visitor)
    }
}

impl From<EntityTypeSchemaMetadata<'_>> for super::EntityTypeSchemaMetadata {
    fn from(metadata: EntityTypeSchemaMetadata<'_>) -> Self {
        Self {
            id: metadata.id.into_owned(),
            title: metadata.title.into_owned(),
            title_plural: metadata.title_plural.map(Cow::into_owned),
            description: metadata.description.map(Cow::into_owned),
            inverse: metadata.inverse,
        }
    }
}

impl From<EntityType<'_>> for super::EntityType {
    fn from(entity_type: EntityType<'_>) -> Self {
        #[expect(deprecated)]
        Self {
            id: entity_type.metadata.id.into_owned(),
            title: entity_type.metadata.title.into_owned(),
            title_plural: entity_type.metadata.title_plural.map(Cow::into_owned),
            description: entity_type.metadata.description.map(Cow::into_owned),
            properties: entity_type.properties.into_owned(),
            required: entity_type.required.into_owned(),
            all_of: entity_type.all_of.into_owned(),
            links: entity_type.links,
            inverse: entity_type.metadata.inverse,
            examples: entity_type.examples.into_owned(),
        }
    }
}

impl From<ClosedEntityType<'_>> for super::ClosedEntityType {
    fn from(entity_type: ClosedEntityType<'_>) -> Self {
        Self {
            id: entity_type.metadata.id.into_owned(),
            title: entity_type.metadata.title.into_owned(),
            title_plural: entity_type.metadata.title_plural.map(Cow::into_owned),
            description: entity_type.metadata.description.map(Cow::into_owned),
            properties: entity_type.properties.into_owned(),
            required: entity_type.required.into_owned(),
            links: entity_type.links,
            inverse: entity_type.metadata.inverse,
        }
    }
}

impl From<ClosedMultiEntityType<'_>> for super::ClosedMultiEntityType {
    fn from(entity_type: ClosedMultiEntityType<'_>) -> Self {
        Self {
            all_of: entity_type.all_of.into_owned(),
            properties: entity_type.properties.into_owned(),
            required: entity_type.required.into_owned(),
            links: entity_type.links,
        }
    }
}

impl<'a> From<&'a super::EntityTypeSchemaMetadata> for EntityTypeSchemaMetadata<'a> {
    fn from(metadata: &'a super::EntityTypeSchemaMetadata) -> Self {
        Self {
            id: Cow::Borrowed(&metadata.id),
            title: Cow::Borrowed(&metadata.title),
            title_plural: metadata.title_plural.as_deref().map(Cow::Borrowed),
            description: metadata.description.as_deref().map(Cow::Borrowed),
            inverse: metadata.inverse.clone(),
        }
    }
}

impl<'a> From<&'a super::EntityType> for EntityType<'a> {
    fn from(entity_type: &'a super::EntityType) -> Self {
        Self {
            schema: EntityTypeSchemaTag::V3,
            kind: EntityTypeKindTag::EntityType,
            r#type: EntityTypeTag::Object,
            metadata: EntityTypeSchemaMetadata {
                id: Cow::Borrowed(&entity_type.id),
                title: Cow::Borrowed(&entity_type.title),
                title_plural: entity_type.title_plural.as_deref().map(Cow::Borrowed),
                description: entity_type.description.as_deref().map(Cow::Borrowed),
                inverse: entity_type.inverse.clone(),
            },
            properties: Cow::Borrowed(&entity_type.properties),
            required: Cow::Borrowed(&entity_type.required),
            links: entity_type.links.clone(),
            #[expect(deprecated)]
            examples: Cow::Borrowed(&entity_type.examples),
            all_of: Cow::Borrowed(&entity_type.all_of),
        }
    }
}

impl<'a> From<&'a super::ClosedEntityType> for ClosedEntityType<'a> {
    fn from(entity_type: &'a super::ClosedEntityType) -> Self {
        Self {
            metadata: EntityTypeSchemaMetadata {
                id: Cow::Borrowed(&entity_type.id),
                title: Cow::Borrowed(&entity_type.title),
                title_plural: entity_type.title_plural.as_deref().map(Cow::Borrowed),
                description: entity_type.description.as_deref().map(Cow::Borrowed),
                inverse: entity_type.inverse.clone(),
            },
            properties: Cow::Borrowed(&entity_type.properties),
            required: Cow::Borrowed(&entity_type.required),
            links: entity_type.links.clone(),
        }
    }
}

impl<'a> From<&'a super::ClosedMultiEntityType> for ClosedMultiEntityType<'a> {
    fn from(entity_type: &'a super::ClosedMultiEntityType) -> Self {
        Self {
            all_of: Cow::Borrowed(&entity_type.all_of),
            properties: Cow::Borrowed(&entity_type.properties),
            required: Cow::Borrowed(&entity_type.required),
            links: entity_type.links.clone(),
        }
    }
}
