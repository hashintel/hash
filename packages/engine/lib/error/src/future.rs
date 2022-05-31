//! Extension for convenient usage of [`Report`]s returned by [`Future`] s.
//!
//! Extends [`Future`] with the same methods as [`ResultExt`] but calls the methods on [`poll`]ing.
//!
//! [`Report`]: crate::Report
//! [`poll`]: Future::poll

use core::{
    fmt,
    future::Future,
    pin::Pin,
    task::{Context as TaskContext, Poll},
};

use pin_project::pin_project;

#[cfg(nightly)]
use crate::provider::Provider;
use crate::{Context, Result, ResultExt};

/// Adaptor returned by [`FutureExt::attach_message`].
#[pin_project]
pub struct FutureWithMessage<Fut, M> {
    #[pin]
    inner: Fut,
    message: Option<M>,
}

impl<Fut, M> Future for FutureWithMessage<Fut, M>
where
    Fut: Future,
    Fut::Output: ResultExt,
    M: fmt::Display + fmt::Debug + Send + Sync + 'static,
{
    type Output = Fut::Output;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let message = projection.message;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(value.attach_message({
                message
                    .take()
                    .expect("Cannot poll context after it resolves")
            })),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::attach_message_lazy`].
#[pin_project]
pub struct FutureWithLazyMessage<Fut, F> {
    #[pin]
    inner: Fut,
    op: Option<F>,
}

impl<Fut, F, M> Future for FutureWithLazyMessage<Fut, F>
where
    Fut: Future,
    Fut::Output: ResultExt,
    F: FnOnce() -> M,
    M: fmt::Display + fmt::Debug + Send + Sync + 'static,
{
    type Output = Fut::Output;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let op = projection.op;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(
                value
                    .attach_message_lazy(op.take().expect("Cannot poll context after it resolves")),
            ),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::attach_provider`].
#[pin_project]
#[cfg(nightly)]
pub struct FutureWithProvider<Fut, P> {
    #[pin]
    inner: Fut,
    provider: Option<P>,
}

impl<Fut, P> Future for FutureWithProvider<Fut, P>
where
    Fut: Future,
    Fut::Output: ResultExt,
    P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
{
    type Output = Fut::Output;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let provider = projection.provider;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(value.attach_provider({
                provider
                    .take()
                    .expect("Cannot poll context after it resolves")
            })),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::attach_provider_lazy`].
#[pin_project]
#[cfg(nightly)]
pub struct FutureWithLazyProvider<Fut, F> {
    #[pin]
    inner: Fut,
    op: Option<F>,
}

impl<Fut, F, M> Future for FutureWithLazyProvider<Fut, F>
where
    Fut: Future,
    Fut::Output: ResultExt,
    F: FnOnce() -> M,
    M: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
{
    type Output = Fut::Output;

    #[track_caller]
    fn poll(self: Pin<&mut Self>, cx: &mut TaskContext) -> Poll<Self::Output> {
        let projection = self.project();
        let inner = projection.inner;
        let op = projection.op;

        // Can't use `map` as `#[track_caller]` is unstable on closures
        match inner.poll(cx) {
            Poll::Ready(value) => Poll::Ready(
                value
                    .attach_message_lazy(op.take().expect("Cannot poll context after it resolves")),
            ),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::change_context`].
#[pin_project]
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
            Poll::Ready(value) => Poll::Ready(value.change_context({
                context
                    .take()
                    .expect("Cannot poll context after it resolves")
            })),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Adaptor returned by [`FutureExt::change_context_lazy`].
#[pin_project]
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
            Poll::Ready(value) => Poll::Ready(
                value
                    .change_context_lazy(op.take().expect("Cannot poll context after it resolves")),
            ),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Extension trait for [`Future`] to provide contextual information on [`Report`]s.
///
/// [`Report`]: crate::Report
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
    /// # use core::fmt;
    /// # struct User;
    /// # struct Resource;
    /// # #[derive(Debug)] struct ResourceError;
    /// # impl fmt::Display for ResourceError { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// # impl error::Context for ResourceError {}
    /// use error::{FutureExt, Result};
    ///
    /// # #[allow(unused_variables)]
    /// async fn load_resource(user: &User, resource: &Resource) -> Result<(), ResourceError> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # }; error::bail!(ResourceError)
    /// }
    ///
    /// # let fut = async {
    ///     # let user = User;
    ///     # let resource = Resource;
    ///     // A contextual message can be provided before polling the `Future`
    ///     load_resource(&user, &resource).attach_message("Could not load resource").await
    /// # };
    /// # #[cfg(not(miri))]
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_, ResourceError>::Ok(())
    /// ```
    #[track_caller]
    fn attach_message<M>(self, message: M) -> FutureWithMessage<Self, M>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static;

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
    /// # #[derive(Debug)] struct ResourceError;
    /// # impl fmt::Display for ResourceError { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// # impl error::Context for ResourceError {}
    /// use error::{FutureExt, Result};
    ///
    /// # #[allow(unused_variables)]
    /// async fn load_resource(user: &User, resource: &Resource) -> Result<(), ResourceError> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # }; error::bail!(ResourceError)
    /// }
    ///
    /// # let fut = async {
    ///     # let user = User;
    ///     # let resource = Resource;
    ///     // A contextual message can be provided before polling the `Future`
    ///     load_resource(&user, &resource).attach_message_lazy(|| format!("Could not load resource {resource}")).await
    /// # };
    /// # #[cfg(not(miri))]
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_, ResourceError>::Ok(())
    /// ```
    #[track_caller]
    fn attach_message_lazy<M, F>(self, message: F) -> FutureWithLazyMessage<Self, F>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M;

    /// Adds a [`Provider`] to the [`Frame`] stack when [`poll`]ing the [`Future`].
    ///
    /// The provider is used to [`provide`] values either by calling
    /// [`request_ref()`]/[`request_value()`] to return an iterator over all specified values, or by
    /// using the [`Provider`] implementation on a [`Frame`].
    ///
    /// [`provide`]: Provider::provide
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`request_value()`]: crate::Report::request_value
    /// [`Frame`]: crate::Frame
    /// [`poll`]: Future::poll
    #[cfg(nightly)]
    fn attach_provider<P>(self, provider: P) -> FutureWithProvider<Self, P>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds a [`Provider`] to the [`Frame`] stack when [`poll`]ing the [`Future`].
    ///
    /// The provider is used to [`provide`] values either by calling
    /// [`request_ref()`]/[`request_value()`] to return an iterator over all specified values, or by
    /// using the [`Provider`] implementation on a [`Frame`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`provide`]: Provider::provide
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`request_value()`]: crate::Report::request_value
    /// [`Frame`]: crate::Frame
    /// [`poll`]: Future::poll
    #[cfg(nightly)]
    fn attach_provider_lazy<P, F>(self, provider: F) -> FutureWithLazyProvider<Self, F>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P;

    /// Changes the [`Context`] of a [`Report`] when [`poll`]ing the [`Future`] returning
    /// [`Result<T, C>`].
    ///
    /// Please see the [`Context`] documentation for more information.
    ///
    /// [`Frame`]: crate::Frame
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    // TODO: come up with a decent example
    #[track_caller]
    fn change_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context;

    /// Lazily changes the [`Context`] of a [`Report`] when [`poll`]ing the [`Future`] returning
    /// [`Result<T, C>`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// Please see the [`Context`] documentation for more information.
    ///
    /// [`Report`]: crate::Report
    /// [`poll`]: Future::poll
    // TODO: come up with a decent example
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
    fn attach_message<M>(self, message: M) -> FutureWithMessage<Self, M>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        FutureWithMessage {
            inner: self,
            message: Some(message),
        }
    }

    #[track_caller]
    fn attach_message_lazy<M, F>(self, message: F) -> FutureWithLazyMessage<Self, F>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M,
    {
        FutureWithLazyMessage {
            inner: self,
            op: Some(message),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider<P>(self, provider: P) -> FutureWithProvider<Self, P>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        FutureWithProvider {
            inner: self,
            provider: Some(provider),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider_lazy<P, F>(self, provider: F) -> FutureWithLazyProvider<Self, F>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        FutureWithLazyProvider {
            inner: self,
            op: Some(provider),
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> FutureWithContext<Self, C>
    where
        C: Context,
    {
        FutureWithContext {
            inner: self,
            context: Some(context),
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> FutureWithLazyContext<Self, F>
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
