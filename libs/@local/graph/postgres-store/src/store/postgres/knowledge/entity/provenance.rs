//! Storage representation of entity provenance, split from the interface types.
//!
//! `created_by_id` and the creation timestamps live in dedicated columns rather than the provenance
//! JSONB, so each datum is stored exactly once. [`SqlEntityProvenance`] and
//! [`SqlEntityEditionProvenance`] mirror that storage layout: column-backed fields directly on the
//! struct, the JSONB remainder in the `json` half. The exhaustive destructures in the [`From`]
//! impls turn a new interface field into a compile error until it is routed to either side.

use core::error::Error;

use bytes::BytesMut;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::provenance::{
        EntityDeletionProvenance, EntityEditionProvenance, EntityProvenance,
        ProvidedEntityEditionProvenance,
    },
    principal::actor::ActorEntityUuid,
};

/// The entity-level provenance fields backed by the `entity_ids` provenance JSONB.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SqlEntityProvenanceJson {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, flatten, skip_serializing_if = "Option::is_none")]
    pub deletion: Option<EntityDeletionProvenance>,
}

impl<'a> FromSql<'a> for SqlEntityProvenanceJson {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

impl ToSql for SqlEntityProvenanceJson {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

/// The JSONB-backed fields of an [`EntityEditionProvenance`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SqlEntityEditionProvenanceJson {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<ActorEntityUuid>,
    #[serde(flatten)]
    pub provided: ProvidedEntityEditionProvenance,
}

/// An [`EntityEditionProvenance`] decomposed into its column- and JSONB-backed halves.
#[derive(Debug)]
pub(crate) struct SqlEntityEditionProvenance {
    pub created_by_id: ActorEntityUuid,
    pub json: SqlEntityEditionProvenanceJson,
}

impl From<SqlEntityEditionProvenance> for EntityEditionProvenance {
    fn from(stored: SqlEntityEditionProvenance) -> Self {
        let SqlEntityEditionProvenance {
            created_by_id,
            json:
                SqlEntityEditionProvenanceJson {
                    archived_by_id,
                    provided,
                },
        } = stored;
        Self {
            created_by_id,
            archived_by_id,
            provided,
        }
    }
}

impl From<EntityEditionProvenance> for SqlEntityEditionProvenance {
    fn from(provenance: EntityEditionProvenance) -> Self {
        let EntityEditionProvenance {
            created_by_id,
            archived_by_id,
            provided,
        } = provenance;
        Self {
            created_by_id,
            json: SqlEntityEditionProvenanceJson {
                archived_by_id,
                provided,
            },
        }
    }
}

impl<'a> FromSql<'a> for SqlEntityEditionProvenanceJson {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

impl ToSql for SqlEntityEditionProvenanceJson {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

/// An [`EntityProvenance`] decomposed into its storage halves.
///
/// The entity-level half lives on `entity_ids`, the edition half on `entity_editions`.
#[derive(Debug)]
pub(crate) struct SqlEntityProvenance {
    pub created_by_id: ActorEntityUuid,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    pub json: SqlEntityProvenanceJson,
    pub edition: SqlEntityEditionProvenance,
}

impl From<EntityProvenance> for SqlEntityProvenance {
    fn from(provenance: EntityProvenance) -> Self {
        let EntityProvenance {
            created_by_id,
            created_at_transaction_time,
            created_at_decision_time,
            first_non_draft_created_at_transaction_time,
            first_non_draft_created_at_decision_time,
            deletion,
            edition,
        } = provenance;
        Self {
            created_by_id,
            created_at_transaction_time,
            created_at_decision_time,
            json: SqlEntityProvenanceJson {
                first_non_draft_created_at_transaction_time,
                first_non_draft_created_at_decision_time,
                deletion,
            },
            edition: edition.into(),
        }
    }
}

impl From<SqlEntityProvenance> for EntityProvenance {
    fn from(stored: SqlEntityProvenance) -> Self {
        let SqlEntityProvenance {
            created_by_id,
            created_at_transaction_time,
            created_at_decision_time,
            json:
                SqlEntityProvenanceJson {
                    first_non_draft_created_at_transaction_time,
                    first_non_draft_created_at_decision_time,
                    deletion,
                },
            edition,
        } = stored;
        Self {
            created_by_id,
            created_at_transaction_time,
            created_at_decision_time,
            first_non_draft_created_at_transaction_time,
            first_non_draft_created_at_decision_time,
            deletion,
            edition: edition.into(),
        }
    }
}
