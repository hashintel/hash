use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    schema::{
        EntityTypeReference, OneOfSchema, PropertyTypeReference, PropertyValueArray, ValueOrArray,
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
pub struct EntityType<'a> {
    #[serde(rename = "$schema")]
    schema: EntityTypeSchemaTag,
    kind: EntityTypeKindTag,
    r#type: EntityTypeTag,
    #[serde(rename = "$id")]
    id: Cow<'a, VersionedUrl>,
    title: Cow<'a, str>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<Cow<'a, str>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[EntityTypeReference, ...EntityTypeReference[]]")
    )]
    all_of: Cow<'a, HashSet<EntityTypeReference>>,
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
    #[serde(default, skip_serializing_if = "<[_]>::is_empty")]
    examples: Cow<'a, [HashMap<BaseUrl, JsonValue>]>,
}

mod links {
    use core::fmt;
    use std::collections::HashMap;

    use serde::{Deserialize, Serialize};

    use crate::{
        schema::{entity_type::raw::Links, EntityTypeReference, OneOfSchema, PropertyValueArray},
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
            map.serialize_entry(
                &url,
                &PropertyValueArray {
                    items: Maybe {
                        inner: val.items.as_ref(),
                    },
                    min_items: val.min_items,
                    max_items: val.max_items,
                },
            )?;
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

impl From<EntityType<'_>> for super::EntityType {
    fn from(entity_type: EntityType<'_>) -> Self {
        #[expect(deprecated)]
        Self {
            id: entity_type.id.into_owned(),
            title: entity_type.title.into_owned(),
            description: entity_type.description.map(Cow::into_owned),
            properties: entity_type.properties.into_owned(),
            required: entity_type.required.into_owned(),
            all_of: entity_type.all_of.into_owned(),
            links: entity_type.links,
            examples: entity_type.examples.into_owned(),
        }
    }
}

impl<'a> From<&'a super::EntityType> for EntityType<'a> {
    fn from(entity_type: &'a super::EntityType) -> Self {
        Self {
            schema: EntityTypeSchemaTag::V3,
            kind: EntityTypeKindTag::EntityType,
            r#type: EntityTypeTag::Object,
            id: Cow::Borrowed(&entity_type.id),
            title: Cow::Borrowed(&entity_type.title),
            description: entity_type.description.as_deref().map(Cow::Borrowed),
            properties: Cow::Borrowed(&entity_type.properties),
            required: Cow::Borrowed(&entity_type.required),
            all_of: Cow::Borrowed(&entity_type.all_of),
            links: entity_type.links.clone(),
            #[expect(deprecated)]
            examples: Cow::Borrowed(&entity_type.examples),
        }
    }
}
