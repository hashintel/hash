use alloc::sync::Arc;
use core::{fmt, pin::pin, time::Duration};

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_postgres_store::store::{
    EntityDeletion, EntityEnd, EntityEvent, EntityUpdate, PostgresStore, PostgresStorePool,
};
use hash_graph_store::pool::StorePool as _;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use type_system::knowledge::entity::id::EntityEditionId;

use crate::postgres::id::ArchivedEntityId;

#[derive(Debug)]
enum DeltaFeedError {
    Connect,
    Event,
}

impl fmt::Display for DeltaFeedError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect => fmt.write_str("failed to connect to the database"),
            Self::Event => fmt.write_str("failed to read event"),
        }
    }
}

impl core::error::Error for DeltaFeedError {}

struct DeltaFeedEvent {
    entity: ArchivedEntityId,
    version: Timestamp<TransactionTime>,
    kind: DeltaEventKind,
}

impl From<EntityEvent> for DeltaFeedEvent {
    fn from(event: EntityEvent) -> Self {
        match event {
            EntityEvent::Updated(EntityUpdate {
                entity,
                edition,
                archived: false,
                changed_at,
            }) => Self {
                entity: entity.into(),
                version: changed_at,
                kind: DeltaEventKind::Live { edition },
            },
            EntityEvent::Updated(EntityUpdate {
                entity,
                edition: _,
                archived: true,
                changed_at,
            }) => Self {
                entity: entity.into(),
                version: changed_at,
                kind: DeltaEventKind::Withdrawn,
            },
            EntityEvent::Ended(EntityEnd { entity, ended_at }) => Self {
                entity: entity.into(),
                version: ended_at,
                kind: DeltaEventKind::Withdrawn,
            },
            EntityEvent::Deleted(EntityDeletion { entity, provenance }) => Self {
                entity: entity.into(),
                version: provenance.deleted_at_transaction_time,
                kind: DeltaEventKind::Withdrawn,
            },
        }
    }
}

struct DeltaFeedConsumerOptions {
    safety_lag: Duration,
}

enum DeltaEventKind {
    Live { edition: EntityEditionId },
    Withdrawn,
}

struct Changeset {
    events: usize,
    changed: bool,
    watermark: Option<Timestamp<TransactionTime>>,
}

impl Changeset {
    fn fold(&mut self, event: &EntityEvent) {
        todo!()
    }
}

struct DeltaFeedConsumer {
    pool: Arc<PostgresStorePool>,

    watermark: Timestamp<TransactionTime>,
    safety_lag: ::time::Duration,
}

impl DeltaFeedConsumer {
    async fn tick(&mut self) -> Result<(), Report<DeltaFeedError>> {
        let store = self
            .pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;

        let events = store.entity_events_since(self.watermark - self.safety_lag);
        let mut events = pin!(events);
        while let Some(event) = events
            .try_next()
            .await
            .change_context(DeltaFeedError::Event)?
        {}
        todo!()
    }
}
