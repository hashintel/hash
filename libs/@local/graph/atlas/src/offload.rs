//! CPU-bound work on Rayon workers with asynchronous result handles.
//!
//! Offloading keeps response assembly and cache construction off Tokio runtime threads. [`run`]
//! reports unwinding computation panics through [`OffloadError::Panicked`]. Panic containment has
//! [`catch_unwind`](std::panic::catch_unwind)'s limits, including the possibility that dropping a
//! panic payload causes another panic.

use alloc::borrow::Cow;
use core::{any::Any, error::Error, fmt, panic::UnwindSafe, pin, task, task::ready};

use futures::FutureExt as _;

/// An offloaded computation that produced no value.
#[derive(Debug)]
pub(crate) enum OffloadError {
    /// The work panicked, and this holds the payload's text when the payload was one.
    Panicked(Option<Cow<'static, str>>),
    /// The result channel closed with no remaining value.
    Vanished,
}

impl fmt::Display for OffloadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Panicked(Some(payload)) => write!(fmt, "the offloaded work panicked: {payload}"),
            Self::Panicked(None) => fmt.write_str("the offloaded work panicked"),
            Self::Vanished => fmt.write_str("the offload worker vanished without answering"),
        }
    }
}

impl Error for OffloadError {}

pub(crate) enum OffloadState<T> {
    Finished(T),
    Running,
}

pub(crate) struct OffloadHandle<T> {
    receiver: tokio::sync::oneshot::Receiver<Result<T, Box<dyn Any + Send>>>,
}

impl<T> OffloadHandle<T> {
    pub(crate) fn try_join(&mut self) -> Result<OffloadState<T>, OffloadError> {
        match self.receiver.try_recv() {
            Ok(Ok(value)) => Ok(OffloadState::Finished(value)),
            Ok(Err(panic)) => Err(OffloadError::Panicked(panic_message(panic))),
            Err(tokio::sync::oneshot::error::TryRecvError::Closed) => Err(OffloadError::Vanished),
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => Ok(OffloadState::Running),
        }
    }
}

impl<T> Future for OffloadHandle<T> {
    type Output = Result<T, OffloadError>;

    fn poll(mut self: pin::Pin<&mut Self>, cx: &mut task::Context<'_>) -> task::Poll<Self::Output> {
        let value = ready!(self.receiver.poll_unpin(cx));

        let value = match value {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(panic)) => Err(OffloadError::Panicked(panic_message(panic))),
            Err(_closed) => Err(OffloadError::Vanished),
        };

        task::Poll::Ready(value)
    }
}

/// Starts `work` on a rayon worker and returns a handle to its result.
///
/// The worker enters the scheduling thread's current tracing span for computation and cleanup
/// of a rejected result.
///
/// Dropping the handle does not cancel the job. If sending the result fails, the worker drops
/// the rejected result inside a second [`catch_unwind`](std::panic::catch_unwind). Both unwind
/// boundaries have `catch_unwind`'s panic-handling limits.
///
/// # Errors
///
/// Joining the handle returns [`OffloadError`] for a caught computation panic or a closed result
/// channel with no remaining value.
pub(crate) fn run<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + UnwindSafe + 'static,
) -> OffloadHandle<T> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let span = tracing::Span::current();

    rayon::spawn(move || {
        let _entered = span.enter();
        let result = std::panic::catch_unwind(work);

        // A rejected result can panic during drop after the computation's unwind boundary has
        // ended.
        //
        // AssertUnwindSafe: the closure consumes the sender and result.
        let _cancelled = std::panic::catch_unwind(core::panic::AssertUnwindSafe(|| {
            let _rejected: Result<(), _> = sender.send(result);
        }));
    });

    OffloadHandle { receiver }
}

/// Extracts a panic payload's text.
///
/// A `panic!` with a message carries `&'static str` or `String`. Any other payload type has no
/// text to extract and answers [`None`].
fn panic_message(panic: Box<dyn Any + Send>) -> Option<Cow<'static, str>> {
    match panic.downcast_ref::<&'static str>() {
        Some(&message) => Some(Cow::Borrowed(message)),
        None => panic
            .downcast::<String>()
            .map_or(None, |message| Some(Cow::Owned(*message))),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::{any::Any, slice, time::Duration};
    use std::sync::mpsc;

    use tokio::sync::oneshot;
    use tracing::{Dispatch, Event, Subscriber, span::Id};
    use tracing_subscriber::{
        Layer, Registry,
        layer::{Context, SubscriberExt as _},
        registry::LookupSpan,
    };

    use super::{OffloadError, OffloadHandle, run};

    struct Scopes(mpsc::Sender<Vec<Id>>);

    impl<S: Subscriber + for<'lookup> LookupSpan<'lookup>> Layer<S> for Scopes {
        fn on_event(&self, event: &Event<'_>, context: Context<'_, S>) {
            let scope = context.event_scope(event).map_or_else(Vec::new, |scope| {
                scope.from_root().map(|span| span.id()).collect()
            });
            self.0
                .send(scope)
                .expect("should retain the event receiver");
        }
    }

    struct DropEvent;

    impl Drop for DropEvent {
        fn drop(&mut self) {
            tracing::info!("drop the cancelled result");
        }
    }

    /// Work and rejected-result cleanup retain the scheduling span until the worker returns.
    #[test]
    fn work_tracing_context() {
        let (events, received) = mpsc::channel();
        let dispatch = Dispatch::new(Registry::default().with(Scopes(events)));
        let worker_dispatch = dispatch.clone();
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(1)
            .spawn_handler(move |thread| {
                let dispatch = worker_dispatch.clone();
                std::thread::spawn(move || {
                    tracing::dispatcher::with_default(&dispatch, || thread.run());
                });
                Ok(())
            })
            .build()
            .expect("should build the worker with the test subscriber");

        let next_scope = || {
            received
                .recv_timeout(Duration::from_secs(10))
                .expect("should record the worker event")
        };
        tracing::dispatcher::with_default(&dispatch, || {
            let requests = [
                tracing::info_span!("request"),
                tracing::info_span!("request"),
            ];
            for request in &requests {
                let id = request.id().expect("should enable the request span");
                let handle = pool.install(|| {
                    request.in_scope(|| {
                        run(|| {
                            tracing::info!("complete the work");
                            42
                        })
                    })
                });
                assert_eq!(
                    futures::executor::block_on(handle).expect("should complete"),
                    42
                );
                assert_eq!(next_scope(), [id]);
            }

            let request = tracing::info_span!("request");
            let id = request.id().expect("should enable the request span");
            let (release, held) = mpsc::channel();
            let handle = pool.install(|| {
                request.in_scope(|| {
                    run(move || {
                        held.recv().expect("should release the cancelled work");
                        DropEvent
                    })
                })
            });
            drop(handle);
            release.send(()).expect("should retain the worker receiver");
            assert_eq!(next_scope().as_slice(), slice::from_ref(&id));

            let handle = pool.install(|| {
                request.in_scope(|| {
                    run(|| {
                        tracing::info!("panic during work");
                        panic!("the fixture panicked on purpose");
                    })
                })
            });
            core::assert_matches!(
                futures::executor::block_on(handle),
                Err(OffloadError::Panicked(Some(_)))
            );
            assert_eq!(next_scope(), [id]);

            pool.install(|| tracing::info!("run unrelated work"));
            assert_eq!(next_scope(), []);
            let handle = pool.install(|| run(|| tracing::info!("run work without a span")));
            futures::executor::block_on(handle).expect("should complete work without a span");
            assert_eq!(next_scope(), []);
        });
    }

    pub(crate) fn from_receiver<T>(
        receiver: oneshot::Receiver<Result<T, Box<dyn Any + Send>>>,
    ) -> OffloadHandle<T> {
        OffloadHandle { receiver }
    }

    /// A completed computation answers its value.
    #[tokio::test]
    async fn work_completed() {
        let value = run(|| 6 * 7).await.expect("the work completes");
        assert_eq!(value, 42);
    }

    /// A string panic returns its message through the handle.
    #[tokio::test]
    async fn work_panic() {
        let error = run(|| -> u32 { panic!("the fixture panicked on purpose") })
            .await
            .expect_err("the panic answers as an error");

        let OffloadError::Panicked(Some(payload)) = error else {
            panic!("should receive a text panic payload");
        };
        assert_eq!(payload, "the fixture panicked on purpose");

        let value = run(|| 7).await.expect("the pool serves after the panic");
        assert_eq!(value, 7);
    }

    /// A formatted panic payload crosses as its rendered text.
    #[tokio::test]
    async fn panic_formatted() {
        let error = run(|| -> u32 { panic!("row {} is out of range", 41) })
            .await
            .expect_err("the panic answers as an error");

        let OffloadError::Panicked(Some(payload)) = error else {
            panic!("should receive a text panic payload");
        };
        assert_eq!(payload, "row 41 is out of range");
    }

    /// A payload that is not text answers the panic without one.
    #[tokio::test]
    async fn panic_nontext() {
        let error = run(|| -> u32 { std::panic::panic_any(41_u64) })
            .await
            .expect_err("the panic answers as an error");

        core::assert_matches!(
            error,
            OffloadError::Panicked(None),
            "a numeric payload has no text to extract"
        );
    }

    /// The worker catches a string panic from a rejected value's destructor.
    #[tokio::test]
    async fn cancelled_send_panicking_destructor() {
        struct PanicsOnDrop(std::sync::mpsc::Sender<()>);

        impl Drop for PanicsOnDrop {
            fn drop(&mut self) {
                let _witnessed: Result<(), _> = self.0.send(());
                panic!("the fixture destructor panicked on purpose");
            }
        }

        // A single worker orders the follow-up job after the destructor's unwind.
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(1)
            .build()
            .expect("a single-worker pool builds");

        let (release, held) = std::sync::mpsc::channel::<()>();
        let (dropped, drop_witness) = std::sync::mpsc::channel::<()>();

        let cancelled = pool.install(|| {
            run(move || {
                held.recv()
                    .expect("the test releases the worker after cancelling");
                PanicsOnDrop(dropped)
            })
        });
        drop(cancelled);

        release.send(()).expect("the worker waits on this release");

        drop_witness
            .recv_timeout(core::time::Duration::from_secs(10))
            .expect("the rejected value's destructor runs on the worker");

        let value = pool
            .install(|| run(|| 7))
            .await
            .expect("the pool serves after the contained panic");
        assert_eq!(value, 7);
    }
}
