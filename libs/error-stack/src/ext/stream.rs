use core::{
    future::Future,
    mem,
    pin::Pin,
    task::{ready, Context, Poll},
};

use futures_core::{FusedFuture, FusedStream, TryStream};
use pin_project_lite::pin_project;

use crate::{Report, Result};

pin_project! {
    /// Future for the [`try_collect_reports`](TryReportStreamExt::try_collect_reports)
    /// and [`try_collect_reports_bounded`](TryReportStreamExt::try_collect_reports_bounded) methods.
    #[derive(Debug)]
    #[must_use = "futures do nothing unless you `.await` or poll them"]
    pub struct TryCollectReports<S, A, C> {
        #[pin]
        stream: S,
        output: Result<A, [C]>,

        context_len: usize,
        context_bound: usize
    }
}

impl<S, A, C> TryCollectReports<S, A, C>
where
    S: TryStream,
    A: Default + Extend<S::Ok>,
{
    fn new(stream: S, bound: Option<usize>) -> Self {
        Self {
            stream,
            output: Ok(Default::default()),
            context_len: 0,
            context_bound: bound.unwrap_or(usize::MAX),
        }
    }
}

impl<S, A, C> FusedFuture for TryCollectReports<S, A, C>
where
    S: TryStream<Error: Into<Report<[C]>>> + FusedStream,
    A: Default + Extend<S::Ok>,
{
    fn is_terminated(&self) -> bool {
        self.stream.is_terminated()
    }
}

impl<S, A, C> Future for TryCollectReports<S, A, C>
where
    S: TryStream<Error: Into<Report<[C]>>>,
    A: Default + Extend<S::Ok>,
{
    type Output = Result<A, [C]>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();

        let value = loop {
            if *this.context_len >= *this.context_bound {
                break mem::replace(this.output, Ok(A::default()));
            }

            let next = ready!(this.stream.as_mut().try_poll_next(cx));
            match (next, &mut *this.output) {
                (Some(Ok(value)), Ok(output)) => {
                    output.extend(core::iter::once(value));
                }
                (Some(Ok(_)), Err(_)) => {
                    // we're now just consuming the iterator to return all related errors
                    // so we can just ignore the output
                }
                (Some(Err(error)), output @ Ok(_)) => {
                    *output = Err(error.into());
                    *this.context_len += 1;
                }
                (Some(Err(error)), Err(report)) => {
                    report.append(error.into());
                    *this.context_len += 1;
                }
                (None, output) => {
                    break mem::replace(output, Ok(A::default()));
                }
            }
        };

        Poll::Ready(value)
    }
}

/// Trait extending [`TryStream`] with methods for collecting error-stack results in a fail-slow
/// manner.
///
/// This trait provides additional functionality to [`TryStream`]s, allowing for the collection of
/// successful items while accumulating errors. It's particularly useful when you want to continue
/// processing a stream even after encountering errors, gathering all successful results and errors
/// until the stream is exhausted or a specified error limit is reached.
///
/// The fail-slow approach means that the stream processing continues after encountering errors,
/// unlike traditional error handling that might stop at the first error.
///
/// # Performance Considerations
///
/// These methods may have performance implications as they potentially iterate
/// through the entire stream, even after encountering errors.
///
/// # Note
///
/// This trait is only available behind the `unstable` flag and is not covered by semver guarantees.
/// It may be subject to breaking changes in future releases.
///
/// [`TryStream`]: futures_core::stream::TryStream
pub trait TryReportStreamExt<C>: TryStream<Error: Into<Report<[C]>>> {
    /// Collects all successful items from the stream into a collection, accumulating all errors.
    ///
    /// This method will continue processing the stream even after encountering errors, collecting
    /// all successful items and all errors until the stream is exhausted.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::{Report, Result, TryReportStreamExt};
    /// # use futures_util::stream;
    ///
    /// #[derive(Debug, Clone, PartialEq, Eq)]
    /// pub struct UnknownError;
    ///
    /// impl core::fmt::Display for UnknownError {
    ///     fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    ///         f.write_str("UnknownError")
    ///     }
    /// }
    ///
    /// impl core::error::Error for UnknownError {}
    ///
    /// #
    /// # async fn example() {
    /// let stream = stream::iter([
    ///     Ok(1),
    ///     Err(Report::new(UnknownError)),
    ///     Ok(2),
    ///     Err(Report::new(UnknownError)),
    /// ]);
    ///
    /// let result: Result<Vec<i32>, _> = stream.try_collect_reports().await;
    /// let report = result.expect_err("should have failed twice");
    ///
    /// assert_eq!(report.current_contexts().count(), 2);
    /// # }
    /// #
    /// # tokio::runtime::Runtime::new().unwrap().block_on(example());
    /// ```
    fn try_collect_reports<A>(self) -> TryCollectReports<Self, A, C>
    where
        A: Default + Extend<Self::Ok>,
        Self: Sized,
    {
        TryCollectReports::new(self, None)
    }

    /// Collects successful items from the stream into a collection, accumulating errors up to a
    /// specified bound.
    ///
    /// This method will continue processing the stream after encountering errors, but will stop
    /// once the number of accumulated errors reaches the specified `bound`.
    ///
    /// ```
    /// # use error_stack::{Report, Result, TryReportStreamExt};
    /// # use futures_util::stream;
    ///
    /// #[derive(Debug, Clone, PartialEq, Eq)]
    /// pub struct UnknownError;
    ///
    /// impl core::fmt::Display for UnknownError {
    ///     fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    ///         f.write_str("UnknownError")
    ///     }
    /// }
    ///
    /// impl core::error::Error for UnknownError {}
    ///
    /// #
    /// # async fn example() {
    /// let stream = stream::iter([
    ///     Ok(1),
    ///     Err(Report::new(UnknownError)),
    ///     Ok(2),
    ///     Err(Report::new(UnknownError)),
    /// ]);
    ///
    /// let result: Result<Vec<i32>, _> = stream.try_collect_reports_bounded(1).await;
    /// let report = result.expect_err("should have failed twice");
    ///
    /// assert_eq!(report.current_contexts().count(), 1);
    /// # }
    /// #
    /// # tokio::runtime::Runtime::new().unwrap().block_on(example());
    /// ```
    fn try_collect_reports_bounded<A>(self, bound: usize) -> TryCollectReports<Self, A, C>
    where
        A: Default + Extend<Self::Ok>,
        Self: Sized,
    {
        TryCollectReports::new(self, Some(bound))
    }
}

impl<S, C> TryReportStreamExt<C> for S where S: TryStream<Error: Into<Report<[C]>>> {}
