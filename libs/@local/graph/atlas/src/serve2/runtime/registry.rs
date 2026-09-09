//! Coherent generation selection at request admission.
//!
//! [`UniverseRegistry`] selects the active and requested generations under one read lock.
//! Observed [`World`] and [`Epoch`] values retain their publications independently of subsequent
//! promotion or retirement.

use alloc::sync::Arc;
use core::{error::Error, fmt, time::Duration};
use std::{sync::nonpoison::RwLock, time::Instant};

use hashql_core::collections::FastHashMap;

use super::Runtime;
use crate::{
    file::generation::GenerationId,
    serve2::{
        delta::{DeltaReader, epoch::Epoch},
        world::World,
    },
};

#[cfg(test)]
mod tests;

/// A world paired with its captured delta publication.
pub(crate) struct Universe {
    world: Arc<World>,
    epoch: Epoch,
}

impl Universe {
    pub(crate) const fn world(&self) -> &Arc<World> {
        &self.world
    }

    pub(crate) const fn epoch(&self) -> &Epoch {
        &self.epoch
    }

    fn fork(&self) -> Self {
        Self {
            world: Arc::clone(&self.world),
            epoch: self.epoch.fork(),
        }
    }
}

/// The active and selected [`Universe`]s for one request.
///
/// Matching generations share one observed [`Epoch`]. An observation remains valid after
/// promotion, expiry or registry closure.
pub(crate) struct Observation {
    admitted_at: Instant,

    present: Universe,
    requested: Universe,
}

impl Observation {
    pub(crate) const fn admitted_at(&self) -> Instant {
        self.admitted_at
    }

    pub(crate) const fn present(&self) -> &Universe {
        &self.present
    }

    pub(crate) const fn requested(&self) -> &Universe {
        &self.requested
    }
}

/// A generation selection that cannot admit a new request.
#[derive(Debug)]
pub(crate) enum ObserveError {
    /// The process has closed request admission.
    Closed,
    /// The process has not opened an active generation.
    Empty,
    /// The requested generation is absent or its retention interval has expired.
    Unavailable(GenerationId),
}

impl fmt::Display for ObserveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Closed => fmt.write_str("generation admission has closed"),
            Self::Empty => fmt.write_str("no active generation is available"),
            Self::Unavailable(generation) => write!(fmt, "generation {generation} is unavailable"),
        }
    }
}

impl Error for ObserveError {}

/// The read handles of one opened [`Runtime`].
pub(super) struct Observer {
    world: Arc<World>,
    delta: DeltaReader,
}

impl Observer {
    fn id(&self) -> GenerationId {
        self.world.generation().id()
    }

    fn observe(&self) -> Universe {
        Universe {
            world: Arc::clone(&self.world),
            epoch: self.delta.load(),
        }
    }
}

impl From<&Runtime> for Observer {
    fn from(runtime: &Runtime) -> Self {
        Self {
            world: Arc::clone(runtime.world()),
            delta: runtime.reader().clone(),
        }
    }
}

struct RetiredObserver {
    observer: Observer,

    retired_at: Instant,
}

impl RetiredObserver {
    fn is_expired(&self, now: Instant, hard: Duration) -> bool {
        now.saturating_duration_since(self.retired_at) >= hard
    }
}

#[derive(Default)]
struct Observatory {
    active: Option<Observer>,
    retained: FastHashMap<GenerationId, RetiredObserver>,
}

/// Read-side generation selection with time-bounded access to retired generations.
///
/// The retention interval starts at promotion of a replacement. Request admission checks that
/// interval independently of background cleanup.
pub(crate) struct UniverseRegistry {
    state: RwLock<Option<Observatory>>,
    hard: Duration,
}

impl UniverseRegistry {
    pub(super) fn new(hard: Duration) -> Self {
        Self {
            state: RwLock::new(Some(Observatory::default())),
            hard,
        }
    }

    /// Observes the active generation and the requested generation together.
    ///
    /// `None` selects the active generation. Admission time precedes the registry read and remains
    /// the observation's timestamp even when request work finishes after promotion.
    ///
    /// # Errors
    ///
    /// Returns [`ObserveError`] for closed admission or an unavailable generation.
    pub(crate) fn observe(
        &self,
        requested: Option<GenerationId>,
    ) -> Result<Observation, ObserveError> {
        let admitted_at = Instant::now();
        self.observe_at(requested, admitted_at)
    }

    fn observe_at(
        &self,
        requested: Option<GenerationId>,
        admitted_at: Instant,
    ) -> Result<Observation, ObserveError> {
        let state = self.state.read();
        let Some(registry) = &*state else {
            return Err(ObserveError::Closed);
        };

        let active = registry.active.as_ref().ok_or(ObserveError::Empty)?;
        let requested = requested.unwrap_or_else(|| active.id());

        let active_universe = active.observe();
        let selected = if requested == active.id() {
            active_universe.fork()
        } else {
            let retained = registry
                .retained
                .get(&requested)
                .filter(|retained| !retained.is_expired(admitted_at, self.hard))
                .ok_or(ObserveError::Unavailable(requested))?;

            retained.observer.observe()
        };
        drop(state);

        Ok(Observation {
            admitted_at,
            present: active_universe,
            requested: selected,
        })
    }

    /// Publishes an opened runtime's observer and starts the previous generation's retention.
    ///
    /// Replacing the active generation's delta lifetime invalidates its previous observer for new
    /// observations without retaining that observer under the same generation ID.
    ///
    /// # Errors
    ///
    /// Returns the supplied observer unchanged when admission has closed.
    pub(super) fn promote(&self, observer: Observer, now: Instant) -> Result<(), Observer> {
        let mut state = self.state.write();
        let Some(registry) = &mut *state else {
            return Err(observer);
        };

        let id = observer.id();
        registry.retained.remove(&id);

        if let Some(previous) = registry.active.replace(observer)
            && previous.id() != id
        {
            registry.retained.insert(
                previous.id(),
                RetiredObserver {
                    observer: previous,
                    retired_at: now,
                },
            );
        }

        drop(state);
        Ok(())
    }

    /// Removes expired observers and appends their generation IDs to `expired`.
    pub(super) fn expire(&self, now: Instant, expired: &mut Vec<GenerationId>) {
        let mut state = self.state.write();
        let Some(registry) = &mut *state else {
            return;
        };

        expired.extend(
            registry
                .retained
                .extract_if(|_id, retained| retained.is_expired(now, self.hard))
                .map(|(id, _retained)| id),
        );
        drop(state);
    }

    /// Closes admission while preserving already-observed publications.
    pub(super) fn close(&self) {
        *self.state.write() = None;
    }
}
