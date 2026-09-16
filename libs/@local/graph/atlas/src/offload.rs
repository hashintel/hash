//! CPU-bound tasks with asynchronous result collection.
//!
//! [`run`] submits a closure to Rayon, keeping its computation off the async executor. Await the
//! returned [`OffloadHandle`] for its result, or use [`OffloadHandle::try_join`] to check for
//! completion without waiting.

use alloc::borrow::Cow;
use core::{any::Any, error::Error, fmt, panic::UnwindSafe};

/// An offloaded computation that produced no value.
///
/// A route maps the failure to an internal problem, and a resolution maps it to its resolver's
/// error.
#[derive(Debug)]
pub(crate) enum OffloadError {
    /// The computation panicked, with a message for string panic payloads.
    Panicked(Option<Cow<'static, str>>),
    /// The worker closed the channel without a result, or the handle already returned it.
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
/// Submission starts the job independently of polling the returned handle. The worker enters the
/// current tracing span for both the computation and cleanup of an undeliverable result.
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

        // A rejected result can panic during drop after the computation's unwind boundary has
        // ended.
        //
        // AssertUnwindSafe: the closure consumes the sender and result.
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

/// Extracts a string panic message and discards other payloads.
///
/// Returns the text of an `&'static str` or [`String`] payload, or [`None`] for any other type.
///
/// # Panics
///
/// Panics if a non-string payload's destructor panics.
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

    #[tokio::test]
    async fn completed_work_answers_its_value() {
        let value = run(|| 6 * 7).await.expect("the work completes");
        assert_eq!(value, 42);
    }

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

    /// The worker catches a string panic from a rejected value's destructor.
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

        drop_witness
            .recv_timeout(core::time::Duration::from_secs(10))
            .expect("the rejected value's destructor runs on the worker");

        let value = run(|| 7)
            .await
            .expect("the pool serves after the contained panic");
        assert_eq!(value, 7);
    }
}
