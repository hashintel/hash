#[cfg(feature = "postgres")]
use std::error::Error;
use std::{collections::HashMap, fmt, str::FromStr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, TransactionTime};
use type_system::url::{BaseUrl, VersionedUrl};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::{
    knowledge::link::LinkData,
    provenance::{OwnedById, ProvenanceMetadata},
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

/// The properties of an entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema), schema(value_type = Object))]
pub struct EntityProperties(HashMap<BaseUrl, serde_json::Value>);

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
    pub const fn new(properties: HashMap<BaseUrl, serde_json::Value>) -> Self {
        Self(properties)
    }

    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }
}

impl EntityProperties {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, serde_json::Value> {
        &self.0
    }
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
// TODO: deny_unknown_fields on other structs
// TODO: Make fields `pub` and restrict mutability when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    record_id: EntityRecordId,
    temporal_versioning: EntityTemporalMetadata,
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    entity_type_id: VersionedUrl,
    provenance: ProvenanceMetadata,
    archived: bool,
}

impl EntityMetadata {
    #[must_use]
    pub const fn new(
        record_id: EntityRecordId,
        temporal_versioning: EntityTemporalMetadata,
        entity_type_id: VersionedUrl,
        provenance: ProvenanceMetadata,
        archived: bool,
    ) -> Self {
        Self {
            record_id,
            temporal_versioning,
            entity_type_id,
            provenance,
            archived,
        }
    }

    #[must_use]
    pub const fn record_id(&self) -> EntityRecordId {
        self.record_id
    }

    #[must_use]
    pub const fn temporal_versioning(&self) -> &EntityTemporalMetadata {
        &self.temporal_versioning
    }

    #[must_use]
    pub const fn entity_type_id(&self) -> &VersionedUrl {
        &self.entity_type_id
    }

    #[must_use]
    pub const fn provenance(&self) -> ProvenanceMetadata {
        self.provenance
    }

    #[must_use]
    pub const fn archived(&self) -> bool {
        self.archived
    }
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, PartialEq, Eq, Serialize)]
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
}

pub const ENTITY_ID_DELIMITER: char = '~';

impl fmt::Display for EntityId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "{}{}{}",
            self.owned_by_id, ENTITY_ID_DELIMITER, self.entity_uuid
        )
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
        String::deserialize(deserializer)?
            .split_once(ENTITY_ID_DELIMITER)
            .ok_or_else(|| {
                de::Error::custom(format!(
                    "failed to find `{ENTITY_ID_DELIMITER}` delimited string",
                ))
            })
            .and_then(|(owned_by_id, entity_uuid)| {
                Ok(Self {
                    owned_by_id: OwnedById::new(
                        Uuid::from_str(owned_by_id).map_err(de::Error::custom)?,
                    ),
                    entity_uuid: EntityUuid::new(
                        Uuid::from_str(entity_uuid).map_err(de::Error::custom)?,
                    ),
                })
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

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
}
