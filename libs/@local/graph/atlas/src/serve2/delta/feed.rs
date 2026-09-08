use alloc::{collections::VecDeque, sync::Arc};
use core::{fmt, pin::pin, time::Duration};

use error_stack::{Report, ReportSink, ResultExt as _};
use futures::StreamExt;
use hash_graph_postgres_store::store::{
    EntityDeletion, EntityEnd, EntityEvent, EntityUpdate, PostgresStorePool,
};
use hash_graph_store::{error::QueryError, pool::StorePool as _};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::id::Id;
use tokio::sync::{
    Notify,
    mpsc::{self, Permit, error::TryRecvError},
    oneshot,
};
use type_system::knowledge::entity::id::EntityEditionId;

use super::{
    Delta,
    placement::{Completed, Initial, PendingEntry},
    projector::Position,
};
use crate::{
    dataset::auxiliary::OwnedLegend,
    math::Vec2,
    postgres::{
        self,
        id::{ArchivedEntityId, ArchivedEntityUuid},
    },
};

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

hashql_core::id::newtype! {
    pub(crate) struct EventId(u32)
}

struct DeltaFeedTaskOptions {
    safety_lag: Duration,
    tick_rate: Duration,
}

struct DeltaFeedTaskScratch {
    to_be_processed: Vec<(EventId, EntityUpdate, Position)>,
}

struct DeltaFeedTask {
    delta: Delta,
    pool: Arc<PostgresStorePool>,
    options: DeltaFeedTaskOptions,

    watermark: Timestamp<TransactionTime>,
    safety_lag: ::time::Duration,

    counter: EventId,
    events: VecDeque<(EventId, EntityEvent)>,

    update: mpsc::Receiver<(Delta, oneshot::Sender<Delta>)>,
    notify: Notify,

    rx: mpsc::Receiver<PendingEntry<Completed>>,
    tx: mpsc::Sender<PendingEntry<Initial>>,

    pending: Vec<(EventId, EntityUpdate)>,
    scratch: DeltaFeedTaskScratch,
}

impl DeltaFeedTask {
    async fn run(&mut self) {
        let mut interval = tokio::time::interval(self.options.tick_rate);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            let swap = tokio::select! {
                _ = interval.tick() => None,
                permit = self.tx.reserve(), if !self.events.is_empty() => {
                    todo!()
                },
                recv = self.update.recv() => Some(recv)
            };

            match swap {
                None => match self.tick().await {
                    Ok(true) => self.notify.notify_one(),
                    Ok(false) => {}
                    Err(error) => {
                        tracing::error!(?error, "unable to complete delta tick, trying again");
                        continue;
                    }
                },
                Some(None) => {
                    // The underlying process has shut down, we can therefore shutdown ourselves as
                    // well
                    break;
                }
                Some(Some((mut previous, tx))) => {
                    // The delta has been requested, we have a previous delta that we can use next.
                    previous.clone_from(&self.delta);
                    previous.revision.increment_by(1);

                    let requested = core::mem::replace(&mut self.delta, previous);

                    if tx.send(requested).is_err() {
                        // unable to send the requested delta, dropping it
                        self.delta.revision.decrement_by(1);
                    }
                }
            }
        }
    }

    async fn poll_database(&mut self) -> Result<(), Report<DeltaFeedError>> {
        let store = self
            .pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;

        let mut sink = ReportSink::<QueryError>::new_armed();
        let stream = store.entity_events_since(self.watermark - self.safety_lag);

        let mut stream = pin!(stream);
        while let Some(result) = stream.next().await {
            let Some(event) = sink.attempt(result) else {
                continue;
            };

            self.events.push_back((self.counter, event));
            self.counter.increment_by(1);
        }

        sink.finish().change_context(DeltaFeedError::Event)
    }

    async fn poll_embeddings(&mut self) -> bool {
        // TODO: recv on the tick
        loop {
            match self.rx.try_recv() {
                Ok(PendingEntry {
                    event,
                    entity,
                    phase: Completed(result),
                }) => {
                    let position = match result {
                        Ok(position) => position,
                        Err(err) => {
                            tracing::warn!("todo");
                            continue;
                        }
                    };

                    // find the entry inside of self.pending
                    if let Some(index) = self.pending.iter().position(|&(id, _)| id == event) {
                        let (id, event) = self.pending.swap_remove(index);

                        self.scratch.to_be_processed.push((id, event, position));
                    } else {
                        tracing::warn!("todo")
                    }
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => todo!("well shit"),
            }
        }

        let mut changed = false;

        // TODO: get the display now for everything
        // postgres::read_edition_displays(store, editions)

        changed
    }

    fn pump(&mut self, mut permit: Option<Permit<'_, PendingEntry<Initial>>>) -> bool {
        let mut changed = false;

        while let Some((id, event)) = self.events.pop_front() {
            match event {
                EntityEvent::Deleted(EntityDeletion {
                    entity,
                    provenance: _,
                })
                | EntityEvent::Ended(EntityEnd {
                    entity,
                    ended_at: _,
                }) => {
                    changed |= self.delta.withdraw(entity.entity_uuid.into());
                }
                EntityEvent::Updated(update) => {
                    if let Some(permit) = permit.take() {
                        permit.send(PendingEntry {
                            event: id,
                            entity: update.entity,
                            phase: Initial,
                        });
                    } else {
                        match self.tx.try_send(PendingEntry {
                            event: id,
                            entity: update.entity,
                            phase: Initial,
                        }) {
                            Ok(()) => {}
                            Err(mpsc::error::TrySendError::Closed(_)) => {
                                todo!()
                            }
                            Err(mpsc::error::TrySendError::Full(_)) => {
                                self.events.push_front((id, event));
                                break;
                            }
                        }
                    }

                    self.pending.push((id, update));
                    break;
                }
            }
        }

        changed
    }

    async fn tick(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        self.poll_database().await?;
        let mut changed = self.pump(None);
        changed |= self.poll_embeddings().await;

        Ok(changed)
    }
}
