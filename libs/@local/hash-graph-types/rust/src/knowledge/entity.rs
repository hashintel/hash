#[cfg(feature = "postgres")]
use std::error::Error;
use std::{
    collections::{hash_map, HashMap},
    fmt, io,
    str::FromStr,
};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
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
    Object(PropertyObject),
    Value(serde_json::Value),
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

impl Property {
    #[must_use]
    pub fn json_type(&self) -> JsonSchemaValueType {
        match self {
            Self::Array(_) => JsonSchemaValueType::Array,
            Self::Object(_) => JsonSchemaValueType::Object,
            Self::Value(property) => JsonSchemaValueType::from(property),
        }
    }
}

impl PartialEq<serde_json::Value> for Property {
    fn eq(&self, other: &serde_json::Value) -> bool {
        match self {
            Self::Array(array) => {
                if let serde_json::Value::Array(other_array) = other {
                    array == other_array
                } else {
                    false
                }
            }
            Self::Object(object) => {
                if let serde_json::Value::Object(other_object) = other {
                    let object = object.properties();
                    object.len() == other_object.len()
                        && object.iter().zip(other_object).all(
                            |((a_key, a_value), (b_key, b_value))| {
                                a_key.as_str() == b_key && a_value == b_value
                            },
                        )
                } else {
                    false
                }
            }
            Self::Value(value) => value == other,
        }
    }
}

/// The properties of an entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema), schema(value_type = Object))]
pub struct PropertyObject(HashMap<BaseUrl, Property>);

// impl IntoIterator for EntityProperties {
//     type IntoIter = hash_map::IntoIter<BaseUrl, serde_json::Value>;
//     type Item = (BaseUrl, serde_json::Value);
//
//     fn into_iter(self) -> Self::IntoIter {
//         self.0.into_iter()
//     }
// }

#[cfg(feature = "postgres")]
impl ToSql for PropertyObject {
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
impl<'a> FromSql<'a> for PropertyObject {
    postgres_types::accepts!(JSON, JSONB);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let json = postgres_types::Json::from_sql(ty, raw)?;
        Ok(json.0)
    }
}

impl PropertyObject {
    #[must_use]
    pub const fn new(properties: HashMap<BaseUrl, Property>) -> Self {
        Self(properties)
    }

    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    // pub fn get(&self, path: &PropertyPath<'_>) -> Option<&serde_json::Value> {
    //     let mut value = match path.elements.get(0)? {
    //         PropertyPathElement::Property(property) => self.0.get(property)?,
    //         PropertyPathElement::Index(_) => return None,
    //     };
    //     for element in &path.elements[1..] {
    //         match element {
    //             PropertyPathElement::Property(property) => {
    //                 value = value.as_object()?.get(property.as_str())?;
    //             }
    //             PropertyPathElement::Index(index) => {
    //                 value = value.as_array()?.get(*index)?;
    //             }
    //         }
    //     }
    //     Some(value)
    // }
}

#[derive(Debug, Copy, Clone)]
pub enum PropertyPathElement<'k> {
    Property(&'k BaseUrl),
    Index(usize),
}

#[derive(Debug, Clone)]
pub struct PropertyPath<'k> {
    elements: Vec<PropertyPathElement<'k>>,
}

pub enum PropertyDiff<'e> {
    Added(PropertyPath<'e>, &'e serde_json::Value),
    Removed(PropertyPath<'e>, &'e serde_json::Value),
    Changed(
        PropertyPath<'e>,
        &'e serde_json::Value,
        &'e serde_json::Value,
    ),
}

enum IterationBehavior {
    DetectChanges,
    DetectMissing,
}

struct PropertyIteratorStackElement<'e> {
    iterator: hash_map::Iter<'e, BaseUrl, serde_json::Value>,
    other_object: &'e serde_json::Map<String, serde_json::Value>,
}

struct PropertyObjectIterator<'e> {
    behavior: IterationBehavior,
    stack: Vec<hash_map::Iter<'e, String, serde_json::Value>>,
    path: PropertyPath<'e>,
}
//
// impl<'e> Iterator for PropertyObjectIterator<'e> {
//     type Item = (PropertyPath<'e>, &'e serde_json::Value);
//
//     fn next(&mut self) -> Option<Self::Item> {
//         loop {
//             match self.stack.last_mut()?.next() {
//                 None => {
//                     self.stack.pop();
//                     self.path.elements.pop();
//                 }
//                 Some((key, value)) => match value {
//                     serde_json::Value::Object(object) => {
//                         self.path.elements.push(PropertyPathElement::Property(key));
//                         self.stack.push(self.other.0.get(key)?.as_object()?.iter());
//                     }
//                     serde_json::Value::Array(_) => {
//                         todo!()
//                     }
//                     _ => {
//                         let path = self.path.clone();
//                         let next = match self.behavior {
//                             IterationBehavior::DetectChanges => {
//                                 let other_value = self.other.0.get(key);
//                                 if let Some(other_value) = other_value {
//                                     if value != other_value {
//                                         Some(PropertyDiff::Changed(
//                                             PropertyPath { elements: path },
//                                             value,
//                                             other_value,
//                                         ))
//                                     } else {
//                                         None
//                                     }
//                                 } else {
//                                     Some(PropertyDiff::Added(
//                                         PropertyPath { elements: path },
//                                         value,
//                                     ))
//                                 }
//                             }
//                             IterationBehavior::DetectMissing => {
//                                 if self.other.0.get(key).is_none() {
//                                     Some(PropertyDiff::Removed(
//                                         PropertyPath { elements: path },
//                                         value,
//                                     ))
//                                 } else {
//                                     None
//                                 }
//                             }
//                         };
//
//                         if let Some(next) = next {
//                             return Some(next);
//                         }
//                     }
//                 },
//             }
//         }
//
//         for (key, value) in self.properties.0.iter() {
//             let other_value = self.other.0.get(key);
//
//             if let Some(other_value) = other_value {
//                 if value != other_value {
//                     next = Some(PropertyDiff::Changed(self.path.clone(), value, other_value));
//                 }
//             } else {
//                 next = Some(PropertyDiff::Added(self.path.clone(), value));
//             }
//         }
//
//         for (key, value) in self.other.0.iter() {
//             if !self.properties.0.contains_key(key) {
//                 next = Some(PropertyDiff::Removed(self.path.clone(), value));
//             }
//         }
//
//         next
//     }
// }

impl PropertyObject {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, Property> {
        &self.0
    }

    // pub fn diff<'e>(&'e self, other: &'e Self) -> impl Iterator<Item = PropertyDiff<'e>> {
    //     PropertyDiffIterator {
    //         this_stack: vec![self.0.iter()],
    //         other_stack: vec![other.0.iter()],
    //         path: PropertyPath {
    //             elements: Vec::new(),
    //         },
    //     }
    // }
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
    pub properties: PropertyObject,
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
}
