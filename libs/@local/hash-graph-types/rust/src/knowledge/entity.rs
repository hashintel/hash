#[cfg(feature = "postgres")]
use std::error::Error;
use std::{cmp::Ordering, collections::HashMap, fmt, io, str::FromStr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value as JsonValue;
use temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, Timestamp, TransactionTime};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    JsonSchemaValueType,
};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::{
    account::{CreatedById, EditionCreatedById},
    knowledge::link::LinkData,
    owned_by_id::OwnedById,
    Embedding,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Property {
    Array(Vec<Self>),
    Object(HashMap<BaseUrl, Self>),
    Value(JsonValue),
}

#[derive(Debug)]
pub enum PropertyElement<'a> {
    Object {
        key: &'a BaseUrl,
        property: &'a Property,
    },
    Array {
        index: usize,
        property: &'a Property,
    },
    Value(&'a JsonValue),
}

impl Property {
    #[must_use]
    pub fn json_type(&self) -> JsonSchemaValueType {
        match self {
            Self::Array(_) => JsonSchemaValueType::Array,
            Self::Object(_) => JsonSchemaValueType::Object,
            Self::Value(property) => JsonSchemaValueType::from(property),
        }
    }

    pub gen fn properties(&self) -> (Vec<PropertyPathElement<'_>>, &JsonValue) {
        let mut elements = Vec::new();
        match self {
            Self::Array(array) => {
                for (index, property) in array.iter().enumerate() {
                    elements.push(PropertyPathElement::Index(index));
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Object(object) => {
                for (key, property) in object {
                    elements.push(PropertyPathElement::Property(key));
                    for yielded in Box::new(property.properties()) {
                        yield yielded;
                    }
                    elements.pop();
                }
            }
            Self::Value(property) => yield (elements.clone(), property),
        }
    }

    #[must_use]
    pub fn get(&self, path: &PropertyPath<'_>) -> Option<&Self> {
        let mut value = self;
        for element in &path.elements {
            match element {
                PropertyPathElement::Property(key) => {
                    value = match value {
                        Self::Object(object) => object.get(key)?,
                        _ => return None,
                    };
                }
                PropertyPathElement::Index(index) => {
                    value = match value {
                        Self::Array(array) => array.get(*index)?,
                        _ => return None,
                    };
                }
            }
        }
        Some(value)
    }

    gen fn diff_array<'a>(
        lhs: &'a [Self],
        rhs: &'a [Self],
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (index, (lhs, rhs)) in lhs.iter().zip(rhs).enumerate() {
            path.elements.push(PropertyPathElement::Index(index));
            for yielded in Box::new(lhs.diff(rhs, path)) {
                yield yielded;
            }
            path.elements.pop();
        }

        match lhs.len().cmp(&rhs.len()) {
            Ordering::Less => {
                for (index, property) in rhs.iter().enumerate().skip(lhs.len()) {
                    path.elements.push(PropertyPathElement::Index(index));
                    yield PropertyDiff::Added {
                        path: path.clone(),
                        added: property,
                    };
                    path.elements.pop();
                }
            }
            Ordering::Equal => {}
            Ordering::Greater => {
                for (index, property) in lhs.iter().enumerate().skip(rhs.len()) {
                    path.elements.push(PropertyPathElement::Index(index));
                    yield PropertyDiff::Removed {
                        path: path.clone(),
                        removed: property,
                    };
                    path.elements.pop();
                }
            }
        }
    }

    gen fn diff_object<'a>(
        lhs: &'a HashMap<BaseUrl, Self>,
        rhs: &'a HashMap<BaseUrl, Self>,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'a> {
        for (key, property) in lhs {
            path.elements.push(PropertyPathElement::Property(key));
            let other_property = rhs.get(key);
            if let Some(other_property) = other_property {
                for yielded in Box::new(property.diff(other_property, path)) {
                    yield yielded;
                }
            } else {
                yield PropertyDiff::Removed {
                    path: path.clone(),
                    removed: property,
                };
            }
            path.elements.pop();
        }
        for (key, property) in rhs {
            if !lhs.contains_key(key) {
                path.elements.push(PropertyPathElement::Property(key));
                yield PropertyDiff::Added {
                    path: path.clone(),
                    added: property,
                };
                path.elements.pop();
            }
        }
    }

    pub gen fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> PropertyDiff<'_> {
        let mut changed = false;
        match (self, other) {
            (Self::Array(lhs), Self::Array(rhs)) => {
                for yielded in Self::diff_array(lhs, rhs, path) {
                    changed = true;
                    yield yielded;
                }
            }
            (Self::Object(lhs), Self::Object(rhs)) => {
                for yielded in Self::diff_object(lhs, rhs, path) {
                    changed = true;
                    yield yielded;
                }
            }
            (lhs, rhs) => {
                changed = lhs != rhs;
            }
        }

        if changed {
            yield PropertyDiff::Changed {
                path: path.clone(),
                old: self,
                new: other,
            };
        }
    }
}

impl fmt::Display for Property {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Inspired by `serde_json`
        struct WriterFormatter<'a, 'b: 'a>(&'a mut fmt::Formatter<'b>);

        impl io::Write for WriterFormatter<'_, '_> {
            fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
                self.0
                    .write_str(&String::from_utf8_lossy(buf))
                    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
                Ok(buf.len())
            }

            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }

        if fmt.alternate() {
            serde_json::to_writer_pretty(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        } else {
            serde_json::to_writer(WriterFormatter(fmt), &self).map_err(|_ignored| fmt::Error)
        }
    }
}

impl PartialEq<JsonValue> for Property {
    fn eq(&self, rhs: &JsonValue) -> bool {
        match self {
            Self::Array(lhs) => {
                let JsonValue::Array(rhs) = rhs else {
                    return false;
                };

                lhs == rhs
            }
            Self::Object(lhs) => {
                let JsonValue::Object(rhs) = rhs else {
                    return false;
                };

                lhs.len() == rhs.len()
                    && lhs.iter().all(|(key, value)| {
                        rhs.get(key.as_str())
                            .map_or(false, |other_value| value == other_value)
                    })
            }
            Self::Value(lhs) => lhs == rhs,
        }
    }
}

/// The properties of an entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema), schema(value_type = Object))]
pub struct EntityProperties(HashMap<BaseUrl, Property>);

impl PartialEq<JsonValue> for EntityProperties {
    fn eq(&self, other: &JsonValue) -> bool {
        let JsonValue::Object(other_object) = other else {
            return false;
        };

        self.0.len() == other_object.len()
            && self.0.iter().all(|(key, value)| {
                other_object
                    .get(key.as_str())
                    .map_or(false, |other_value| value == other_value)
            })
    }
}

#[cfg(feature = "postgres")]
impl ToSql for EntityProperties {
    postgres_types::accepts!(JSON, JSONB);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        postgres_types::Json(&self).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for EntityProperties {
    postgres_types::accepts!(JSON, JSONB);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let json = postgres_types::Json::from_sql(ty, raw)?;
        Ok(json.0)
    }
}

impl EntityProperties {
    #[must_use]
    pub const fn new(properties: HashMap<BaseUrl, Property>) -> Self {
        Self(properties)
    }

    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    pub fn diff<'a>(
        &'a self,
        other: &'a Self,
        path: &mut PropertyPath<'a>,
    ) -> impl Iterator<Item = PropertyDiff<'_>> {
        Property::diff_object(self.properties(), other.properties(), path)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PropertyPathElement<'k> {
    Property(&'k BaseUrl),
    Index(usize),
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PropertyPath<'k> {
    elements: Vec<PropertyPathElement<'k>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyDiff<'e> {
    Added {
        path: PropertyPath<'e>,
        added: &'e Property,
    },
    Removed {
        path: PropertyPath<'e>,
        removed: &'e Property,
    },
    Changed {
        path: PropertyPath<'e>,
        old: &'e Property,
        new: &'e Property,
    },
}

impl EntityProperties {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, Property> {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityEditionProvenanceMetadata {
    pub created_by_id: EditionCreatedById,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityProvenanceMetadata {
    pub created_by_id: CreatedById,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    pub edition: EntityEditionProvenanceMetadata,
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub temporal_versioning: EntityTemporalMetadata,
    pub entity_type_ids: Vec<VersionedUrl>,
    pub provenance: EntityProvenanceMetadata,
    pub archived: bool,
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub properties: EntityProperties,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<LinkData>,
    pub metadata: EntityMetadata,
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
        let json_value = serde_json::to_value(json).expect("invalid JSON");

        let properties: EntityProperties =
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
        use type_system::url::BaseUrl;

        use crate::knowledge::entity::{Property, PropertyDiff, PropertyPath, PropertyPathElement};

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
            test_diff(
                &old,
                &new,
                [PropertyDiff::Changed {
                    path: PropertyPath { elements: vec![] },
                    old: &old,
                    new: &new,
                }],
            );
        }

        #[test]
        fn array_equal() {
            test_diff(&property!(["foo", "bar"]), &property!(["foo", "bar"]), []);
        }

        #[test]
        fn array_modified() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo", "baz"]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(1)],
                        },
                        old: &property!("bar"),
                        new: &property!("baz"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_added() {
            let old = property!(["foo"]);
            let new = property!(["foo", "bar"]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(1)],
                        },
                        added: &property!("bar"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_removed() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo"]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(1)],
                        },
                        removed: &property!("bar"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_inserted() {
            let old = property!(["foo", "bar"]);
            let new = property!(["foo", "baz", "bar"]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(1)],
                        },
                        old: &property!("bar"),
                        new: &property!("baz"),
                    },
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(2)],
                        },
                        added: &property!("bar"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_removed_middle() {
            let old = property!(["foo", "bar", "baz"]);
            let new = property!(["foo", "baz"]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(1)],
                        },
                        old: &property!("bar"),
                        new: &property!("baz"),
                    },
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(2)],
                        },
                        removed: &property!("baz"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_nested_object_value_changed() {
            let old = property!([{create_base_url(0): "bar"}]);
            let new = property!([{create_base_url(0): "baz"}]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Index(0),
                                PropertyPathElement::Property(&create_base_url(0)),
                            ],
                        },
                        old: &property!("bar"),
                        new: &property!("baz"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(0)],
                        },
                        old: &property!({create_base_url(0): "bar"}),
                        new: &property!({create_base_url(0): "baz"}),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn array_nested_object_key_changed() {
            let old = property!([{ create_base_url(0): "bar" }]);
            let new = property!([{ create_base_url(1): "baz" }]);
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Index(0),
                                PropertyPathElement::Property(&create_base_url(0)),
                            ],
                        },
                        removed: &property!("bar"),
                    },
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Index(0),
                                PropertyPathElement::Property(&create_base_url(1)),
                            ],
                        },
                        added: &property!("baz"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Index(0)],
                        },
                        old: &property!({ create_base_url(0): "bar" }),
                        new: &property!({ create_base_url(1): "baz" }),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
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
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        added: &property!("foo"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn object_nested_object_value_changed() {
            let old = property!({ create_base_url(1): { create_base_url(2): "foo" } });
            let new = property!({ create_base_url(1): { create_base_url(2): "bar" } });
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Property(&create_base_url(1)),
                                PropertyPathElement::Property(&create_base_url(2)),
                            ],
                        },
                        old: &property!("foo"),
                        new: &property!("bar"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        old: &property!({ create_base_url(2): "foo" }),
                        new: &property!({ create_base_url(2): "bar" }),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn object_nested_object_key_changed() {
            let old = property!({ create_base_url(1): { create_base_url(3): "foo" } });
            let new = property!({ create_base_url(2): { create_base_url(3): "foo" } });
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        removed: &property!({ create_base_url(3): "foo" }),
                    },
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(2))],
                        },
                        added: &property!({ create_base_url(3): "foo" }),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn object_nested_object_key_moved() {
            let old = property!({ create_base_url(1): { create_base_url(3): "foo" }, create_base_url(2): {} });
            let new = property!({ create_base_url(2): { create_base_url(3): "foo" }, create_base_url(1): {} });
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Added {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Property(&create_base_url(2)),
                                PropertyPathElement::Property(&create_base_url(3)),
                            ],
                        },
                        added: &property!("foo"),
                    },
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![
                                PropertyPathElement::Property(&create_base_url(1)),
                                PropertyPathElement::Property(&create_base_url(3)),
                            ],
                        },
                        removed: &property!("foo"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        old: &property!({ create_base_url(3): "foo" }),
                        new: &property!({}),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(2))],
                        },
                        old: &property!({}),
                        new: &property!({ create_base_url(3): "foo" }),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn object_modified() {
            let old = property!({ create_base_url(1): "foo" });
            let new = property!({ create_base_url(1): "bar" });
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Changed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        old: &property!("foo"),
                        new: &property!("bar"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }

        #[test]
        fn object_key_removed() {
            let old = property!({ create_base_url(1): "foo" });
            let new = property!({});
            test_diff(
                &old,
                &new,
                [
                    PropertyDiff::Removed {
                        path: PropertyPath {
                            elements: vec![PropertyPathElement::Property(&create_base_url(1))],
                        },
                        removed: &property!("foo"),
                    },
                    PropertyDiff::Changed {
                        path: PropertyPath { elements: vec![] },
                        old: &old,
                        new: &new,
                    },
                ],
            );
        }
    }
}
