//! Process-level generation promotion and feed retirement.
//!
//! [`GenerationManager`] keeps execution ownership separate from the request handles in
//! [`UniverseRegistry`]. Opening failures preserve the last published world and delta. An ended
//! present feed retries with a fresh delta lifetime, while an ended retained feed preserves its
//! final publication until expiry or reactivation.

use alloc::sync::Arc;
use core::{
    future::{self, Future},
    pin::pin,
    task::{Context, Poll, ready},
    time::Duration,
};
use std::time::Instant;

use error_stack::Report;
use futures::FutureExt as _;
use hashql_core::collections::FastHashMap;
use tokio::time::MissedTickBehavior;

use self::{
    error::ManagerError,
    slot::{Execution, Registration, RuntimeSlot},
    source::{RuntimeSource, RuntimeSourceHandle},
};
use super::registry::{Observer, UniverseRegistry};
use crate::{file::generation::GenerationId, offload::OffloadState};

pub(crate) mod error;
mod slot;
pub(crate) mod source;
#[cfg(test)]
mod tests;

/// Current-pointer polling and optional removal of expired generations.
#[derive(Default, Copy, Clone)]
pub(crate) struct ManagerOptions {
    /// Time between maintenance passes, one second by default.
    pub poll_interval: Duration = Duration::from_secs(1),
    /// Removes expired directories after feed joining, disabled by default.
    pub unlink: bool = false,
}

/// Owned generation execution with time-bounded admission to retained publications.
///
/// Opening, joining and removal remain owned across cancellation of a borrowing [`Self::run`] or
/// [`Self::shutdown`] wait. Shutdown stops every initialized feed before waiting for any result.
/// Removing an expired directory does not wait for request-held worlds or epochs.
#[must_use = "the generation manager must run and drain its owned operations"]
pub(crate) struct GenerationManager {
    options: ManagerOptions,

    source: Arc<RuntimeSource>,
    registry: Arc<UniverseRegistry>,

    slots: FastHashMap<GenerationId, RuntimeSlot>,

    desired: Option<GenerationId>,
    present: Option<GenerationId>,
    current: Option<RuntimeSourceHandle<Option<GenerationId>>>,

    expired: Vec<GenerationId>,
    stopping: bool,
}

impl GenerationManager {
    /// Creates an empty registry and an unstarted maintenance owner.
    ///
    /// `retention` is the interval from replacement promotion to the old generation's admission
    /// expiry. Directory removal is independent of this interval's enforcement.
    ///
    /// # Errors
    ///
    /// Returns [`ManagerError::InvalidInterval`] for a zero polling interval.
    pub(crate) fn new(
        source: RuntimeSource,
        options: ManagerOptions,
        retention: Duration,
    ) -> Result<Self, Report<ManagerError>> {
        if options.poll_interval.is_zero() {
            return Err(Report::new(ManagerError::InvalidInterval));
        }

        Ok(Self {
            source: Arc::new(source),
            registry: Arc::new(UniverseRegistry::new(retention)),
            options,
            slots: FastHashMap::default(),
            desired: None,
            present: None,
            current: None,
            expired: Vec::new(),
            stopping: false,
        })
    }

    pub(crate) const fn registry(&self) -> &Arc<UniverseRegistry> {
        &self.registry
    }

    /// Maintains generations until shutdown, then drains all owned operations.
    ///
    /// A missing or unreadable current pointer preserves the present publication. Initialization
    /// failures retry at the maintenance cadence while the generation remains selected or present.
    /// Cancelling this wait retains pending results in the manager.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime with time enabled.
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "Tokio select traverses its branch set with a remainder"
    )]
    pub(crate) async fn run(&mut self, shutdown: impl Future<Output = ()>) {
        let mut shutdown = pin!(shutdown);
        let mut interval = tokio::time::interval(self.options.poll_interval);
        interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        while !self.stopping {
            tokio::select! {
                biased;
                () = &mut shutdown => break,
                _tick = interval.tick() => self.tick(Instant::now()),
            }
        }

        self.shutdown().await;
    }

    fn try_join_current(&mut self) {
        let Some(current) = &mut self.current else {
            return;
        };

        let result = match current.try_join() {
            Ok(OffloadState::Running) => return,
            Ok(OffloadState::Finished(desired)) => Ok(desired),
            Err(error) => Err(error),
        };

        self.finish_current(result);
    }

    fn poll_current(&mut self, context: &mut Context<'_>) -> Poll<()> {
        let Some(current) = &mut self.current else {
            return Poll::Ready(());
        };

        let result = ready!(current.poll_unpin(context));
        self.finish_current(result);
        Poll::Ready(())
    }

    fn finish_current(&mut self, result: Result<Option<GenerationId>, Report<ManagerError>>) {
        self.current = None;
        match result {
            Ok(desired) => self.desired = desired,
            Err(error) => tracing::warn!(?error, "failed to read current-generation pointer"),
        }
    }

    fn promote(&mut self, generation: GenerationId, now: Instant) {
        let Some(slot) = self.slots.get_mut(&generation) else {
            tracing::warn!(%generation, "tried to promote a non-existent generation");
            return;
        };

        let Some(runtime) = slot.runtime() else {
            tracing::warn!(
                %generation,
                "tried to promote a generation without a runtime"
            );

            return;
        };

        if self.registry.promote(Observer::from(runtime), now).is_err() {
            tracing::info!(
                "universe registry is closed, and is no longer accepting new observers, shutting \
                 down"
            );

            self.stopping = true;
            return;
        }

        slot.promote();
        self.present = Some(generation);
        tracing::info!(%generation, "promoted the generation runtime");
    }

    fn tick(&mut self, now: Instant) {
        self.try_join_current();

        if self.current.is_none() {
            self.current = Some(Arc::clone(&self.source).current());
            self.try_join_current();
        }

        for (&generation, slot) in &mut self.slots {
            slot.tick(generation);
        }

        self.registry.expire(now, &mut self.expired);
        for generation in self.expired.drain(..) {
            if let Some(slot) = self.slots.get_mut(&generation) {
                slot.expire();
            }
        }

        self.slots
            .retain(|_generation, slot| !matches!(slot.execution, Execution::Removed));

        if let Some(desired) = self.desired
            && (self.present != Some(desired) || self.is_ready(desired))
        {
            self.promote(desired, now);
        }

        if let Some(present) = self.present
            && self.is_ready(present)
        {
            self.promote(present, now);
        }

        if self.stopping {
            self.stop();
            return;
        }

        if let Some(desired) = self.desired {
            self.slots
                .entry(desired)
                .or_insert_with(RuntimeSlot::candidate);
        }
        self.reconcile();

        // Advance all slots, even if they're not active yet.
        for (&generation, slot) in &mut self.slots {
            slot.tick(generation);
        }
    }

    fn is_ready(&self, generation: GenerationId) -> bool {
        self.slots
            .get(&generation)
            .is_some_and(|slot| matches!(slot.execution, Execution::Ready(_)))
    }

    fn reconcile(&mut self) {
        self.slots.retain(|&generation, slot| {
            let wanted = self.desired == Some(generation) || self.present == Some(generation);

            if matches!(slot.execution, Execution::Ready(_)) {
                // Only promotion accepts an initialized candidate. Superseded openings still stop
                // and join their newly started feed.
                slot.stop();
            }

            if !slot.is_stopped() {
                return true;
            }

            if wanted {
                slot.open(Arc::clone(&self.source), generation);
                return true;
            }

            match slot.registration {
                Registration::Published => true,
                Registration::Expired if self.options.unlink => {
                    slot.remove(Arc::clone(&self.source), generation);
                    true
                }
                Registration::Candidate | Registration::Expired => false,
            }
        });
    }

    fn stop(&mut self) {
        self.stopping = true;
        self.registry.close();

        for slot in self.slots.values_mut() {
            slot.stop();
        }
    }

    /// Closes admission and joins every feed and outstanding maintenance operation.
    ///
    /// Completed openings also stop and join their feeds. Already-started removals finish, and
    /// shutdown starts no new removal or recovery. Cancelling the wait retains every pending
    /// result.
    pub(crate) async fn shutdown(&mut self) {
        self.stop();

        future::poll_fn(|context| {
            let mut complete = self.poll_current(context).is_ready();
            for (&generation, slot) in &mut self.slots {
                complete &= slot.poll_shutdown(generation, context).is_ready();
            }

            if complete {
                Poll::Ready(())
            } else {
                Poll::Pending
            }
        })
        .await;

        self.slots.clear();
    }
}

impl Drop for GenerationManager {
    fn drop(&mut self) {
        self.stop();
    }
}
