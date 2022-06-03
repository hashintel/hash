//! Extension for convenient usage of [`Report`]s returned by [`Future`] s.
//!
//! Extends [`Future`] with the same methods as [`ResultExt`] but calls the methods on [`poll`]ing.
//!
//! [`Report`]: crate::Report
//! [`poll`]: Future::poll

use core::{
    fmt::{Debug, Display},
    future::Future,
    pin::Pin,
    task::{Context as TaskContext, Poll},
};

use pin_project::pin_project;

#[cfg(nightly)]
use crate::provider::Provider;
use crate::{Context, Result, ResultExt};

macro_rules! implement_future_adaptor {
    ($future:ident, $method:ident, $bound:ident $(+ $bounds:ident)* $(+ $lifetime:lifetime)*, $output:ty) => {
        #[doc = concat!("Adaptor returned by [`FutureExt::", stringify!( $method ), "`].")]
        #[pin_project]
        pub struct $future<Fut, T> {
            #[pin]
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
                let projection = self.project();
                let future = projection.future;
                let inner = projection.inner;

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
        #[pin_project]
        pub struct $future<Fut, F> {
            #[pin]
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
                let projection = self.project();
                let future = projection.future;
                let inner = projection.inner;

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
    FutureWithMessage,
    attach_message,
    Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_lazy_future_adaptor!(
    FutureWithLazyMessage,
    attach_message_lazy,
    Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_future_adaptor!(
    FutureWithProvider,
    attach_provider,
    Provider + Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_lazy_future_adaptor!(
    FutureWithLazyProvider,
    attach_provider_lazy,
    Provider + Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_future_adaptor!(
    FutureWithProvided,
    provide,
    Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_lazy_future_adaptor!(
    FutureWithLazyProvided,
    provide_lazy,
    Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_future_adaptor!(
    FutureWithContext,
    change_context,
    Context,
    Result<<Fut::Output as ResultExt>::Ok, T>
);

implement_lazy_future_adaptor!(
    FutureWithLazyContext,
    change_context_lazy,
    Context,
    Result<<Fut::Output as ResultExt>::Ok, T>
);

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
        M: Display + Debug + Send + Sync + 'static;

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
        M: Display + Debug + Send + Sync + 'static,
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
        P: Provider + Display + Debug + Send + Sync + 'static;

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
        P: Provider + Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> P;

    /// Adds the provided object to the [`Frame`] stack when [`poll`]ing the [`Future`].
    ///
    /// The object can later be retrieved by calling [`request_ref()`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`Frame`]: crate::Frame
    /// [`poll`]: Future::poll
    #[cfg(nightly)]
    fn provide<P>(self, provided: P) -> FutureWithProvided<Self, P>
    where
        P: Display + Debug + Send + Sync + 'static;

    /// Lazily adds the provided object to the [`Frame`] stack when [`poll`]ing the [`Future`].
    ///
    /// The object can later be retrieved by calling [`request_ref()`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`Frame`]: crate::Frame
    /// [`poll`]: Future::poll
    #[cfg(nightly)]
    fn provide_lazy<P, F>(self, provided: F) -> FutureWithLazyProvided<Self, F>
    where
        P: Display + Debug + Send + Sync + 'static,
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
        M: Display + Debug + Send + Sync + 'static,
    {
        FutureWithMessage {
            future: self,
            inner: Some(message),
        }
    }

    #[track_caller]
    fn attach_message_lazy<M, F>(self, message: F) -> FutureWithLazyMessage<Self, F>
    where
        M: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> M,
    {
        FutureWithLazyMessage {
            future: self,
            inner: Some(message),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider<P>(self, provider: P) -> FutureWithProvider<Self, P>
    where
        P: Provider + Display + Debug + Send + Sync + 'static,
    {
        FutureWithProvider {
            future: self,
            inner: Some(provider),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider_lazy<P, F>(self, provider: F) -> FutureWithLazyProvider<Self, F>
    where
        P: Provider + Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        FutureWithLazyProvider {
            future: self,
            inner: Some(provider),
        }
    }

    fn provide<P>(self, provided: P) -> FutureWithProvided<Self, P>
    where
        P: Display + Debug + Send + Sync + 'static,
    {
        FutureWithProvided {
            future: self,
            inner: Some(provided),
        }
    }

    fn provide_lazy<P, F>(self, provided: F) -> FutureWithLazyProvided<Self, F>
    where
        P: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        FutureWithLazyProvided {
            future: self,
            inner: Some(provided),
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
