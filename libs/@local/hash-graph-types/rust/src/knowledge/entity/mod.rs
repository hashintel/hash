mod diff;
mod provenance;

use core::{fmt, str::FromStr as _};
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, TransactionTime};
use type_system::url::{BaseUrl, VersionedUrl};
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};
use uuid::Uuid;

pub use self::{
    diff::EntityTypeIdDiff,
    provenance::{
        ActorType, EntityEditionProvenance, EntityProvenance, InferredEntityProvenance, Location,
        OriginProvenance, OriginType, ProvidedEntityEditionProvenance, SourceProvenance,
        SourceType,
    },
};
use crate::{
    Embedding,
    knowledge::{
        Confidence,
        link::LinkData,
        property::{
            PatchError, Property, PropertyMetadata, PropertyMetadataObject, PropertyObject,
            PropertyPatchOperation, PropertyWithMetadata,
        },
    },
    owned_by_id::OwnedById,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct EntityUuid(Uuid);

impl EntityUuid {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for EntityUuid {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct DraftId(Uuid);

impl DraftId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for DraftId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub temporal_versioning: EntityTemporalMetadata,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub entity_type_ids: HashSet<VersionedUrl>,
    pub archived: bool,
    pub provenance: EntityProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyMetadataObject::is_empty")]
    pub properties: PropertyMetadataObject,
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub properties: PropertyObject,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<LinkData>,
    pub metadata: EntityMetadata,
}

impl Entity {
    /// Modify the properties and confidence values of the entity.
    ///
    /// # Errors
    ///
    /// Returns an error if the patch operation failed
    pub fn patch(
        &mut self,
        operations: impl IntoIterator<Item = PropertyPatchOperation>,
    ) -> Result<(), Report<PatchError>> {
        let mut properties_with_metadata = PropertyWithMetadata::from_parts(
            Property::Object(self.properties.clone()),
            Some(PropertyMetadata::Object {
                value: self.metadata.properties.value.clone(),
                metadata: self.metadata.properties.metadata.clone(),
            }),
        )
        .change_context(PatchError)?;

        for operation in operations {
            match operation {
                PropertyPatchOperation::Add { path, property } => {
                    properties_with_metadata
                        .add(path, property)
                        .change_context(PatchError)?;
                }
                PropertyPatchOperation::Remove { path } => {
                    properties_with_metadata
                        .remove(&path)
                        .change_context(PatchError)?;
                }
                PropertyPatchOperation::Replace { path, property } => {
                    properties_with_metadata
                        .replace(&path, property)
                        .change_context(PatchError)?;
                }
            }
        }

        let (
            Property::Object(properties),
            PropertyMetadata::Object {
                value: metadata_object,
                metadata,
            },
        ) = properties_with_metadata.into_parts()
        else {
            unreachable!("patching should not change the property type");
        };
        self.properties = properties;
        self.metadata.properties = PropertyMetadataObject {
            value: metadata_object,
            metadata,
        };

        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct EntityId {
    pub owned_by_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
}

pub const ENTITY_ID_DELIMITER: char = '~';

impl fmt::Display for EntityId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(draft_id) = self.draft_id {
            write!(
                fmt,
                "{}{}{}{}{}",
                self.owned_by_id,
                ENTITY_ID_DELIMITER,
                self.entity_uuid,
                ENTITY_ID_DELIMITER,
                draft_id,
            )
        } else {
            write!(
                fmt,
                "{}{}{}",
                self.owned_by_id, ENTITY_ID_DELIMITER, self.entity_uuid
            )
        }
    }
}

impl Serialize for EntityId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let entity_id = String::deserialize(deserializer)?;
        let (owned_by_id, tail) = entity_id.split_once(ENTITY_ID_DELIMITER).ok_or_else(|| {
            de::Error::custom(format!(
                "failed to find `{ENTITY_ID_DELIMITER}` delimited string",
            ))
        })?;
        let (entity_uuid, draft_id) = tail
            .split_once(ENTITY_ID_DELIMITER)
            .map_or((tail, None), |(entity_uuid, draft_id)| {
                (entity_uuid, Some(draft_id))
            });

        Ok(Self {
            owned_by_id: OwnedById::new(Uuid::from_str(owned_by_id).map_err(de::Error::custom)?),
            entity_uuid: EntityUuid::new(Uuid::from_str(entity_uuid).map_err(de::Error::custom)?),
            draft_id: draft_id
                .map(|draft_id| {
                    Ok(DraftId::new(
                        Uuid::from_str(draft_id).map_err(de::Error::custom)?,
                    ))
                })
                .transpose()?,
        })
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityId {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityId",
            openapi::Schema::Object(openapi::schema::Object::with_type(
                openapi::SchemaType::String,
            ))
            .into(),
        )
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTemporalMetadata {
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[repr(transparent)]
pub struct EntityEditionId(Uuid);

impl EntityEditionId {
    #[must_use]
    pub const fn new(id: Uuid) -> Self {
        Self(id)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityRecordId {
    pub entity_id: EntityId,
    pub edition_id: EntityEditionId,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbedding<'e> {
    // TODO: Stop allocating everywhere in type-system package
    //   see https://linear.app/hash/issue/BP-57
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub property: Option<BaseUrl>,
    pub embedding: Embedding<'e>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let properties: PropertyObject =
            serde_json::from_value(json_value.clone()).expect("invalid entity");

        assert_eq!(
            serde_json::to_value(properties.clone()).expect("could not serialize"),
            json_value,
            "{properties:#?}"
        );
    }

    #[test]
    fn book() {
        test_entity(graph_test_data::entity::BOOK_V1);
    }

    #[test]
    fn address() {
        test_entity(graph_test_data::entity::ADDRESS_V1);
    }

    #[test]
    fn organization() {
        test_entity(graph_test_data::entity::ORGANIZATION_V1);
    }

    #[test]
    fn building() {
        test_entity(graph_test_data::entity::BUILDING_V1);
    }

    #[test]
    fn person() {
        test_entity(graph_test_data::entity::PERSON_ALICE_V1);
    }

    #[test]
    fn playlist() {
        test_entity(graph_test_data::entity::PLAYLIST_V1);
    }

    #[test]
    fn song() {
        test_entity(graph_test_data::entity::SONG_V1);
    }

    #[test]
    fn page() {
        test_entity(graph_test_data::entity::PAGE_V1);
    }

    mod diff {
        use alloc::borrow::Cow;
        use core::iter::once;

        use type_system::url::BaseUrl;

        use crate::knowledge::property::{
            Property, PropertyDiff, PropertyPath, PropertyPathElement,
        };

        macro_rules! property {
            ($($json:tt)+) => {
                serde_json::from_value::<Property>(serde_json::json!($($json)+)).expect("invalid JSON")
            };
        }

        fn test_diff<'a>(
            lhs: &Property,
            rhs: &Property,
            expected: impl IntoIterator<Item = PropertyDiff<'a>>,
        ) {
            let mut path = PropertyPath::default();
            let mut diff = lhs.diff(rhs, &mut path).collect::<Vec<_>>();

            for expected in expected {
                let (idx, _) = diff
                    .iter()
                    .enumerate()
                    .find(|(_, diff)| **diff == expected)
                    .unwrap_or_else(|| {
                        panic!("unexpected diff found: {expected:#?}\n\nactual: {diff:#?}",)
                    });
                diff.remove(idx);
            }
            assert!(diff.is_empty(), "missing diffs: {diff:#?}",);
        }

        fn create_base_url(property: usize) -> BaseUrl {
            BaseUrl::new(format!("http://example.com/property-{property}/")).expect("invalid URL")
        }

        #[test]
        fn value_equal() {
            test_diff(&property!("foo"), &property!("foo"), []);
        }

        #[test]
        fn value_modified() {
            let old = property!("foo");
            let new = property!("bar");
            test_diff(&old, &new, [PropertyDiff::Changed {
                path: PropertyPath::default(),
                old: Cow::Borrowed(&old),
                new: Cow::Borrowed(&new),
            }]);
        }

        #[test]
        fn array_equal() {
            test_diff(&property!(["foo", "bar"]), &property!(["foo", "bar"]), []);
        }

        #[test]
        fn array_modified() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo", "baz"]);
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Index(1)).collect(),
                    old: Cow::Borrowed(&property!("bar")),
                    new: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_added() {
            let old = property!(["foo"]);
            let new = property!(["foo", "bar"]);
            test_diff(&old, &new, [
                PropertyDiff::Added {
                    path: once(PropertyPathElement::Index(1)).collect(),
                    added: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_removed() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo"]);
            test_diff(&old, &new, [
                PropertyDiff::Removed {
                    path: once(PropertyPathElement::Index(1)).collect(),
                    removed: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_inserted() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo", "baz", "bar"]);
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Index(1)).collect(),
                    old: Cow::Borrowed(&property!("bar")),
                    new: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Added {
                    path: once(PropertyPathElement::Index(2)).collect(),
                    added: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_removed_middle() {
            let old = property!(["foo", "bar", "baz"]);
            let new = property!(["foo", "baz"]);
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Index(1)).collect(),
                    old: Cow::Borrowed(&property!("bar")),
                    new: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Removed {
                    path: once(PropertyPathElement::Index(2)).collect(),
                    removed: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_nested_object_value_changed() {
            let old = property!([{create_base_url(0): "bar"}]);
            let new = property!([{create_base_url(0): "baz"}]);
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: [
                        PropertyPathElement::Index(0),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(0))),
                    ]
                    .into_iter()
                    .collect(),
                    old: Cow::Borrowed(&property!("bar")),
                    new: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Index(0)).collect(),
                    old: Cow::Borrowed(&property!({create_base_url(0): "bar"})),
                    new: Cow::Borrowed(&property!({create_base_url(0): "baz"})),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn array_nested_object_key_changed() {
            let old = property!([{ create_base_url(0): "bar" }]);
            let new = property!([{ create_base_url(1): "baz" }]);
            test_diff(&old, &new, [
                PropertyDiff::Removed {
                    path: [
                        PropertyPathElement::Index(0),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(0))),
                    ]
                    .into_iter()
                    .collect(),
                    removed: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Added {
                    path: [
                        PropertyPathElement::Index(0),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(1))),
                    ]
                    .into_iter()
                    .collect(),
                    added: Cow::Borrowed(&property!("baz")),
                },
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Index(0)).collect(),
                    old: Cow::Borrowed(&property!({ create_base_url(0): "bar" })),
                    new: Cow::Borrowed(&property!({ create_base_url(1): "baz" })),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_equal() {
            test_diff(
                &property!({ create_base_url(1): "foo" }),
                &property!({ create_base_url(1): "foo" }),
                [],
            );
        }

        #[test]
        fn object_added() {
            let old = property!({});
            let new = property!({ create_base_url(1): "foo" });
            test_diff(&old, &new, [
                PropertyDiff::Added {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    added: Cow::Borrowed(&property!("foo")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_nested_object_value_changed() {
            let old = property!({ create_base_url(1): { create_base_url(2): "foo" } });
            let new = property!({ create_base_url(1): { create_base_url(2): "bar" } });
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: [
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(1))),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(2))),
                    ]
                    .into_iter()
                    .collect(),
                    old: Cow::Borrowed(&property!("foo")),
                    new: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    old: Cow::Borrowed(&property!({ create_base_url(2): "foo" })),
                    new: Cow::Borrowed(&property!({ create_base_url(2): "bar" })),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_nested_object_key_changed() {
            let old = property!({ create_base_url(1): { create_base_url(3): "foo" } });
            let new = property!({ create_base_url(2): { create_base_url(3): "foo" } });
            test_diff(&old, &new, [
                PropertyDiff::Removed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    removed: Cow::Borrowed(&property!({ create_base_url(3): "foo" })),
                },
                PropertyDiff::Added {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(2),
                    )))
                    .collect(),
                    added: Cow::Borrowed(&property!({ create_base_url(3): "foo" })),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_nested_object_key_moved() {
            let old = property!({ create_base_url(1): { create_base_url(3): "foo" }, create_base_url(2): {} });
            let new = property!({ create_base_url(2): { create_base_url(3): "foo" }, create_base_url(1): {} });
            test_diff(&old, &new, [
                PropertyDiff::Added {
                    path: [
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(2))),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(3))),
                    ]
                    .into_iter()
                    .collect(),
                    added: Cow::Borrowed(&property!("foo")),
                },
                PropertyDiff::Removed {
                    path: [
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(1))),
                        PropertyPathElement::Property(Cow::Borrowed(&create_base_url(3))),
                    ]
                    .into_iter()
                    .collect(),
                    removed: Cow::Borrowed(&property!("foo")),
                },
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    old: Cow::Borrowed(&property!({ create_base_url(3): "foo" })),
                    new: Cow::Borrowed(&property!({})),
                },
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(2),
                    )))
                    .collect(),
                    old: Cow::Borrowed(&property!({})),
                    new: Cow::Borrowed(&property!({ create_base_url(3): "foo" })),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_modified() {
            let old = property!({ create_base_url(1): "foo" });
            let new = property!({ create_base_url(1): "bar" });
            test_diff(&old, &new, [
                PropertyDiff::Changed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    old: Cow::Borrowed(&property!("foo")),
                    new: Cow::Borrowed(&property!("bar")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }

        #[test]
        fn object_key_removed() {
            let old = property!({ create_base_url(1): "foo" });
            let new = property!({});
            test_diff(&old, &new, [
                PropertyDiff::Removed {
                    path: once(PropertyPathElement::Property(Cow::Borrowed(
                        &create_base_url(1),
                    )))
                    .collect(),
                    removed: Cow::Borrowed(&property!("foo")),
                },
                PropertyDiff::Changed {
                    path: PropertyPath::default(),
                    old: Cow::Borrowed(&old),
                    new: Cow::Borrowed(&new),
                },
            ]);
        }
    }
}
