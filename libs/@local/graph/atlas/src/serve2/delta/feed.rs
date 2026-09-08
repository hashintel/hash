use alloc::sync::Arc;
use core::{fmt, pin::pin, time::Duration};

use error_stack::{Report, ReportSink, ResultExt as _};
use futures::StreamExt;
use hash_graph_postgres_store::store::{EntityEvent, PostgresStorePool};
use hash_graph_store::{error::QueryError, pool::StorePool as _};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::id::Id;
use tokio::sync::{Notify, mpsc, oneshot};
use type_system::knowledge::entity::id::EntityEditionId;

use super::Delta;
use crate::{
    dataset::auxiliary::OwnedLegend,
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid},
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

pub(crate) struct DeltaFeedEvent {
    pub entity: ArchivedEntityId,

    pub version: Timestamp<TransactionTime>,
    pub kind: DeltaEventKind,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Tick(u64);

impl Tick {
    fn increment(&mut self) -> Self {
        let this = *self;
        self.0 += 1;
        this
    }
}

struct DeltaFeedTaskOptions {
    safety_lag: Duration,
    tick_rate: Duration,
}

pub(crate) enum DeltaEventKind {
    Live {
        edition: EntityEditionId,

        position: Vec2,
        payload: OwnedLegend,
        endpoints: Option<[ArchivedEntityUuid; 2]>,
    },
    Defect,
    Withdrawn,
}

struct DeltaFeedTask {
    delta: Delta,
    tick: Tick,
    pool: Arc<PostgresStorePool>,
    options: DeltaFeedTaskOptions,

    watermark: Timestamp<TransactionTime>,
    safety_lag: ::time::Duration,

    counter: EventId,
    events: Vec<(EventId, EntityEvent)>,

    update: mpsc::Receiver<(Delta, oneshot::Sender<Delta>)>,
    notify: Notify,

    pending: Vec<(EventId, Tick)>,
}

impl DeltaFeedTask {
    async fn run(&mut self) {
        let mut interval = tokio::time::interval(self.options.tick_rate);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            let swap = tokio::select! {
                _ = interval.tick() => None,
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
                    previous.revision.increment();

                    let requested = core::mem::replace(&mut self.delta, previous);

                    if tx.send(requested).is_err() {
                        // unable to send the requested delta, dropping it
                        self.delta.revision.decrement();
                    }
                }
            }
        }
    }

    async fn poll(&mut self) -> Result<(), Report<DeltaFeedError>> {
        let store = self
            .pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;

        self.events.clear();
        let mut sink = ReportSink::<QueryError>::new_armed();
        let stream = store.entity_events_since(self.watermark - self.safety_lag);

        let mut stream = pin!(stream);
        while let Some(result) = stream.next().await {
            let Some(event) = sink.attempt(result) else {
                continue;
            };

            self.events.push((self.counter, event));
            self.counter.increment_by(1);
        }

        sink.finish().change_context(DeltaFeedError::Event)
    }

    async fn tick(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        let current = self.tick.increment();

        self.poll().await?;

        // TODO: now we fetch the labels, embeddings, etc. or put it on the backbuffer.
        todo!()
    }
}
