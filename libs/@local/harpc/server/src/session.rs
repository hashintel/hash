use alloc::sync::Arc;
use core::time::Duration;

use harpc_net::session::server::{SessionEvent, SessionId};
use scc::{HashSet, ebr::Guard, hash_index::Entry};
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

pub struct Session<T> {
    storage: Arc<SessionStorage<T>>,
    key: SessionId,
}

impl<T> Session<T>
where
    T: Clone + 'static,
{
    /// Get the value of the session.
    ///
    /// Returns `None` if the session has been removed.
    #[must_use]
    pub fn cloned(&self) -> Option<T> {
        self.storage
            .storage
            .peek_with(&self.key, |_, value| value.clone())
    }

    /// Get the value of the session or the default value.
    #[must_use]
    pub fn cloned_or_default(&self) -> T
    where
        T: Default,
    {
        self.cloned().unwrap_or_default()
    }

    pub fn with<U>(&self, closure: impl FnOnce(&T) -> U) -> Option<U>
    where
        U: Clone,
    {
        self.storage
            .storage
            .peek_with(&self.key, |_, value| closure(value))
    }

    /// Update the entry.
    ///
    /// This is a no-op if the session has been removed.
    ///
    /// Other instances of the session may see the updated value after a delay and the value needs
    /// to be re-acquired.
    pub async fn update(&self, value: T)
    where
        T: Send + Sync,
    {
        let entry = self.storage.storage.entry_async(self.key).await;

        if let Entry::Occupied(entry) = entry {
            entry.update(value);
        }
    }
}

pub struct SessionStorage<T> {
    storage: scc::HashIndex<SessionId, T>,
    marked: HashSet<SessionId>,
}

impl<T> SessionStorage<T>
where
    T: Default + Clone + Send + Sync + 'static,
{
    pub(crate) async fn get_or_insert(self: Arc<Self>, session_id: SessionId) -> Session<T> {
        self.marked.remove_async(&session_id).await;
        // ensure the entry exists
        self.storage.entry_async(session_id).await.or_default();

        Session {
            storage: Arc::clone(&self),
            key: session_id,
        }
    }
}

impl<T> SessionStorage<T>
where
    T: Clone + Send + Sync + 'static,
{
    async fn remove(&self, session_id: SessionId) {
        self.storage.remove_async(&session_id).await;
    }

    // important: we're using the sync API for HashSet here on purpose, because `retain_async` needs
    // a sync predicate
    fn mark_all(&self) {
        let guard = Guard::new();

        self.marked.clear();
        for (session_id, _) in self.storage.iter(&guard) {
            let _: Result<(), SessionId> = self.marked.insert(*session_id);
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
    pub const fn new(
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
    T: Clone + Send + Sync + 'static,
{
    pub async fn run(mut self, cancel: CancellationToken) {
        loop {
            #[expect(
                clippy::integer_division_remainder_used,
                reason = "tokio macro uses remainder internally"
            )]
            let event = tokio::select! {
                () = cancel.cancelled() => break,
                event = self.receiver.recv() => event,
                () = tokio::time::sleep(self.sweep_interval), if self.storage.has_marked() => {
                    self.storage.remove_marked().await;
                    continue;
                }
            };

            match event {
                Ok(SessionEvent::SessionDropped { id }) => {
                    self.storage.remove(id).await;
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
