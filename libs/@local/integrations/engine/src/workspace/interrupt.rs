use alloc::sync::Arc;
use core::{
    fmt,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use std::{
    sync::{Mutex, MutexGuard, PoisonError},
    thread,
};

use duckdb::InterruptHandle;
use tokio::sync::oneshot;

/// Identifies a request to the workspace thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct RequestId(u64);

/// The request the workspace thread is running, and the handle that interrupts it.
struct Running {
    request: Option<RequestId>,
    /// Whether [`Interrupt::cancel`] interrupted `request`.
    interrupted: bool,
    /// Interrupts the statement running on the connection, until the connection closes.
    handle: Option<Arc<InterruptHandle>>,
}

/// Identifies the requests to the workspace thread, and interrupts a running request whose caller
/// stopped waiting for it.
pub(super) struct Interrupt {
    running: Mutex<Running>,
    next_request: AtomicU64,
}

impl Interrupt {
    /// How often a cancelled request is interrupted again until it finishes.
    const REPEAT: Duration = Duration::from_millis(1);

    pub(super) const fn new(handle: Arc<InterruptHandle>) -> Self {
        Self {
            running: Mutex::new(Running {
                request: None,
                interrupted: false,
                handle: Some(handle),
            }),
            next_request: AtomicU64::new(0),
        }
    }

    fn running(&self) -> MutexGuard<'_, Running> {
        self.running.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Returns an ID that no earlier request has.
    pub(super) fn next_request(&self) -> RequestId {
        // Each request needs only a distinct ID, so relaxed ordering is enough.
        RequestId(self.next_request.fetch_add(1, Ordering::Relaxed))
    }

    /// Records that the workspace thread starts `request`.
    pub(super) fn start(&self, request: RequestId) {
        let mut running = self.running();
        running.request = Some(request);
        running.interrupted = false;
    }

    /// Records that the workspace thread finished its request, and returns whether
    /// [`cancel`](Self::cancel) interrupted it.
    pub(super) fn finish(&self) -> bool {
        let mut running = self.running();
        running.request = None;
        running.interrupted
    }

    /// Interrupts `request` if the workspace thread is running it, and returns whether it did.
    fn interrupt(&self, request: RequestId) -> bool {
        let mut running = self.running();
        if running.request != Some(request) {
            return false;
        }
        let Some(handle) = &running.handle else {
            return false;
        };
        handle.interrupt();
        running.interrupted = true;
        true
    }

    /// Interrupts `request` until it finishes, if the workspace thread is running it.
    ///
    /// DuckDB clears an interrupt when a statement starts, so an interrupt that arrives between two
    /// statements of a request is lost. A thread repeats the interrupt until the request finishes.
    fn cancel(self: &Arc<Self>, request: RequestId) {
        if !self.interrupt(request) {
            return;
        }
        let interrupt = Arc::clone(self);
        let repeat = thread::Builder::new()
            .name("integrations-workspace-cancel".to_owned())
            .spawn(move || {
                while interrupt.interrupt(request) {
                    thread::sleep(Self::REPEAT);
                }
            });
        if let Err(error) = repeat {
            tracing::error!(
                ?error,
                "could not start the thread that repeats an interrupt, so it may be lost"
            );
        }
    }
}

impl fmt::Debug for Interrupt {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Interrupt")
            .field("request", &self.running().request)
            .finish_non_exhaustive()
    }
}

/// Receives the reply to a request, and cancels the request if it is dropped before the reply
/// arrives.
pub(super) struct Pending<'interrupt, T> {
    interrupt: &'interrupt Arc<Interrupt>,
    request: RequestId,
    reply: oneshot::Receiver<T>,
}

impl<'interrupt, T> Pending<'interrupt, T> {
    pub(super) const fn new(
        interrupt: &'interrupt Arc<Interrupt>,
        request: RequestId,
        reply: oneshot::Receiver<T>,
    ) -> Self {
        Self {
            interrupt,
            request,
            reply,
        }
    }

    /// Waits for the reply.
    pub(super) async fn reply(&mut self) -> Result<T, oneshot::error::RecvError> {
        (&mut self.reply).await
    }
}

impl<T> Drop for Pending<'_, T> {
    fn drop(&mut self) {
        // The workspace thread records that it starts a request before it checks whether the
        // reply is closed. Closing the reply before the cancel means the thread either sees the
        // closed reply or is interrupted.
        self.reply.close();
        self.interrupt.cancel(self.request);
    }
}

/// Holds the connection's [`Interrupt`], and stops interrupts when it is dropped.
///
/// The `duckdb` crate closes a connection before it clears the connection's interrupt handle, so
/// an interrupt that arrives while the connection closes could reach a closed connection. The
/// guard is dropped before the connection closes, and waits for an interrupt in progress.
pub(super) struct InterruptGuard(Arc<Interrupt>);

impl InterruptGuard {
    pub(super) const fn new(interrupt: Arc<Interrupt>) -> Self {
        Self(interrupt)
    }

    pub(super) const fn interrupt(&self) -> &Arc<Interrupt> {
        &self.0
    }
}

impl Drop for InterruptGuard {
    fn drop(&mut self) {
        self.0.running().handle = None;
    }
}
