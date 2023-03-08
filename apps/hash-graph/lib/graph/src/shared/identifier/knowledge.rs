use std::{
    collections::hash_map::{RandomState, RawEntryMut},
    str::FromStr,
};

use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::{
    identifier::{
        account::AccountId,
        time::{
            DecisionTime, LeftClosedTemporalInterval, TemporalTagged, TimeAxis, TransactionTime,
            VariableAxis,
        },
    },
    knowledge::{Entity, EntityUuid},
    provenance::OwnedById,
    subgraph::{identifier::EntityVertexId, Subgraph, SubgraphIndex},
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct EntityId {
    pub owned_by_id: OwnedById,
    pub entity_uuid: EntityUuid,
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
    Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, FromSql, ToSql, ToSchema,
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
    pub const fn as_uuid(&self) -> Uuid {
        self.0
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecordId {
    pub entity_id: EntityId,
    pub edition_id: EntityEditionId,
}

impl SubgraphIndex<Entity> for EntityVertexId {
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, Self, Entity, RandomState> {
        subgraph.vertices.entities.raw_entry_mut().from_key(self)
    }
}
