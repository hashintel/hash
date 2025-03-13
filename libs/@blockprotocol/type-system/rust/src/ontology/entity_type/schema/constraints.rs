use std::collections::{HashMap, HashSet};

use super::EntityTypeReference;
use crate::ontology::{
    BaseUrl, VersionedUrl,
    json_schema::OneOfSchema,
    property_type::schema::{PropertyTypeReference, PropertyValueArray, ValueOrArray},
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityConstraints {
    pub properties: HashMap<BaseUrl, ValueOrArray<PropertyTypeReference>>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[BaseUrl, ...BaseUrl[]]"))]
    pub required: HashSet<BaseUrl>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            type = "Record<VersionedUrl, PropertyValueArray<OneOfSchema<EntityTypeReference> | \
                    Record<string, never>>>"
        )
    )]
    #[serde(with = "links", default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
}

mod links {
    use core::fmt;
    use std::collections::HashMap;

    use serde::{Deserialize, Serialize};

    use crate::ontology::{
        VersionedUrl, entity_type::schema::EntityTypeReference, json_schema::OneOfSchema,
        property_type::schema::PropertyValueArray,
    };

    type Links =
        HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>;

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
        use serde::ser::SerializeMap as _;

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
            type Value =
                HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>;

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
