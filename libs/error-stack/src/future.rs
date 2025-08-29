#![expect(deprecated, reason = "We use `Context` to maintain compatibility")]
//! Extension for convenient usage of [`Report`]s returned by [`Future`] s.
//!
//! Extends [`Future`] with the same methods as [`ResultExt`] but calls the methods on [`poll`]ing.
//!
//! [`Report`]: crate::Report
//! [`poll`]: Future::poll

use core::{
    future::Future,
    pin::Pin,
    task::{Context as TaskContext, Poll},
};

use crate::{Attachment, Context, OpaqueAttachment, Report, ResultExt};

macro_rules! implement_future_adaptor {
    ($future:ident, $method:ident, $bound:ident $(+ $bounds:ident)* $(+ $lifetime:lifetime)*, $output:ty) => {
        #[doc = concat!("Adaptor returned by [`FutureExt::", stringify!( $method ), "`].")]
        pub struct $future<Fut, T> {
            future: Fut,
            inner: Option<T>,
        }

        impl<Fut, T> Future for $future<Fut, T>
        where
            Fut: Future,
            Fut::Output: ResultExt,
            T: $bound $(+ $bounds)* $(+ $lifetime)*
        {
            type Output = $output;

            #[track_caller]
            fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
                // SAFETY: The pointee of `inner` will not move. Note, that the value inside the
                //         `Option` will be taken, but the `Option` remains in place. Additionally,
                //         `Self` does not implement `Drop`, nor is it `#[repr(packed)]`
                //         See the `pin` module: https://doc.rust-lang.org/core/pin/index.html
                let (future, inner) = unsafe {
                    let Self { future, inner } = self.get_unchecked_mut();
                    (Pin::new_unchecked(future), inner)
                };

                // Can't use `map` as `#[track_caller]` is unstable on closures
                match future.poll(cx) {
                    Poll::Ready(value) => {
                        Poll::Ready(value.$method({
                            inner.take().expect("Cannot poll context after it resolves")
                        }))
                    }
                    Poll::Pending => Poll::Pending,
                }
            }
        }
    };
}

macro_rules! implement_lazy_future_adaptor {
    ($future:ident, $method:ident, $bound:ident $(+ $bounds:ident)* $(+ $lifetime:lifetime)*, $output:ty) => {
        #[doc = concat!("Adaptor returned by [`FutureExt::", stringify!( $method ), "`].")]
        pub struct $future<Fut, F> {
            future: Fut,
            inner: Option<F>,
        }

        impl<Fut, F, T> Future for $future<Fut, F>
        where
            Fut: Future,
            Fut::Output: ResultExt,
            F: FnOnce() -> T,
            T: $bound $(+ $bounds)* $(+ $lifetime)*
        {
            type Output = $output;

            #[track_caller]
            fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
                // SAFETY: The pointee of `inner` will not move. Note, that the value inside the
                //         `Option` will be taken, but the `Option` remains in place. Additionally,
                //         `Self` does not implement `Drop`, nor is it `#[repr(packed)]`
                //         See the `pin` module: https://doc.rust-lang.org/core/pin/index.html
                let (future, inner) = unsafe {
                    let Self { future, inner } = self.get_unchecked_mut();
                    (Pin::new_unchecked(future), inner)
                };

                // Can't use `map` as `#[track_caller]` is unstable on closures
                match future.poll(cx) {
                    Poll::Ready(value) => {
                        Poll::Ready(value.$method({
                            inner.take().expect("Cannot poll context after it resolves")
                        }))
                    }
                    Poll::Pending => Poll::Pending,
                }
            }
        }
    };
}

implement_future_adaptor!(
    FutureWithAttachment,
    attach,
    Attachment,
    Result<<Fut::Output as ResultExt>::Ok, Report<<Fut::Output as ResultExt>::Context>>
);

implement_lazy_future_adaptor!(
    FutureWithLazyAttachment,
    attach_with,
    Attachment,
    Result<<Fut::Output as ResultExt>::Ok, Report<<Fut::Output as ResultExt>::Context>>
);

implement_future_adaptor!(
    FutureWithOpaqueAttachment,
    attach_opaque,
    OpaqueAttachment,
    Result<<Fut::Output as ResultExt>::Ok, Report<<Fut::Output as ResultExt>::Context>>
);

implement_lazy_future_adaptor!(
    FutureWithLazyOpaqueAttachment,
    attach_opaque_with,
    OpaqueAttachment,
    Result<<Fut::Output as ResultExt>::Ok, Report<<Fut::Output as ResultExt>::Context>>
);

implement_future_adaptor!(
    FutureWithContext,
    change_context,
    Context,
    Result<<Fut::Output as ResultExt>::Ok, Report<T>>
);

implement_lazy_future_adaptor!(
    FutureWithLazyContext,
    change_context_lazy,
    Context,
    Result<<Fut::Output as ResultExt>::Ok, Report<T>>
);

/// Extension trait for [`Future`] to provide contextual information on [`Report`]s.
///
/// [`Report`]: crate::Report
pub trait FutureExt: Future + Sized {
    /// Adds a new printable attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    /// [`poll`]: Future::poll
    #[track_caller]
    fn attach<A>(self, attachment: A) -> FutureWithAttachment<Self, A>
    where
        A: Attachment;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`] when
    /// [`poll`]ing the [`Future`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more
    /// information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach`]: crate::Report::attach
    /// [`poll`]: Future::poll
    #[track_caller]
    fn attach_with<A, F>(self, attachment: F) -> FutureWithLazyAttachment<Self, F>
    where
        A: Attachment,
        F: FnOnce() -> A;

    #[deprecated(
        note = "Use `attach_opaque_with` instead. `attach_lazy` was renamed to \
                `attach_opaque_with` and `attach_printable_lazy` was renamed to `attach_with`",
        since = "0.6.0"
    )]
    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> FutureWithLazyOpaqueAttachment<Self, F>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A;

    /// Adds a new attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// Applies [`Report::attach_opaque`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_opaque`]: crate::Report::attach_opaque
    /// [`poll`]: Future::poll
    #[track_caller]
    fn attach_opaque<A>(self, attachment: A) -> FutureWithOpaqueAttachment<Self, A>
    where
        A: OpaqueAttachment;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// Applies [`Report::attach_opaque`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::attach_opaque`]: crate::Report::attach_opaque
    /// [`poll`]: Future::poll
    #[track_caller]
    fn attach_opaque_with<A, F>(self, attachment: F) -> FutureWithLazyOpaqueAttachment<Self, F>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A;

    #[track_caller]
    #[deprecated(
        note = "Use `attach` instead. `attach` was renamed to `attach_opaque` and \
                `attach_printable` was renamed to `attach`",
        since = "0.6.0"
    )]
    #[inline]
    fn attach_printable<A>(self, attachment: A) -> FutureWithAttachment<Self, A>
    where
        A: Attachment,
    {
        self.attach(attachment)
    }

    #[track_caller]
    #[deprecated(
        note = "Use `attach_with` instead. `attach_lazy` was renamed to `attach_opaque_with` and \
                `attach_printable_lazy` was renamed to `attach_with`",
        since = "0.6.0"
    )]
    #[inline]
    fn attach_printable_lazy<A, F>(self, attachment: F) -> FutureWithLazyAttachment<Self, F>
    where
        A: Attachment,
        F: FnOnce() -> A,
    {
        self.attach_with(attachment)
    }

    /// Changes the [`Context`] of the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    /// [`poll`]: Future::poll
    #[track_caller]
    fn change_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context;

    /// Lazily changes the [`Context`] of the [`Report`] inside the [`Result`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`Report::change_context`]: crate::Report::change_context
    /// [`poll`]: Future::poll
    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> FutureWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<Fut: Future> FutureExt for Fut
where
    Fut::Output: ResultExt,
{
    #[track_caller]
    fn attach<A>(self, attachment: A) -> FutureWithAttachment<Self, A>
    where
        A: Attachment,
    {
        FutureWithAttachment {
            future: self,
            inner: Some(attachment),
        }
    }

    #[track_caller]
    fn attach_with<A, F>(self, attachment: F) -> FutureWithLazyAttachment<Self, F>
    where
        A: Attachment,
        F: FnOnce() -> A,
    {
        FutureWithLazyAttachment {
            future: self,
            inner: Some(attachment),
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> FutureWithLazyOpaqueAttachment<Self, F>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A,
    {
        FutureWithLazyOpaqueAttachment {
            future: self,
            inner: Some(attachment),
        }
    }

    fn attach_opaque<A>(self, attachment: A) -> FutureWithOpaqueAttachment<Self, A>
    where
        A: OpaqueAttachment,
    {
        FutureWithOpaqueAttachment {
            future: self,
            inner: Some(attachment),
        }
    }

    #[track_caller]
    fn attach_opaque_with<A, F>(self, attachment: F) -> FutureWithLazyOpaqueAttachment<Self, F>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A,
    {
        FutureWithLazyOpaqueAttachment {
            future: self,
            inner: Some(attachment),
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context,
    {
        FutureWithContext {
            future: self,
            inner: Some(context),
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> FutureWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        FutureWithLazyContext {
            future: self,
            inner: Some(context),
        }
    }
}
