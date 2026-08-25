//! A watermark feed over the published present of the entity store.
//!
//! An entity's published present is its temporal-metadata row with no draft id and both
//! temporal axes open, holding the entity's state at the current decision time. A purge
//! removes every edition and temporal-metadata row of an entity, so the entity stops
//! matching entity queries without ever producing a readable event. Consumers that maintain a
//! derived view of published entities need those events, and this module supplies them as one
//! feed: [`PostgresStore::entity_events_since`], a stream whose single statement reads the
//! temporal-metadata rows, the present editions' archived flags, and the `entity_ids` tombstone
//! columns together.
//!
//! The feed takes a transaction-time watermark and yields events that occurred strictly after
//! it. An event's time comes from the writing process's own wall clock, taken before any write
//! it marks: creation and patching take theirs before their transactions begin, deletion takes
//! its inside its transaction before selecting targets. A row therefore becomes visible up to a
//! whole write request after its recorded time, because everything from the writer's lock waits
//! through post-write validation sits inside that interval. Concurrent writers on different
//! clocks add their skew on top of it. A feed opened inside the interval misses a row that
//! later commits bearing an already-passed time, so a consumer subtracts a safety lag from its
//! watermark
//! that exceeds the longest write request plus the largest cross-writer clock skew. The feed
//! tolerates the re-delivery this produces: reading with an older watermark returns events
//! already seen, unchanged. A backwards clock step wider than the lag loses events permanently,
//! and the feed cannot tell such a loss from quiet.
//!
//! Only events within one call are mutually consistent, never events across calls, because
//! each call runs one statement over one snapshot. The kinds share that snapshot, so a purge's
//! [`Ended`](EntityEvent::Ended) events for the links it archives and its
//! [`Deleted`](EntityEvent::Deleted) event for the target arrive in the same read. Each call
//! returns every entity in every web.
//!
//! The feed reads watermark-filtered current state rather than an event log, and two writers
//! violate what that state can promise. Erase removes an entity's rows from every table the
//! feed reads, including a purge tombstone not yet delivered, so a deletion can vanish before
//! any call returns it. Snapshot restore inserts rows bearing their historical times, which a
//! watermark already past them never revisits. A derived view therefore needs periodic full
//! reconciliation against the store, at a cadence that bounds how long the view can stay wrong,
//! and a deployment that runs erase or restore while consumers poll is choosing that bound.

use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use error_stack::Report;
use futures::{Stream, future::BoxFuture, stream::FusedStream};
use hash_graph_store::error::QueryError;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use postgres_types::{FromSql, Type};
use tokio_postgres::{GenericClient as _, Row, RowStream};
use tracing::{Instrument as _, instrument::Instrumented};
use type_system::knowledge::entity::{
    EntityId, id::EntityEditionId, provenance::EntityDeletionProvenance,
};

use crate::store::postgres::{AsClient, PostgresStore, TransactionState};

/// The feed statement, reading three event kinds from one snapshot in time order.
const ENTITY_EVENT_FEED: &str = "
-- The entity's published present changed. The present row is the one temporal-metadata row
-- per published entity with no draft id and both temporal axes open, and it holds the
-- entity's state at the current decision time. Writes mutate it in place, so its
-- transaction-time start is the moment the present last changed and its edition is the one
-- current now. A patch confined to closed decision history never touches this row, so pure
-- history corrections do not appear. The archived flag lives on the edition rather than the
-- temporal row, and the foreign key from temporal rows to editions makes the join total.
SELECT web_id,
       entity_uuid,
       entity_edition_id,
       archived,
       lower(transaction_time) AS occurred_at,
       'updated' AS reason,
       NULL::UUID AS deleted_by_id,
       NULL::TIMESTAMPTZ AS deleted_at_decision_time
FROM entity_temporal_metadata
JOIN entity_editions USING (entity_edition_id)
WHERE draft_id IS NULL
  AND upper_inf(transaction_time)
  AND upper_inf(decision_time)
  AND lower(transaction_time) > $1

UNION ALL

-- The entity's published present ended without a successor: transaction-current rows remain,
-- every one with a bounded decision axis, and no present row exists anymore. The event's time
-- is the latest write among what remains. No edition travels, because ended means no edition
-- is current. The one production writer of this shape is a purge archiving its target's
-- incoming link entities.
SELECT closed.web_id,
       closed.entity_uuid,
       NULL::UUID AS entity_edition_id,
       NULL::BOOLEAN AS archived,
       max(lower(closed.transaction_time)) AS occurred_at,
       'ended' AS reason,
       NULL::UUID AS deleted_by_id,
       NULL::TIMESTAMPTZ AS deleted_at_decision_time
FROM entity_temporal_metadata AS closed
WHERE closed.draft_id IS NULL
  AND upper_inf(closed.transaction_time)
  AND NOT upper_inf(closed.decision_time)
  AND lower(closed.transaction_time) > $1
  AND NOT EXISTS (
      SELECT 1
      FROM entity_temporal_metadata AS present
      WHERE present.web_id = closed.web_id
        AND present.entity_uuid = closed.entity_uuid
        AND present.draft_id IS NULL
        AND upper_inf(present.transaction_time)
        AND upper_inf(present.decision_time)
  )
GROUP BY closed.web_id, closed.entity_uuid

UNION ALL

-- The entity was purged: its editions and temporal rows are gone, and the tombstone on its
-- entity_ids row is the only readable record that it existed and who deleted it. Erase
-- removes the entity_ids row itself and leaves no tombstone, so an erased entity never
-- appears here.
SELECT web_id,
       entity_uuid,
       NULL::UUID AS entity_edition_id,
       NULL::BOOLEAN AS archived,
       deleted_at_transaction_time AS occurred_at,
       'deleted' AS reason,
       deleted_by_id,
       deleted_at_decision_time
FROM entity_ids
WHERE deleted_at_transaction_time > $1

ORDER BY occurred_at, web_id, entity_uuid";

/// A change of an entity's published present, yielded by
/// [`PostgresStore::entity_events_since`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EntityUpdate {
    /// The entity whose present changed. Feed events never concern drafts, so the id carries
    /// no draft id.
    pub entity: EntityId,
    /// The edition current at the present, read in the same snapshot that observed the change.
    pub edition: EntityEditionId,
    /// The carried edition's archived flag, read in the same snapshot that observed the change.
    pub archived: bool,
    /// When the present last changed, on the transaction-time axis.
    pub changed_at: Timestamp<TransactionTime>,
}

/// The end of an entity's published present, yielded by
/// [`PostgresStore::entity_events_since`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EntityEnd {
    /// The entity whose present ended. Feed events never concern drafts, so the id carries no
    /// draft id.
    pub entity: EntityId,
    /// When the present ended, on the transaction-time axis.
    pub ended_at: Timestamp<TransactionTime>,
}

/// A deletion tombstone read back from the `entity_ids` columns, yielded by
/// [`PostgresStore::entity_events_since`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityDeletion {
    /// The purged entity. Feed events never concern drafts, so the id carries no draft id.
    pub entity: EntityId,
    /// Who deleted the entity and when, on both temporal axes.
    pub provenance: EntityDeletionProvenance,
}

/// One event from the entity feed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntityEvent {
    /// The entity's published present changed, and the carried edition is now current.
    Updated(EntityUpdate),
    /// The entity's published present ended without a successor.
    Ended(EntityEnd),
    /// The entity was purged, and its tombstone is the only readable record it existed.
    Deleted(EntityDeletion),
}

/// The feed's row discriminator, decoded from the statement's `reason` column.
enum EventKind {
    Updated,
    Ended,
    Deleted,
}

impl<'row> FromSql<'row> for EventKind {
    fn from_sql(
        ty: &Type,
        raw: &'row [u8],
    ) -> Result<Self, Box<dyn core::error::Error + Sync + Send>> {
        match <&str as FromSql>::from_sql(ty, raw)? {
            "updated" => Ok(Self::Updated),
            "ended" => Ok(Self::Ended),
            "deleted" => Ok(Self::Deleted),
            other => Err(Box::from(format!(
                "unknown entity feed event kind `{other}`"
            ))),
        }
    }

    fn accepts(ty: &Type) -> bool {
        <&str as FromSql>::accepts(ty)
    }
}

/// Decodes one feed row into its event, dispatching on the `reason` column.
fn decode_event(row: &Row) -> Result<EntityEvent, tokio_postgres::Error> {
    let entity = EntityId {
        web_id: row.try_get(0)?,
        entity_uuid: row.try_get(1)?,
        draft_id: None,
    };

    Ok(match row.try_get(5)? {
        EventKind::Updated => EntityEvent::Updated(EntityUpdate {
            entity,
            edition: row.try_get(2)?,
            archived: row.try_get(3)?,
            changed_at: row.try_get(4)?,
        }),
        EventKind::Ended => EntityEvent::Ended(EntityEnd {
            entity,
            ended_at: row.try_get(4)?,
        }),
        EventKind::Deleted => EntityEvent::Deleted(EntityDeletion {
            entity,
            provenance: EntityDeletionProvenance {
                deleted_by_id: row.try_get(6)?,
                deleted_at_transaction_time: row.try_get(4)?,
                deleted_at_decision_time: row.try_get(7)?,
            },
        }),
    })
}

pin_project_lite::pin_project! {
    /// Where the feed stands: waiting on the statement, or yielding its rows.
    #[project = FeedStateProj]
    enum FeedState<'client> {
        Terminated,
        Opening {
            #[pin]
            query: Instrumented<BoxFuture<'client, Result<RowStream, tokio_postgres::Error>>>,
        },
        Streaming {
            #[pin]
            rows: RowStream,
        },
    }
}

pin_project_lite::pin_project! {
    /// The entity event feed opened by [`PostgresStore::entity_events_since`].
    pub struct EntityEventStream<'client> {
        #[pin]
        state: FeedState<'client>,
    }
}

impl Stream for EntityEventStream<'_> {
    type Item = Result<EntityEvent, Report<QueryError>>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();
        loop {
            match this.state.as_mut().project() {
                FeedStateProj::Opening { query } => match ready!(query.poll(cx)) {
                    Ok(rows) => this.state.set(FeedState::Streaming { rows }),
                    Err(error) => {
                        this.state.set(FeedState::Terminated);
                        return Poll::Ready(Some(Err(
                            Report::new(error).change_context(QueryError)
                        )));
                    }
                },
                FeedStateProj::Streaming { rows } => {
                    let Some(result) = ready!(rows.poll_next(cx)) else {
                        this.state.set(FeedState::Terminated);
                        return Poll::Ready(None);
                    };

                    return Poll::Ready(Some(
                        result
                            .and_then(|row| decode_event(&row))
                            .map_err(|error| Report::new(error).change_context(QueryError)),
                    ));
                }
                FeedStateProj::Terminated => {
                    return Poll::Ready(None);
                }
            }
        }
    }
}

impl FusedStream for EntityEventStream<'_> {
    fn is_terminated(&self) -> bool {
        matches!(self.state, FeedState::Terminated)
    }
}

impl<C, S> PostgresStore<C, S>
where
    C: AsClient,
    S: TransactionState,
{
    /// Opens the entity event feed, yielding events that occurred strictly after `since`.
    ///
    /// One statement serves the whole call, so every yielded event describes the same snapshot,
    /// in time order. The kinds:
    ///
    /// - [`EntityEvent::Updated`]: the entity's published present row was written after `since`.
    ///   The published present is the temporal-metadata row with no draft id and both axes
    ///   unbounded, and it holds the entity's state at the current decision time. Creating or
    ///   undrafting an entity, publishing a draft over a live one, and every patch whose decision
    ///   time falls inside the open present slice all fire this kind, each event carrying only the
    ///   edition current at the present, with that edition's archived flag, so editions written and
    ///   replaced between two reads never appear. A patch that only flips the archived flag fires
    ///   it too, because the flag lives on the new edition rather than on the temporal row, and the
    ///   carried flag is the value after the flip.
    /// - [`EntityEvent::Ended`]: the entity has a transaction-time-current row written after
    ///   `since` whose decision axis is bounded, and no present row remains. The condition ranges
    ///   over current rows only: an ended entity's transaction-time-closed history keeps unbounded
    ///   decision axes. Closing the present without a successor is what fires this kind, and the
    ///   one production writer that does so is a purge archiving its target's incoming link
    ///   entities. Publishing a draft always installs a successor, so it fires
    ///   [`Updated`](EntityEvent::Updated) instead. A history correction to an entity whose present
    ///   already ended rewrites rows this kind ranges over, so it re-delivers the end with a newer
    ///   time, within the feed's re-delivery tolerance.
    /// - [`EntityEvent::Deleted`]: the entity was purged after `since`. Purge deletes an entity's
    ///   editions and temporal rows and writes a tombstone to its `entity_ids` row, so the
    ///   tombstone is the only readable record that the entity existed and who deleted it. Erase
    ///   removes the `entity_ids` row itself and leaves no tombstone, so an erased entity never
    ///   appears, and an erase after a purge removes a tombstone this feed may not have delivered
    ///   yet.
    ///
    /// An event always reflects the entity's state at the current decision time: a write
    /// confined to closed decision history rewrites rows the feed never selects and is not
    /// delivered, while one that reaches the open present mutates the present row and is
    /// delivered.
    /// To maintain a view of current state, apply [`Updated`](EntityEvent::Updated) as an upsert
    /// of the carried edition, and [`Ended`](EntityEvent::Ended) and
    /// [`Deleted`](EntityEvent::Deleted) as removals. A view that excludes archived entities
    /// reads the carried flag and treats a set flag as a removal. Draft rows never enter the feed,
    /// and pure history corrections to live entities fire nothing.
    ///
    /// The comparison against `since` is strict, so an event that occurred exactly at `since`
    /// stays
    /// out. The module documentation describes the commit-visibility window this leaves and the
    /// safety lag that covers it.
    ///
    /// # Errors
    ///
    /// The stream yields [`QueryError`] when the feed statement fails or a row fails to decode.
    pub fn entity_events_since(&self, since: Timestamp<TransactionTime>) -> EntityEventStream<'_> {
        let query = self
            .as_client()
            .query_raw(ENTITY_EVENT_FEED, [since])
            .instrument(tracing::info_span!(
                "SELECT entity event feed",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ));

        EntityEventStream {
            state: FeedState::Opening { query },
        }
    }
}
