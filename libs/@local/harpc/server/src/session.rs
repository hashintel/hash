use alloc::sync::Arc;
use core::{fmt::Debug, sync::atomic::AtomicUsize, time::Duration};
use std::{collections::HashSet, sync::Mutex};

use harpc_net::session::server::{SessionEvent, SessionId};
use scc::{ebr::Guard, hash_index::Entry};
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

pub struct Session<T> {
    storage: Arc<SessionStorage<T>>,

    key: SessionId,
    value: Arc<T>,
}

impl<T> Session<T>
where
    T: 'static,
{
    /// Get the value of the session.
    #[must_use]
    pub fn cloned(&self) -> T
    where
        T: Clone,
    {
        T::clone(&self.value)
    }

    #[must_use]
    pub fn get(&self) -> &T {
        &self.value
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
        let value = Arc::new(value);

        let entry = self.storage.storage.entry_async(self.key).await;

        if let Entry::Occupied(entry) = entry {
            entry.update(value);
        }
    }
}

impl<T> AsRef<T> for Session<T> {
    fn as_ref(&self) -> &T {
        &self.value
    }
}

#[derive(Debug)]
struct Marked {
    // we use an std Mutex here, because we do not use the guard across an await point, therefore
    // an std mutex is faster, smaller and more efficient.
    inner: Mutex<HashSet<SessionId>>,
    // SeqCst is not needed as we don't require total ordering across all threads.
    len: AtomicUsize,
}

impl Marked {
    fn new() -> Self {
        Self {
            inner: Mutex::new(HashSet::new()),
            len: AtomicUsize::new(0),
        }
    }

    fn is_empty(&self) -> bool {
        // Acquire ordering ensures that subsequent reads of the `inner` HashSet
        // will see all modifications made before the len was set to 0.
        self.len.load(core::sync::atomic::Ordering::Acquire) == 0
    }

    fn clear(&self) -> HashSet<SessionId> {
        let set = {
            let mut set = self.inner.lock().expect("mutex should not be poisoned");

            // clear the set (by taking it) and update the length
            core::mem::take(&mut *set)
        };

        // Release ordering ensures that all previous writes to the `inner` HashSet
        // are visible to other threads that acquire the len after this store.
        self.len.store(0, core::sync::atomic::Ordering::Release);

        set
    }

    fn remove(&self, session_id: SessionId) {
        // we don't need to lock the mutex if the set is empty
        if self.is_empty() {
            return;
        }

        let mut set = self.inner.lock().expect("mutex should not be poisoned");

        if set.remove(&session_id) {
            // Release ordering ensures that the removal from the HashSet
            // is visible to other threads that acquire the len after this fetch_sub.
            self.len.fetch_sub(1, core::sync::atomic::Ordering::Release);
        }
    }

    fn insert(&self, sessions: impl IntoIterator<Item = SessionId>) {
        let mut set = self.inner.lock().expect("mutex should not be poisoned");

        for session_id in sessions {
            if set.insert(session_id) {
                // Release ordering ensures that the insertion into the HashSet
                // is visible to other threads that acquire the len after this fetch_add.
                self.len.fetch_add(1, core::sync::atomic::Ordering::Release);
            }
        }
    }
}

#[derive_where::derive_where(Debug; T: Debug + 'static)]
pub struct SessionStorage<T> {
    storage: scc::HashIndex<SessionId, Arc<T>>,
    marked: Marked,
}

impl<T> SessionStorage<T>
where
    T: 'static,
{
    pub(crate) fn new() -> Self {
        Self {
            storage: scc::HashIndex::new(),
            marked: Marked::new(),
        }
    }
}

impl<T> SessionStorage<T>
where
    T: Default + Send + Sync + 'static,
{
    pub(crate) async fn get_or_insert(self: Arc<Self>, session_id: SessionId) -> Session<T> {
        self.marked.remove(session_id);

        // shortcut, which is completely lock-free
        if let Some(value) = self
            .storage
            .peek_with(&session_id, |_, value| Arc::clone(value))
        {
            return Session {
                storage: Arc::clone(&self),
                key: session_id,
                value,
            };
        }

        let entry = self.storage.entry_async(session_id).await.or_default();
        let value = Arc::clone(entry.get());

        Session {
            storage: Arc::clone(&self),
            key: session_id,
            value,
        }
    }
}

impl<T> SessionStorage<T>
where
    T: Send + Sync + 'static,
{
    async fn remove(&self, session_id: SessionId) {
        self.storage.remove_async(&session_id).await;
    }

    fn mark_all(&self) {
        let guard = Guard::new();

        self.marked.clear();
        let sessions = self.storage.iter(&guard).map(|(session_id, _)| *session_id);
        self.marked.insert(sessions);
    }

    async fn remove_marked(&self) {
        let marked = self.marked.clear();

        self.storage
            .retain_async(|key, _| !marked.contains(key))
            .await;
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
    T: Send + Sync + 'static,
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
