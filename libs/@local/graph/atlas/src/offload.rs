//! CPU-bound work spawned onto rayon and answered on tokio.
//!
//! The async surfaces stay responsive by running their heavy computation - response assembly,
//! schedule and census construction - on rayon workers rather than runtime threads. This module
//! exists so every such hand-off shares one panic posture: [`run`] executes the closure behind
//! [`catch_unwind`](std::panic::catch_unwind) and answers through a oneshot channel, so a panic
//! reaches the caller as [`OffloadError::Panicked`] instead of aborting the process, which is
//! rayon's response to a panic no join point observes.

use alloc::borrow::Cow;
use core::{any::Any, error::Error, fmt, panic::UnwindSafe};

/// An offloaded computation that produced no value.
///
/// A route maps the failure to an internal problem, and a resolution maps it to its resolver's
/// error.
#[derive(Debug)]
pub(crate) enum OffloadError {
    /// The work panicked, and this holds the payload's text when the payload was one.
    Panicked(Option<Cow<'static, str>>),
    /// The worker vanished without answering.
    ///
    /// The channel closed with no result sent, which happens only when the pool drops the job
    /// without running it, as at process teardown.
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

/// Runs `work` on a rayon worker and returns its value, answering a panic as an error.
///
/// The future resolves when the work completes. Dropping the future first - a cancelled request,
/// an abandoned resolution - drops the computed value on the worker and nothing else happens: the
/// work itself always runs to completion once spawned, and the rejected value's drop stays inside
/// an unwind boundary, so even a panicking destructor cannot abort the pool.
///
/// # Errors
///
/// Returns [`OffloadError::Panicked`] when the work panics, with the payload's text when the
/// payload was one, and [`OffloadError::Vanished`] when the pool drops the job without running
/// it.
pub(crate) async fn run<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + UnwindSafe + 'static,
) -> Result<T, OffloadError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    rayon::spawn(move || {
        let result = std::panic::catch_unwind(work);

        // A send failure means the caller's future was dropped and nothing wants the value: the
        // rejected result drops right here on the worker. That drop runs inside its own unwind
        // boundary, because a panicking destructor would otherwise reach the pool as a panic no
        // join point observes, which aborts the process.
        //
        // AssertUnwindSafe: the panic is swallowed after the caller has gone, so nothing
        // observes the sender's or the value's state after the unwind.
        let _cancelled = std::panic::catch_unwind(core::panic::AssertUnwindSafe(|| {
            let _rejected: Result<(), _> = sender.send(result);
        }));
    });

    match receiver.await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(panic)) => Err(OffloadError::Panicked(panic_message(panic))),
        Err(_closed) => Err(OffloadError::Vanished),
    }
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
    use super::{OffloadError, run};

    /// A completed computation answers its value.
    #[tokio::test]
    async fn completed_work_answers_its_value() {
        let value = run(|| 6 * 7).await.expect("the work completes");
        assert_eq!(value, 42);
    }

    /// A panicking computation answers an error that holds the payload, and the process survives.
    ///
    /// The survival is the point: a bare `rayon::spawn` would abort the process on this panic,
    /// because the pool has no join point to observe it. The follow-up call witnesses that the
    /// pool keeps serving after the caught panic.
    #[tokio::test]
    async fn panicking_work_answers_an_error_without_aborting() {
        let error = run(|| -> u32 { panic!("the fixture panicked on purpose") })
            .await
            .expect_err("the panic answers as an error");

        let OffloadError::Panicked(Some(payload)) = error else {
            panic!("the worker ran the closure, so the failure carries the panic's text");
        };
        assert_eq!(payload, "the fixture panicked on purpose");

        let value = run(|| 7).await.expect("the pool serves after the panic");
        assert_eq!(value, 7);
    }

    /// A formatted panic payload crosses as its rendered text.
    #[tokio::test]
    async fn formatted_panic_payload_keeps_its_text() {
        let error = run(|| -> u32 { panic!("row {} is out of range", 41) })
            .await
            .expect_err("the panic answers as an error");

        let OffloadError::Panicked(Some(payload)) = error else {
            panic!("the worker ran the closure, so the failure carries the panic's text");
        };
        assert_eq!(payload, "row 41 is out of range");
    }

    /// A payload that is not text answers the panic without one.
    #[tokio::test]
    async fn textless_panic_payload_answers_none() {
        let error = run(|| -> u32 { std::panic::panic_any(41_u64) })
            .await
            .expect_err("the panic answers as an error");

        assert!(
            matches!(error, OffloadError::Panicked(None)),
            "a numeric payload has no text to extract"
        );
    }

    /// A cancelled caller whose rejected value panics on drop does not abort the pool.
    ///
    /// A failed send drops the computed value on the rayon worker, and that drop runs inside an
    /// unwind boundary. Dropped bare, the destructor's panic would reach the pool with no join
    /// point to observe it, and rayon aborts a process on such a panic. Under nextest, a
    /// regression here therefore fails this one test with its own process's SIGABRT.
    #[tokio::test]
    async fn cancelled_send_with_panicking_destructor_does_not_abort() {
        /// Signals that its drop ran, then panics inside it.
        struct PanicsOnDrop(std::sync::mpsc::Sender<()>);

        impl Drop for PanicsOnDrop {
            fn drop(&mut self) {
                let _witnessed: Result<(), _> = self.0.send(());
                panic!("the fixture destructor panicked on purpose");
            }
        }

        let (release, held) = std::sync::mpsc::channel::<()>();
        let (dropped, drop_witness) = std::sync::mpsc::channel::<()>();

        // Poll the offload once so the worker spawns, then drop it on the timeout: the receiver
        // is gone before the worker answers, because the worker waits on `held` until the
        // release below.
        let cancelled = tokio::time::timeout(
            core::time::Duration::from_millis(10),
            run(move || {
                held.recv()
                    .expect("the test releases the worker after cancelling");
                PanicsOnDrop(dropped)
            }),
        )
        .await;
        assert!(
            cancelled.is_err(),
            "the held worker cannot answer before the timeout"
        );

        release.send(()).expect("the worker waits on this release");

        // The worker computed the value, failed the send, and ran the panicking destructor.
        drop_witness
            .recv_timeout(core::time::Duration::from_secs(10))
            .expect("the rejected value's destructor runs on the worker");

        let value = run(|| 7)
            .await
            .expect("the pool serves after the contained panic");
        assert_eq!(value, 7);
    }
}
