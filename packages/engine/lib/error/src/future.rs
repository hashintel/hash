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
    FutureWithObject,
    attach,
    Display + Debug + Send + Sync + 'static,
    Fut::Output
);

implement_lazy_future_adaptor!(
    FutureWithLazyObject,
    attach_lazy,
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
    /// Adds new contextual information to the [`Frame`] stack of a [`Report`] when [`poll`]ing the
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
    ///     load_resource(&user, &resource).attach("Could not load resource").await
    /// # };
    /// # #[cfg(not(miri))]
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_, ResourceError>::Ok(())
    /// ```
    #[track_caller]
    fn attach<O>(self, object: O) -> FutureWithObject<Self, O>
    where
        O: Display + Debug + Send + Sync + 'static;

    /// Lazily adds new contextual information to the [`Frame`] stack of a [`Report`] when
    /// [`poll`]ing the [`Future`].
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
    ///     load_resource(&user, &resource).attach_lazy(|| format!("Could not load resource {resource}")).await
    /// # };
    /// # #[cfg(not(miri))]
    /// # assert_eq!(futures::executor::block_on(fut).unwrap_err().frames().count(), 2);
    /// # Result::<_, ResourceError>::Ok(())
    /// ```
    #[track_caller]
    fn attach_lazy<O, F>(self, object: F) -> FutureWithLazyObject<Self, F>
    where
        O: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> O;

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
    fn attach<O>(self, object: O) -> FutureWithObject<Self, O>
    where
        O: Display + Debug + Send + Sync + 'static,
    {
        FutureWithObject {
            future: self,
            inner: Some(object),
        }
    }

    #[track_caller]
    fn attach_lazy<O, F>(self, object: F) -> FutureWithLazyObject<Self, F>
    where
        O: Display + Debug + Send + Sync + 'static,
        F: FnOnce() -> O,
    {
        FutureWithLazyObject {
            future: self,
            inner: Some(object),
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
