use alloc::collections::VecDeque;
use core::ops::ControlFlow;

use error_stack::Report;
use hashql_core::collections::FastHashMap;
use tokio::sync::mpsc::{self, error::TrySendError};
use type_system::knowledge::entity::EntityId;

use super::PlacementError;
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::BoxedVecN,
    postgres::id::ArchivedEntityId,
    serve2::delta::{feed::EventId, projector::Position},
};

#[cfg(test)]
mod tests;

/// An event awaiting its first embedding lookup.
pub(crate) struct Initial;

pub(super) struct PollDatabase {
    pub tries: u16,
}

pub(super) struct SubmitWorkflow;

pub(super) struct PollWorkflow {
    pub tries: u16,
}

pub(super) struct Project {
    pub embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,
}

/// One event's fitted-world position or placement failure.
pub(crate) struct Completed(pub Result<Position, Report<PlacementError>>);

/// A placement request retaining its event identity through each phase.
pub(crate) struct PendingEntry<T> {
    pub event: EventId,
    pub entity: EntityId,
    pub phase: T,
}

impl<T> PendingEntry<T> {
    pub(super) fn transition<U>(self, phase: U) -> PendingEntry<U> {
        PendingEntry {
            event: self.event,
            entity: self.entity,
            phase,
        }
    }
}

#[derive(Default)]
pub(super) struct Pending {
    pub poll_database: Vec<PendingEntry<PollDatabase>>,
    pub submit_workflow: Vec<PendingEntry<SubmitWorkflow>>,
    pub poll_workflow: Vec<PendingEntry<PollWorkflow>>,
    pub project: Vec<PendingEntry<Project>>,
    pub completed: VecDeque<PendingEntry<Completed>>,
}

impl Pending {
    pub(crate) fn len(&self) -> usize {
        self.poll_database.len()
            + self.submit_workflow.len()
            + self.poll_workflow.len()
            + self.project.len()
            + self.completed.len()
    }

    pub(crate) fn flush(&mut self, tx: &mpsc::Sender<PendingEntry<Completed>>) -> ControlFlow<()> {
        while let Some(next) = self.completed.pop_front() {
            match tx.try_send(next) {
                Ok(()) => {}
                Err(TrySendError::Full(next)) => {
                    self.completed.push_front(next);
                    break;
                }
                Err(TrySendError::Closed(_)) => return ControlFlow::Break(()),
            }
        }
        ControlFlow::Continue(())
    }

    pub(crate) fn enqueue(&mut self, entry: PendingEntry<Initial>, tries: u16) {
        self.poll_database
            .push(entry.transition(PollDatabase { tries }));
    }

    pub(crate) fn transition_database(
        &mut self,
        embeddings: &mut FastHashMap<ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>>,
    ) {
        self.poll_database.retain_mut(|entry| {
            entry.phase.tries = entry.phase.tries.saturating_sub(1);
            if let Some(embedding) = embeddings.remove(&ArchivedEntityId::from(entry.entity)) {
                self.project.push(PendingEntry {
                    event: entry.event,
                    entity: entry.entity,
                    phase: Project { embedding },
                });
                return false;
            }
            true
        });
        self.submit_workflow.extend(
            self.poll_database
                .extract_if(.., |entry| entry.phase.tries == 0)
                .map(|entry| entry.transition(SubmitWorkflow)),
        );
    }

    pub(crate) fn transition_workflow(
        &mut self,
        embeddings: &mut FastHashMap<ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>>,
    ) {
        self.poll_workflow.retain_mut(|entry| {
            entry.phase.tries = entry.phase.tries.saturating_sub(1);
            if let Some(embedding) = embeddings.remove(&ArchivedEntityId::from(entry.entity)) {
                self.project.push(PendingEntry {
                    event: entry.event,
                    entity: entry.entity,
                    phase: Project { embedding },
                });
                return false;
            }
            true
        });

        self.completed.extend(
            self.poll_workflow
                .extract_if(.., |entry| entry.phase.tries == 0)
                .map(|entry| {
                    entry.transition(Completed(Err(Report::new(PlacementError::Exhaustion))))
                }),
        );
    }

    pub(crate) fn exhaust_submit_workflow(&mut self) {
        self.completed
            .extend(self.submit_workflow.drain(..).map(|entry| {
                entry.transition(Completed(Err(Report::new(PlacementError::Exhaustion))))
            }));
    }
}
