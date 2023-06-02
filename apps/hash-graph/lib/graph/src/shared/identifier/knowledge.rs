use std::{fmt, str::FromStr};

use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::{
    identifier::{
        account::AccountId,
        time::{
            DecisionTime, LeftClosedTemporalInterval, TemporalTagged, TimeAxis, TransactionTime,
        },
    },
    knowledge::EntityUuid,
    provenance::OwnedById,
    subgraph::temporal_axes::VariableAxis,
};

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
                Error::custom(format!(
                    "failed to find `{ENTITY_ID_DELIMITER}` delimited string",
                ))
            })
            .and_then(|(owned_by_id, entity_uuid)| {
                Ok(Self {
                    owned_by_id: OwnedById::new(AccountId::new(
                        Uuid::from_str(owned_by_id).map_err(Error::custom)?,
                    )),
                    entity_uuid: EntityUuid::new(
                        Uuid::from_str(entity_uuid).map_err(Error::custom)?,
                    ),
                })
            })
    }
}

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

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTemporalMetadata {
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

impl EntityTemporalMetadata {
    #[must_use]
    pub fn variable_time_interval(
        &self,
        time_axis: TimeAxis,
    ) -> LeftClosedTemporalInterval<VariableAxis> {
        match time_axis {
            TimeAxis::DecisionTime => self.decision_time.cast(),
            TimeAxis::TransactionTime => self.transaction_time.cast(),
        }
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    FromSql,
    ToSql,
    ToSchema,
)]
#[postgres(transparent)]
#[repr(transparent)]
pub struct EntityEditionId(Uuid);

impl EntityEditionId {
    #[must_use]
    pub const fn new(id: Uuid) -> Self {
        Self(id)
    }

    #[must_use]
    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecordId {
    pub entity_id: EntityId,
    pub edition_id: EntityEditionId,
}
