use alloc::sync::Arc;
use core::{ops::ControlFlow, time::Duration};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool};
use hash_graph_store::{filter::protection::PropertyProtectionFilterConfig, pool::StorePool as _};
use hash_temporal_client::{TemporalClient, WorkflowError, WorkflowStart};
use hashql_core::{collections::FastHashMap, id::Id as _};
use tokio::sync::mpsc;
use type_system::{knowledge::entity::EntityId, ontology::BaseUrl, principal::actor::ActorId};

use super::{feed::EventId, projector};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{BoxedVecN, Vec2},
    postgres::{id::ArchivedEntityId, read_projector_embeddings},
};

#[derive(Debug)]
pub struct EmbeddingWorkflow {
    pub temporal: TemporalClient,
    pub filter_protection: PropertyProtectionFilterConfig<'static>,
}

enum PlacementError {
    OutOfFrame,
    Exhaustion,
    Error(Report<WorkflowError>),
}

struct Initial;
struct PollDatabase {
    tries: u16,
}
struct SubmitWorkflow;
struct PollWorkflow {
    tries: u16,

    workflow: String,
    run: Option<String>,
}
struct Project {
    embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,
}
struct Completed(Result<Vec2, PlacementError>);

#[derive(Debug)]
pub(crate) enum DeltaPlacementError {
    Connect,
    Read,
}

impl core::fmt::Display for DeltaPlacementError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Connect => fmt.write_str("could not connect to the store"),
            Self::Read => fmt.write_str("could not read the projector embeddings"),
        }
    }
}

impl core::error::Error for DeltaPlacementError {}

struct PendingEntry<T> {
    event: EventId,
    entity: EntityId,
    phase: T,
}

struct Pending {
    initial: Vec<PendingEntry<Initial>>,
    poll_database: Vec<PendingEntry<PollDatabase>>,
    submit_workflow: Vec<PendingEntry<SubmitWorkflow>>,
    poll_workflow: Vec<PendingEntry<PollWorkflow>>,
    project: Vec<PendingEntry<Project>>,
    completed: Vec<PendingEntry<Completed>>,
}

struct DeltaPlacementTaskOptions {
    tick_rate: Duration,

    tries_workflow: u16,
    tries_database: u16,

    minimum_projection_interval: usize,
}

struct Scratch {
    embeddings: FastHashMap<ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>>,
}

hashql_core::id::newtype! {
    pub(crate) struct Tick(u64)
}

pub(crate) struct DeltaPlacementTask {
    pool: Arc<PostgresStorePool>,
    tick: Tick,

    projector: projector::DeltaProjector,
    options: DeltaPlacementTaskOptions,

    rx: mpsc::Receiver<EntityId>,

    actor: Option<ControlFlow<(), ActorId>>,
    pending: Pending,
    scratch: Scratch,
    workflow: Option<EmbeddingWorkflow>,
    last_projection_at: Tick,
}

impl DeltaPlacementTask {
    async fn fetch_embeddings(
        store: &impl AsClient,
        ids: impl Iterator<Item = ArchivedEntityId>,
        scratch: &mut Scratch,
    ) {
        let result = read_projector_embeddings(store, ids).await;

        scratch.embeddings.clear();
        match result {
            Ok(embeddings) => {
                scratch.embeddings.extend(embeddings);
            }
            Err(error) => {
                tracing::warn!("todo")
            }
        }
    }

    async fn poll_database(&mut self, store: &impl AsClient) {
        Self::fetch_embeddings(
            store,
            self.pending.poll_database.iter().map(
                |&PendingEntry {
                     event: _,
                     entity,
                     phase: _,
                 }| ArchivedEntityId::from(entity),
            ),
            &mut self.scratch,
        )
        .await;

        self.pending.poll_database.retain_mut(|poll| {
            poll.phase.tries = poll.phase.tries.saturating_sub(1);

            let Some(embedding) = self
                .scratch
                .embeddings
                .remove(&ArchivedEntityId::from(poll.entity))
            else {
                if poll.phase.tries == 0 {
                    // Promote to submit workflow, as we have no embedding to use
                    self.pending.submit_workflow.push(PendingEntry {
                        event: poll.event,
                        entity: poll.entity,
                        phase: SubmitWorkflow,
                    });
                    return false;
                }

                return true;
            };

            self.pending.project.push(PendingEntry {
                event: poll.event,
                entity: poll.entity,
                phase: Project { embedding },
            });
            false
        });

        if !self.scratch.embeddings.is_empty() {
            tracing::info!("todo");
        }
    }

    fn exhaust_submit_workflow(&mut self) {
        for PendingEntry {
            event,
            entity,
            phase: SubmitWorkflow,
        } in self.pending.submit_workflow.drain(..)
        {
            self.pending.completed.push(PendingEntry {
                event,
                entity,
                phase: Completed(Err(PlacementError::Exhaustion)),
            });
        }
    }

    async fn submit_workflow(&mut self, store: &mut impl PrincipalStore) {
        let Some(workflow) = &self.workflow else {
            self.exhaust_submit_workflow();
            return;
        };

        let actor = match self.actor {
            Some(ControlFlow::Continue(actor)) => actor,
            Some(ControlFlow::Break(_)) => {
                self.exhaust_submit_workflow();
                return;
            }
            None => match store.get_or_create_system_machine("h").await {
                Ok(machine) => {
                    let actor = ActorId::from(machine);
                    self.actor = Some(ControlFlow::Continue(actor));

                    actor
                }
                Err(error) => {
                    tracing::warn!("todo");

                    self.actor = Some(ControlFlow::Break(()));
                    self.exhaust_submit_workflow();
                    return;
                }
            },
        };

        for PendingEntry {
            event,
            entity,
            phase: SubmitWorkflow,
        } in self.pending.submit_workflow.drain(..)
        {
            let workflow_id = format!("atlas-embedding-{entity}");
            let start = workflow
                .temporal
                .ensure_update_entity_embeddings_workflow(
                    workflow_id.clone(),
                    actor.into(),
                    entity,
                    workflow.filter_protection.embedding_exclusions(),
                )
                .await;

            match start {
                Ok(start) => {
                    self.pending.poll_workflow.push(PendingEntry {
                        event,
                        entity,
                        phase: match start {
                            WorkflowStart::Started(run) => PollWorkflow {
                                tries: self.options.tries_workflow,
                                workflow: run.workflow_id,
                                run: Some(run.run_id),
                            },
                            WorkflowStart::AlreadyStarted => PollWorkflow {
                                tries: self.options.tries_workflow,
                                workflow: workflow_id,
                                run: None,
                            },
                        },
                    });
                }
                Err(error) => {
                    self.pending.completed.push(PendingEntry {
                        event,
                        entity,
                        phase: Completed(Err(PlacementError::Error(error))),
                    });
                }
            }
        }
    }

    fn exhaust_poll_workflow(&mut self) {
        for PendingEntry {
            event,
            entity,
            phase: PollWorkflow { .. },
        } in self.pending.poll_workflow.drain(..)
        {
            self.pending.completed.push(PendingEntry {
                event,
                entity,
                phase: Completed(Err(PlacementError::Exhaustion)),
            });
        }
    }

    async fn poll_workflow(&mut self, store: &impl AsClient) {
        // The workflow directly deposits embeddings into the database.
        Self::fetch_embeddings(
            store,
            self.pending.poll_workflow.iter().map(
                |&PendingEntry {
                     event: _,
                     entity,
                     phase: _,
                 }| ArchivedEntityId::from(entity),
            ),
            &mut self.scratch,
        )
        .await;

        self.pending.poll_workflow.retain_mut(|poll| {
            poll.phase.tries = poll.phase.tries.saturating_sub(1);

            let Some(embedding) = self
                .scratch
                .embeddings
                .remove(&ArchivedEntityId::from(poll.entity))
            else {
                if poll.phase.tries == 0 {
                    // Exhaustion
                    self.pending.completed.push(PendingEntry {
                        event: poll.event,
                        entity: poll.entity,
                        phase: Completed(Err(PlacementError::Exhaustion)),
                    });
                    return false;
                }

                return true;
            };

            self.pending.project.push(PendingEntry {
                event: poll.event,
                entity: poll.entity,
                phase: Project { embedding },
            });
            false
        });

        if !self.scratch.embeddings.is_empty() {
            tracing::info!("todo");
        }
    }

    async fn project(&mut self) {
        if self
            .last_projection_at
            .plus(self.options.minimum_projection_interval)
            < self.tick
        {
            return;
        }

        self.last_projection_at = self.tick;
        let values = crate::offload::run(|| {
            self.projector
                .project(
                    self.pending
                        .project
                        .iter()
                        .map(|entry| &entry.phase.embedding),
                )
                .into_iter()
                .collect()
        })
        .await;
    }
}
