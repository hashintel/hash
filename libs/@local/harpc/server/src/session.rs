use core::time::Duration;
use std::sync::Arc;

use harpc_net::session::server::{SessionEvent, SessionId};
use scc::{HashSet, ebr::Guard, hash_index::OccupiedEntry};
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

pub struct Session<'a, T> {
    entry: OccupiedEntry<'a, SessionId, T>,
}

impl<T> Session<'_, T>
where
    T: Clone + 'static,
{
    pub fn get(&self) -> &T {
        self.entry.get()
    }

    /// Update the entry.
    ///
    /// This update won't be reflected in existing instances of the session, only in future ones, to
    /// persist the change in existing instances, you must use other methods of interior
    /// mutability, such as, but not limited to, `RwLock`.
    pub fn update(self, value: T) {
        self.entry.update(value);
    }
}

pub struct SessionStorage<T> {
    storage: scc::HashIndex<SessionId, T>,
    marked: HashSet<SessionId>,
}

impl<T> SessionStorage<T>
where
    T: Default + Clone + 'static,
{
    async fn get_or_insert(&self, session_id: SessionId) -> Session<T> {
        self.marked.remove_async(&session_id).await;
        let entry = self.storage.entry_async(session_id).await.or_default();

        Session { entry }
    }
}

impl<T> SessionStorage<T>
where
    T: Clone + 'static,
{
    async fn remove(&self, session_id: SessionId) {
        self.storage.remove_async(&session_id).await;
    }

    fn keys(&self) -> Vec<SessionId> {
        let guard = Guard::new();

        self.storage.iter(&guard).map(|(k, _)| *k).collect()
    }

    // important: we're using the sync API for HashSet here on purpose, because `retain_async` needs
    // a sync predicate
    fn mark_all(&self) {
        let guard = Guard::new();

        self.marked.clear();
        for (session_id, _) in self.storage.iter(&guard) {
            let _ = self.marked.insert(*session_id);
        }
    }

    async fn remove_marked(&self) {
        self.storage
            .retain_async(|key, _| !self.marked.contains(key))
            .await;

        self.marked.clear();
    }

    fn has_marked(&self) -> bool {
        !self.marked.is_empty()
    }
}

pub struct SessionStorageTask<T> {
    storage: Arc<SessionStorage<T>>,
    receiver: broadcast::Receiver<SessionEvent>,

    sweep_interval: Duration,
}

impl<T> SessionStorageTask<T> {
    pub fn new(
        storage: Arc<SessionStorage<T>>,
        receiver: broadcast::Receiver<SessionEvent>,
        sweep_interval: Duration,
    ) -> Self {
        Self {
            storage,
            receiver,

            sweep_interval,
        }
    }
}

impl<T> SessionStorageTask<T>
where
    T: Clone + 'static,
{
    pub async fn run(mut self, cancel: CancellationToken) {
        loop {
            let event = tokio::select! {
                () = cancel.cancelled() => break,
                event = self.receiver.recv() => event,
                _ = tokio::time::sleep(self.sweep_interval), if self.storage.has_marked() => {
                    self.storage.remove_marked().await;
                    continue;
                }
            };

            match event {
                Ok(SessionEvent::SessionDropped { id }) => {
                    self.storage.remove(id);
                }
                Err(broadcast::error::RecvError::Closed) => {
                    tracing::warn!("Session event channel closed, stopping session storage task");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    tracing::warn!(
                        "Session event channel lagged, marking existing sessions as potentially \
                         removed"
                    );

                    self.storage.mark_all();
                }
            }
        }
    }
}
