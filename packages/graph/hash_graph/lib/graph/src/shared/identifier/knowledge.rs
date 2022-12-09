use std::str::FromStr;

use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};
use utoipa::{
    openapi,
    openapi::{KnownFormat, SchemaFormat},
    ToSchema,
};

use crate::{
    identifier::{account::AccountId, Timespan, Timestamp},
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
        // We can be more efficient than this, we know the byte sizes of all the elements
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

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityVersion {
    decision_time: Timespan,
    transaction_time: Timespan,
}

impl Serialize for EntityVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // TODO: Expose temporal versions to backend
        //   see https://app.asana.com/0/0/1203444301722133/f
        self.transaction_time().from.serialize(serializer)
    }
}

impl ToSchema for EntityVersion {
    fn schema() -> openapi::Schema {
        openapi::schema::ObjectBuilder::new()
            .schema_type(openapi::SchemaType::String)
            .format(Some(SchemaFormat::KnownFormat(KnownFormat::DateTime)))
            .into()
    }
}

impl EntityVersion {
    #[must_use]
    pub const fn new(decision_time: Timespan, transaction_time: Timespan) -> Self {
        Self {
            decision_time,
            transaction_time,
        }
    }

    #[must_use]
    pub const fn decision_time(&self) -> Timespan {
        self.decision_time
    }

    #[must_use]
    pub const fn transaction_time(&self) -> Timespan {
        self.transaction_time
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
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

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdAndTimestamp {
    base_id: EntityId,
    timestamp: Timestamp,
}

impl EntityIdAndTimestamp {
    #[must_use]
    pub const fn new(entity_id: EntityId, timestamp: Timestamp) -> Self {
        Self {
            base_id: entity_id,
            timestamp,
        }
    }

    #[must_use]
    pub const fn base_id(&self) -> EntityId {
        self.base_id
    }

    #[must_use]
    pub const fn timestamp(&self) -> Timestamp {
        self.timestamp
    }
}

// WARNING: This MUST be kept up to date with the struct names and serde attributes
//   Necessary because Timestamp doesn't implement ToSchema
impl ToSchema for EntityIdAndTimestamp {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property(
                "baseId",
                // Apparently OpenAPI doesn't support const values, the best you can do is
                // an enum with one option
                EntityId::schema(),
            )
            .required("baseId")
            .property(
                "timestamp",
                openapi::schema::Object::from(
                    openapi::schema::ObjectBuilder::new()
                        .schema_type(openapi::SchemaType::String)
                        .format(Some(SchemaFormat::KnownFormat(KnownFormat::DateTime))),
                ),
            )
            .required("timestamp")
            .into()
    }
}
