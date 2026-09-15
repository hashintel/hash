//! Placement requests partitioned by embedding and projection phase.

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
    serve::delta::{feed::EventId, projector::Position},
};

#[cfg(test)]
mod tests;

/// An event awaiting its first embedding lookup.
pub(crate) struct Initial;

/// An event awaiting a database embedding lookup, with its remaining miss budget.
///
/// The zero value still permits one lookup: a hit succeeds, while a miss leaves this phase.
pub(super) struct PollDatabase {
    pub tries: u16,
}

/// An event awaiting workflow submission after its database tries are exhausted.
pub(super) struct SubmitWorkflow;

/// An event awaiting a workflow embedding lookup, with its remaining miss budget.
///
/// The zero value still permits one lookup: a hit succeeds, while a miss exhausts the entry.
pub(super) struct PollWorkflow {
    pub tries: u16,
}

/// An event with a resolved embedding, awaiting projection.
pub(super) struct Project {
    pub embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,
}

/// One event's fitted-world position or placement failure.
pub(crate) struct Completed(pub Result<Position, Report<PlacementError>>);

/// A placement request retaining its event identity through each phase.
pub(crate) struct PendingEntry<T> {
    /// The coalesced event version this request belongs to.
    pub event: EventId,
    /// The entity awaiting its embedding and position.
    pub entity: EntityId,
    /// This request's current placement stage.
    pub phase: T,
}

impl<T> PendingEntry<T> {
    /// Advances this entry to `phase`, retaining its event and entity identity.
    pub(super) fn transition<U>(self, phase: U) -> PendingEntry<U> {
        PendingEntry {
            event: self.event,
            entity: self.entity,
            phase,
        }
    }
}

/// Placement requests partitioned by their embedding-resolution stage.
#[derive(Default)]
pub(super) struct Pending {
    pub poll_database: Vec<PendingEntry<PollDatabase>>,
    pub submit_workflow: Vec<PendingEntry<SubmitWorkflow>>,
    pub poll_workflow: Vec<PendingEntry<PollWorkflow>>,
    pub project: Vec<PendingEntry<Project>>,
    pub completed: VecDeque<PendingEntry<Completed>>,
}

impl Pending {
    /// Returns the total count of entries summed across every stage.
    pub(crate) fn len(&self) -> usize {
        self.poll_database.len()
            + self.submit_workflow.len()
            + self.poll_workflow.len()
            + self.project.len()
            + self.completed.len()
    }

    /// Sends completed results to `tx` until it fills or closes.
    ///
    /// When the channel is full, this method restores the popped result to the front and returns
    /// [`ControlFlow::Continue`]. Closure discards that result, leaves later results queued and
    /// returns [`ControlFlow::Break`].
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

    /// Admits a new placement request to await its first database embedding poll.
    pub(crate) fn enqueue(&mut self, entry: PendingEntry<Initial>, tries: u16) {
        self.poll_database
            .push(entry.transition(PollDatabase { tries }));
    }

    /// Consumes matching database embeddings and applies each entry's miss budget.
    ///
    /// Matches move to projection regardless of the remaining budget. Misses decrement it with
    /// saturation, and an unmatched entry at zero moves to workflow submission.
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

    /// Consumes matching workflow embeddings and applies each entry's miss budget.
    ///
    /// Matches move to projection regardless of the remaining budget. Misses decrement it with
    /// saturation, and an unmatched entry at zero completes with [`PlacementError::Exhaustion`].
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

    /// Completes every entry awaiting workflow submission with [`PlacementError::Exhaustion`].
    pub(crate) fn exhaust_submit_workflow(&mut self) {
        self.completed
            .extend(self.submit_workflow.drain(..).map(|entry| {
                entry.transition(Completed(Err(Report::new(PlacementError::Exhaustion))))
            }));
    }
}
