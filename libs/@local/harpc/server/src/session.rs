use alloc::sync::Arc;
use core::{fmt::Debug, sync::atomic::AtomicUsize, time::Duration};
use std::{collections::HashSet, sync::Mutex};

use futures::{Stream, StreamExt as _};
pub use harpc_net::session::server::{SessionEvent, SessionEventError, SessionId};
use harpc_types::{procedure::ProcedureDescriptor, subsystem::SubsystemDescriptor};
use scc::{ebr::Guard, hash_index::Entry};
use tokio::pin;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestInfo {
    pub subsystem: SubsystemDescriptor,
    pub procedure: ProcedureDescriptor,
}

#[derive(derive_more::Debug)]
pub struct Session<T> {
    #[debug(skip)]
    storage: Arc<SessionStorage<T>>,

    key: SessionId,
    value: Arc<T>,

    request_info: RequestInfo,
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

    /// Try to re-acquire the session value.
    ///
    /// Returns `true` if the session was re-acquired, `false` if the session was removed.
    pub fn refresh(&mut self) -> bool {
        let value = self
            .storage
            .storage
            .peek_with(&self.key, |_, value| Arc::clone(value));

        if let Some(value) = value {
            self.value = value;
            true
        } else {
            false
        }
    }

    /// Request information associated with the current request.
    #[must_use]
    pub const fn request_info(&self) -> RequestInfo {
        self.request_info
    }
}

impl<T> AsRef<T> for Session<T> {
    fn as_ref(&self) -> &T {
        &self.value
    }
}

#[derive(Debug)]
struct Marked {
    // We use an std mutex here, because we do not use the guard across an await point, therefore
    // an std mutex is faster, smaller and more efficient.
    inner: Mutex<HashSet<SessionId>>,
    // `SeqCst` is not needed as we don't require total ordering across all threads.
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

/// A storage for session values.
///
/// This keeps track of the session values for different sessions of a specific connection.
///
/// A typical session can involve values such as the authorization state of the user, the user's
/// permissions, and other user-specific data.
///
/// Because the underlying storage is epoch garbage-collected (to allow for `&self` references to
/// the session values), the session values are stored as `Arc<T>`.
/// Values could be stored as `T` instead, but that would mean that a service could potentially
/// simply lose access to the value if it is removed from the storage during a call, severely
/// impacting ergonomics.
/// The underlying storage is lock-free for any read operations.
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

impl<T> SessionStorage<T> {
    pub(crate) fn task<S>(self: Arc<Self>, stream: S) -> Task<T, S> {
        Task::new(self, stream)
    }
}

impl<T> SessionStorage<T>
where
    T: Default + Send + Sync + 'static,
{
    pub(crate) async fn get_or_insert(
        self: Arc<Self>,
        session_id: SessionId,
        request_info: RequestInfo,
    ) -> Session<T> {
        self.marked.remove(session_id);

        // Shortcut, which is completely lock-free
        if let Some(value) = self
            .storage
            .peek_with(&session_id, |_, value| Arc::clone(value))
        {
            return Session {
                storage: Arc::clone(&self),
                key: session_id,
                value,
                request_info,
            };
        }

        let value = {
            let entry = self.storage.entry_async(session_id).await.or_default();

            Arc::clone(entry.get())
        };

        Session {
            storage: Arc::clone(&self),
            key: session_id,
            value,
            request_info,
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

/// Task to cleanup expired sessions.
///
/// `harpc-net` has a broadcast channel on which is notifies any receivers about sessions going
/// offline, this is used to cleanup the session storage, otherwise we would have essentially a
/// memory leak, as new sessions would be created, but old sessions wouldn't be removed.
///
/// A receiver can lag behind, in that case we have a fallback, in which we mark any session as
/// "potentially stale" (a flag that is removed once the session is accessed again). Once a certain
/// about of inactivity has passed (the `sweep_interval`) any session that hasn't been accessed is
/// removed.
pub struct Task<T, S> {
    storage: Arc<SessionStorage<T>>,
    stream: S,

    cancel: CancellationToken,
    sweep_interval: Duration,
}

impl<T, S> Task<T, S> {
    fn new(storage: Arc<SessionStorage<T>>, stream: S) -> Self {
        Self {
            storage,
            stream,
            // Default values
            cancel: CancellationToken::new(),
            sweep_interval: Duration::from_mins(1),
        }
    }

    /// Sets the sweep interval for the task.
    #[must_use]
    pub const fn with_sweep_interval(mut self, sweep_interval: Duration) -> Self {
        self.sweep_interval = sweep_interval;
        self
    }

    /// Sets the cancellation token for the task.
    #[must_use]
    pub fn with_cancellation_token(mut self, cancel: CancellationToken) -> Self {
        self.cancel = cancel;
        self
    }
}

impl<T, S, E> IntoFuture for Task<T, S>
where
    T: Send + Sync + 'static,
    S: Stream<Item = Result<SessionEvent, E>> + Send,
    E: Into<SessionEventError> + Send,
{
    type Output = ();

    type IntoFuture = impl Future<Output = ()> + Send;

    fn into_future(self) -> Self::IntoFuture {
        self.run()
    }
}

impl<T, S, E> Task<T, S>
where
    T: Send + Sync + 'static,
    S: Stream<Item = Result<SessionEvent, E>> + Send,
    E: Into<SessionEventError> + Send,
{
    async fn run(self) {
        pin!(let stream = self.stream;);

        loop {
            #[expect(
                clippy::integer_division_remainder_used,
                reason = "tokio macro uses remainder internally"
            )]
            let event = tokio::select! {
                () = self.cancel.cancelled() => break,
                event = stream.next() => event,
                () = tokio::time::sleep(self.sweep_interval), if self.storage.has_marked() => {
                    self.storage.remove_marked().await;
                    continue;
                }
            };

            let event = event.map(|event| event.map_err(Into::into));

            match event {
                None => {
                    tracing::info!("Session event stream ended, stopping session storage task");
                    break;
                }
                Some(Ok(SessionEvent::SessionDropped { id })) => {
                    self.storage.remove(id).await;
                }
                Some(Err(SessionEventError::Lagged { .. })) => {
                    tracing::warn!(
                        "Session event stream lagged, marking existing sessions as potentially \
                         removed"
                    );

                    self.storage.mark_all();
                }
            }
        }
    }
}
