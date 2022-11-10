use std::str::FromStr;

use postgres_types::{FromSql, ToSql};
use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};
use utoipa::{openapi, ToSchema};

use crate::{
    identifier::{account::AccountId, Timestamp},
    knowledge::EntityUuid,
    provenance::OwnedById,
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct EntityId {
    owned_by_id: OwnedById,
    entity_uuid: EntityUuid,
}

impl EntityId {
    #[must_use]
    pub const fn new(owned_by_id: OwnedById, entity_uuid: EntityUuid) -> Self {
        Self {
            owned_by_id,
            entity_uuid,
        }
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
    }

    #[must_use]
    pub const fn entity_uuid(&self) -> EntityUuid {
        self.entity_uuid
    }
}

impl Serialize for EntityId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&format!("{}%{}", self.owned_by_id, self.entity_uuid))
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        // TODO: we can be more efficient than this, we know the byte sizes of all the elements
        let as_string = String::deserialize(deserializer)?;
        let mut parts = as_string.split('%');

        Ok(Self {
            owned_by_id: OwnedById::new(AccountId::new(
                uuid::Uuid::from_str(parts.next().ok_or_else(|| {
                    D::Error::custom("failed to find first component of `%` delimited string")
                })?)
                .map_err(|err| D::Error::custom(err.to_string()))?,
            )),
            entity_uuid: EntityUuid::new(
                uuid::Uuid::from_str(parts.next().ok_or_else(|| {
                    D::Error::custom("failed to find second component of `%` delimited string")
                })?)
                .map_err(|err| D::Error::custom(err.to_string()))?,
            ),
        })
    }
}

impl ToSchema for EntityId {
    fn schema() -> openapi::Schema {
        openapi::Schema::Object(openapi::schema::Object::with_type(
            openapi::SchemaType::String,
        ))
    }
}

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct EntityVersion(Timestamp);

impl EntityVersion {
    #[must_use]
    pub const fn new(inner: Timestamp) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(&self) -> Timestamp {
        self.0
    }
}

impl ToSchema for EntityVersion {
    fn schema() -> openapi::Schema {
        openapi::Schema::Object(openapi::schema::Object::with_type(
            openapi::SchemaType::String,
        ))
    }
}

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema,
)]
#[serde(rename_all = "camelCase")]
pub struct EntityEditionId {
    base_id: EntityId,
    version: EntityVersion,
}

impl EntityEditionId {
    #[must_use]
    pub const fn new(entity_id: EntityId, version: EntityVersion) -> Self {
        Self {
            base_id: entity_id,
            version,
        }
    }

    #[must_use]
    pub const fn base_id(&self) -> EntityId {
        self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> EntityVersion {
        self.version
    }
}
