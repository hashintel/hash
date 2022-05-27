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

use pin_project::pin_project;

use crate::{Context, Message, Result, ResultExt};

/// Adaptor returned by [`FutureExt::wrap_err`].
#[pin_project]
#[cfg(feature = "futures")]
pub struct FutureWithErr<Fut, M> {
    #[pin]
    inner: Fut,
    message: Option<M>,
}

impl<Fut, M> Future for FutureWithErr<Fut, M>
where
    Fut: Future,
    Fut::Output: ResultExt,
    M: Message,
{
    type Output = Result<<Fut::Output as ResultExt>::Ok, <Fut::Output as ResultExt>::Context>;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let message = projection.message;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(value.wrap_err({
                message
                    .take()
                    .expect("Cannot poll context after it resolves")
            })),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::wrap_err_lazy`].
#[pin_project]
#[cfg(feature = "futures")]
pub struct FutureWithLazyErr<Fut, F> {
    #[pin]
    inner: Fut,
    op: Option<F>,
}

impl<Fut, F, M> Future for FutureWithLazyErr<Fut, F>
where
    Fut: Future,
    Fut::Output: ResultExt,
    F: FnOnce() -> M,
    M: Message,
{
    type Output = Result<<Fut::Output as ResultExt>::Ok, <Fut::Output as ResultExt>::Context>;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let op = projection.op;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(
                value.wrap_err_lazy(op.take().expect("Cannot poll context after it resolves")),
            ),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::provide_context`].
#[pin_project]
#[cfg(feature = "futures")]
pub struct FutureWithContext<Fut, C> {
    #[pin]
    inner: Fut,
    context: Option<C>,
}

impl<Fut, C> Future for FutureWithContext<Fut, C>
where
    Fut: Future,
    Fut::Output: ResultExt,
    C: Context,
{
    type Output = Result<<Fut::Output as ResultExt>::Ok, C>;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let context = projection.context;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(value.provide_context({
                context
                    .take()
                    .expect("Cannot poll context after it resolves")
            })),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::provide_context_lazy`].
#[pin_project]
#[cfg(feature = "futures")]
pub struct FutureWithLazyContext<Fut, F> {
    #[pin]
    inner: Fut,
    op: Option<F>,
}

impl<Fut, F, C> Future for FutureWithLazyContext<Fut, F>
where
    Fut: Future,
    Fut::Output: ResultExt,
    F: FnOnce() -> C,
    C: Context,
{
    type Output = Result<<Fut::Output as ResultExt>::Ok, C>;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let op = projection.op;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => {
                Poll::Ready(value.provide_context_lazy(
                    op.take().expect("Cannot poll context after it resolves"),
                ))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Extension trait for [`Future`] to provide contextual information on [`Report`]s.
///
/// [`Report`]: crate::Report
#[cfg(feature = "futures")]
pub trait FutureExt: Future + Sized {
    /// Adds new contextual message to the [`Frame`] stack of a [`Report`] when [`poll`]ing the
    /// [`Future`].
    ///
    /// [`Frame`]: crate::Frame
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    ///
    /// # Example
    ///
    /// ```rust
    /// # struct User;
    /// # struct Resource;
    /// use error::{FutureExt, Result};
    ///
    /// # #[allow(unused_variables)]
    /// async fn load_resource(user: &User, resource: &Resource) -> Result<()> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # }; error::bail!("unknown error")
    /// }
    ///
    /// # let fut = async {
    ///     # let user = User;
    ///     # let resource = Resource;
    ///     // A contextual message can be provided before polling the `Future`
    ///     load_resource(&user, &resource).wrap_err("Could not load resource").await
    /// # };
    /// # #[cfg(not(miri))] // miri can't `block_on`
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_>::Ok(())
    /// ```
    #[track_caller]
    fn wrap_err<M>(self, message: M) -> FutureWithErr<Self, M>
    where
        M: Message;

    /// Lazily adds new contextual message to the [`Frame`] stack of a [`Report`] when [`poll`]ing
    /// the [`Future`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`Frame`]: crate::Frame
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    ///
    /// # Example
    ///
    /// ```rust
    /// # use core::fmt;
    /// # struct User;
    /// # struct Resource;
    /// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// use error::{FutureExt, Result};
    ///
    /// # #[allow(unused_variables)]
    /// async fn load_resource(user: &User, resource: &Resource) -> Result<()> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # }; error::bail!("unknown error")
    /// }
    ///
    /// # let fut = async {
    ///     # let user = User;
    ///     # let resource = Resource;
    ///     // A contextual message can be provided before polling the `Future`
    ///     load_resource(&user, &resource).wrap_err_lazy(|| format!("Could not load resource {resource}")).await
    /// # };
    /// # #[cfg(not(miri))]
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_>::Ok(())
    /// ```
    #[track_caller]
    fn wrap_err_lazy<M, F>(self, op: F) -> FutureWithLazyErr<Self, F>
    where
        M: Message,
        F: FnOnce() -> M;

    /// Adds a context provider to the [`Frame`] stack of a [`Report`] when [`poll`]ing the
    /// [`Future`] returning [`Result<T, C>`].
    ///
    /// [`Frame`]: crate::Frame
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    // TODO: come up with a decent example
    #[track_caller]
    fn provide_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context;

    /// Lazily adds a context provider to the [`Frame`] stack of a [`Report`] when [`poll`]ing the
    /// [`Future`] returning [`Result<T, C>`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`Frame`]: crate::Frame
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    // TODO: come up with a decent example
    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> FutureWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<Fut: Future> FutureExt for Fut
where
    Fut::Output: ResultExt,
{
    fn wrap_err<M>(self, message: M) -> FutureWithErr<Self, M>
    where
        M: Message,
    {
        FutureWithErr {
            inner: self,
            message: Some(message),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, op: F) -> FutureWithLazyErr<Self, F>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        FutureWithLazyErr {
            inner: self,
            op: Some(op),
        }
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context,
    {
        FutureWithContext {
            inner: self,
            context: Some(context),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> FutureWithLazyContext<Self, F>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        FutureWithLazyContext {
            inner: self,
            op: Some(context),
        }
    }
}
