use core::{
    fmt::{Debug, Display},
    task::Poll,
};

use futures_core::Stream;
use pin_project::pin_project;

use crate::{Context, Report, ResultExt};

// note: called this so as to not conflict with other `StreamExt`s
/// Extension trait for [`Stream`] to provide contextual information on [`Report`]s.
///
/// [`Report`]: crate::Report
pub trait StreamReportExt: Stream + Sized {
    /// Adds a new attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Stream`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn attach<A>(self, attachment: A) -> StreamWithAttachment<Self, A>
    where
        A: Send + Sync + 'static;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Stream`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> StreamWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Stream`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable`]: crate::Report::attach_printable
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn attach_printable<A>(self, attachment: A) -> StreamWithPrintableAttachment<Self, A>
    where
        A: Display + Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`] when
    /// [`poll`]ing the [`Stream`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable`]: crate::Report::attach_printable
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> StreamWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Stream`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn change_context<C>(self, context: C) -> StreamWithContext<Self, C>
    where
        C: Context;

    /// Lazily changes the [`Context`] of the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Stream`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    /// [`poll`]: Stream::poll
    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> StreamWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<S> StreamReportExt for S
where
    S: Stream,
    S::Item: ResultExt,
{
    fn attach<A>(self, attachment: A) -> StreamWithAttachment<Self, A>
    where
        A: Send + Sync + 'static,
    {
        StreamWithAttachment {
            stream: self,
            attachment,
        }
    }

    fn attach_lazy<A, F>(self, attachment: F) -> StreamWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        StreamWithLazyAttachment {
            stream: self,
            attachment,
        }
    }

    fn attach_printable<A>(self, attachment: A) -> StreamWithPrintableAttachment<Self, A>
    where
        A: Display + Debug + Send + Sync + 'static,
    {
        StreamWithPrintableAttachment {
            stream: self,
            attachment,
        }
    }

    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> StreamWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        StreamWithLazyPrintableAttachment {
            stream: self,
            attachment,
        }
    }

    fn change_context<C>(self, context: C) -> StreamWithContext<Self, C>
    where
        C: Context,
    {
        StreamWithContext {
            stream: self,
            attachment: context,
        }
    }

    fn change_context_lazy<C, F>(self, context: F) -> StreamWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        StreamWithLazyContext {
            stream: self,
            attachment: context,
        }
    }
}

#[pin_project]
pub struct StreamWithAttachment<S, A> {
    #[pin]
    stream: S,
    attachment: A,
}

impl<S, A> Stream for StreamWithAttachment<S, A>
where
    S: Stream,
    S::Item: ResultExt,
    A: Clone + Send + Sync + 'static,
{
    type Item = S::Item;

    #[track_caller]
    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projected = self.project();
        let stream = projected.stream;

        match stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.attach(projected.attachment.clone())),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[pin_project]
pub struct StreamWithLazyAttachment<S, F> {
    #[pin]
    stream: S,
    attachment: F,
}

impl<S, A, F> Stream for StreamWithLazyAttachment<S, F>
where
    S: Stream,
    S::Item: ResultExt,
    F: Fn() -> A,
    A: Clone + Copy + Send + Sync + 'static,
{
    type Item = S::Item;

    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projection = self.project();

        match projection.stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.attach_lazy(projection.attachment)),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[pin_project]
pub struct StreamWithPrintableAttachment<S, A> {
    #[pin]
    stream: S,
    attachment: A,
}

impl<S, A> Stream for StreamWithPrintableAttachment<S, A>
where
    S: Stream,
    S::Item: ResultExt,
    A: Display + Debug + Clone + Sync + Send + 'static,
{
    type Item = S::Item;

    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projection = self.project();

        match projection.stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.attach_printable(projection.attachment.clone())),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[pin_project]
pub struct StreamWithLazyPrintableAttachment<S, A> {
    #[pin]
    stream: S,
    attachment: A,
}

impl<S, A, F> Stream for StreamWithLazyPrintableAttachment<S, F>
where
    S: Stream,
    S::Item: ResultExt,
    F: FnMut() -> A,
    A: Display + Debug + Clone + Sync + Send + 'static,
{
    type Item = S::Item;

    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projection = self.project();

        match projection.stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.attach_printable_lazy(projection.attachment)),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[pin_project]
pub struct StreamWithContext<S, A> {
    #[pin]
    stream: S,
    attachment: A,
}

impl<S, A> Stream for StreamWithContext<S, A>
where
    S: Stream,
    S::Item: ResultExt,
    A: Context + Clone,
{
    type Item = Result<<<S as Stream>::Item as ResultExt>::Ok, Report<A>>;

    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projection = self.project();

        match projection.stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.change_context(projection.attachment.clone())),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[pin_project]
pub struct StreamWithLazyContext<S, A> {
    #[pin]
    stream: S,
    attachment: A,
}

impl<S, A, F> Stream for StreamWithLazyContext<S, F>
where
    S: Stream,
    S::Item: ResultExt,
    F: FnMut() -> A,
    A: Context + Clone,
{
    type Item = Result<<S::Item as ResultExt>::Ok, Report<A>>;

    fn poll_next(
        self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        let projection = self.project();

        match projection.stream.poll_next(cx) {
            Poll::Ready(data) => Poll::Ready(match data {
                Some(data) => Some(data.change_context_lazy(projection.attachment)),
                None => None,
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod simple_functionality_tests {
    use alloc::{string::ToString, vec};

    use super::*;

    #[derive(Debug)]
    pub struct UhOhError;

    impl core::fmt::Display for UhOhError {
        fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            f.write_str("UhOhError")
        }
    }

    impl crate::Context for UhOhError {}

    #[test]
    fn can_attach_to_stream() {
        use futures::{executor::block_on, StreamExt};

        use crate::test_helper::messages;

        block_on(async {
            let items = vec![
                Ok(1),
                Ok(1),
                Ok(2),
                Ok(5),
                Ok(14),
                Ok(42),
                Ok(132),
                Ok(429),
                Ok(1430),
                Ok(4862),
                Ok(16796),
                Err(UhOhError),
            ]
            .into_iter()
            .map(crate::ext::result::IntoReport::into_report);

            let stream = futures::stream::iter(items);

            let mut stream = stream.attach("here is some context".to_string());

            while let Some(next) = stream.next().await {
                if let Err(e) = next {
                    assert_eq!(messages(&e), vec!["Opaque", "UhOhError"]);
                }
            }
        })
    }
}
