//! Implements support for `error-stack` functionality for streams. The main trait in this module
//! is [`StreamReportExt`] (which is so named to avoid conflict with other stream-related types
//! common to the Rust `async` ecosystem).
//!
//! It may be helpful to first read the [`ResultExt`] documentation.
use core::{
    fmt::{Debug, Display},
    task::Poll,
};

use futures_core::Stream;

use crate::{Context, Report, ResultExt};

/// Extension trait for [`Stream`] to provide contextual information on [`Report`]s.
///
/// [`Report`]: crate::Report
pub trait StreamReportExt: Stream + Sized {
    /// Adds a new attachment to the [`Report`] inside the [`Result`] when
    /// calling [`Stream::poll_next`].
    ///
    /// Applies [`Report::attach`] to the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    fn attach<A>(self, attachment: A) -> StreamWithAttachment<Self, A>
    where
        A: Clone + Send + Sync + 'static;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`] calling
    /// [`Stream::poll_next`].
    ///
    /// Applies [`Report::attach_lazy`] to the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    fn attach_lazy<A, F>(self, attachment: F) -> StreamWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: Fn() -> A;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`] when
    /// calling [`Stream::poll_next`].
    ///
    /// Applies [`Report::attach_printable`] to the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable`]: crate::Report::attach_printable
    /// [`poll`]: Stream::poll
    fn attach_printable<A>(self, attachment: A) -> StreamWithPrintableAttachment<Self, A>
    where
        A: Clone + Display + Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to any [`Report`] in the [`Stream`]
    /// when calling [`Stream::poll_next`].
    ///
    /// Applies [`Report::attach_printable_lazy`] to the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_printable_lazy`]: crate::Report::attach_printable_lazy
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> StreamWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: Fn() -> A;

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when calling
    /// [`Stream::poll_next`].
    ///
    /// Applies [`Report::change_context`] to the [`Err`] variant, see its documentation
    /// for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    fn change_context<C>(self, context: C) -> StreamWithContext<Self, C>
    where
        C: Context + Clone;

    /// Lazily changes the [`Context`] of the [`Report`] inside the [`Result`] when
    /// calling [`Stream::poll_next`]
    ///
    /// Applies [`Report::change_context_lazy`] to the [`Err`] variant, see its documntation
    /// for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context_lazy`]: crate::Report::change_context_lazy
    fn change_context_lazy<C, F>(self, context: F) -> StreamWithLazyContext<Self, F>
    where
        C: Context,
        F: Fn() -> C;
}

impl<S> StreamReportExt for S
where
    S: Stream,
    S::Item: ResultExt,
{
    #[track_caller]
    fn attach<A>(self, attachment: A) -> StreamWithAttachment<Self, A>
    where
        A: Clone + Send + Sync + 'static,
    {
        StreamWithAttachment {
            stream: self,
            attachment_or_context: attachment,
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> StreamWithLazyAttachment<Self, F>
    where
        A: Send + Sync + 'static,
        F: Fn() -> A,
    {
        StreamWithLazyAttachment {
            stream: self,
            attachment_or_context: attachment,
        }
    }

    #[track_caller]
    fn attach_printable<A>(self, attachment: A) -> StreamWithPrintableAttachment<Self, A>
    where
        A: Clone + Display + Debug + Send + Sync + 'static,
    {
        StreamWithPrintableAttachment {
            stream: self,
            attachment_or_context: attachment,
        }
    }

    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> StreamWithLazyPrintableAttachment<Self, F>
    where
        A: Display + Debug + Send + Sync + 'static,
        F: Fn() -> A,
    {
        StreamWithLazyPrintableAttachment {
            stream: self,
            attachment_or_context: attachment,
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> StreamWithContext<Self, C>
    where
        C: Context + Clone,
    {
        StreamWithContext {
            stream: self,
            attachment_or_context: context,
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> StreamWithLazyContext<Self, F>
    where
        C: Context,
        F: Fn() -> C,
    {
        StreamWithLazyContext {
            stream: self,
            attachment_or_context: context,
        }
    }
}

macro_rules! impl_stream_adaptor {
    (
        $name:ident,
        $method:ident,
        $bound:ident
        $(+ $bounds:ident)*
        $(+ $lifetime:lifetime)*,
        $output:ty
    ) => {
        #[pin_project::pin_project]
        #[doc=concat!("This is the adaptor type returned by [`StreamReportExt", stringify!($method), "`]")]
        pub struct $name<S, A> {
            #[pin]
            stream: S,
            attachment_or_context: A,
        }

        impl<S, A> Stream for $name<S, A>
        where
            S: Stream,
            S::Item : ResultExt,
            A: $bound $(+ $bounds)* $(+ $lifetime)*,
        {
            type Item = $output;

            #[track_caller]
            fn poll_next(
                self: core::pin::Pin<&mut Self>,
                cx: &mut core::task::Context<'_>,
            ) -> core::task::Poll<Option<Self::Item>> {
                let projected = self.project();
                let stream = projected.stream;

                match stream.poll_next(cx) {
                    // Can't use `map` as `#[track_caller]` is unstable on closures
                    #[allow(clippy::manual_map)]
                    Poll::Ready(data) => Poll::Ready(match data {
                        Some(data) => Some(data.$method(|| projected.attachment_or_context.clone())),
                        None => None,
                    }),
                    Poll::Pending => Poll::Pending,
                }
            }
        }
    };
}

macro_rules! impl_stream_adaptor_lazy {
    (
        $name:ident,
        $method:ident,
        $bound:ident
        $(+ $bounds:ident)*
        $(+ $lifetime:lifetime)*,
        $output:ty
    ) => {
        #[pin_project::pin_project]
        pub struct $name<S, A> {
            #[pin]
            stream: S,
            attachment_or_context: A,
        }

        impl<S, A, F> Stream for $name<S, F>
        where
            S: Stream,
            S::Item : ResultExt,
            F: Fn() -> A,
            A: $bound $(+ $bounds)* $(+ $lifetime)*,
        {
            type Item = $output;

            #[track_caller]
            fn poll_next(
                self: core::pin::Pin<&mut Self>,
                cx: &mut core::task::Context<'_>,
            ) -> core::task::Poll<Option<Self::Item>> {
                let projected = self.project();
                let stream = projected.stream;

                match stream.poll_next(cx) {
                    // Can't use `map` as `#[track_caller]` is unstable on closures
                    #[allow(clippy::manual_map)]
                    Poll::Ready(data) => Poll::Ready(match data {
                        Some(data) => Some(data.$method(projected.attachment_or_context)),
                        None => None,
                    }),
                    Poll::Pending => Poll::Pending,
                }
            }
        }
    };
}

impl_stream_adaptor! {
    StreamWithAttachment,
    attach_lazy,
    Clone + Send + Sync + 'static,
    S::Item
}

impl_stream_adaptor! {
    StreamWithPrintableAttachment,
    attach_printable_lazy,
    Display + Debug + Clone + Sync + Send + 'static,
    S::Item
}

impl_stream_adaptor! {
    StreamWithContext,
    change_context_lazy,
    Context + Clone,
    Result<<<S as Stream>::Item as ResultExt>::Ok, Report<A>>
}

impl_stream_adaptor_lazy! {
    StreamWithLazyAttachment,
    attach_lazy,
    Send + Sync + 'static,
    S::Item
}

impl_stream_adaptor_lazy! {
    StreamWithLazyPrintableAttachment,
    attach_printable_lazy,
    Display + Debug + Clone + Sync + Send + 'static,
    S::Item
}

impl_stream_adaptor_lazy! {
    StreamWithLazyContext,
    change_context_lazy,
    Context,
    Result<<S::Item as ResultExt>::Ok, Report<A>>
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
        });
    }
}
