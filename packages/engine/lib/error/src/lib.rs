#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(feature = "backtrace", feature(backtrace))]
#![cfg_attr(doc, feature(doc_cfg))]

extern crate alloc;

mod frame;
mod iter;
mod macros;
mod report;
pub mod tags;
mod wrap;

use alloc::boxed::Box;
use core::{fmt, marker::PhantomData, panic::Location};

use provider::Provider;

pub use self::macros::*;
use self::{frame::ErrorType, report::ReportImpl};

pub struct Frame {
    error: ErrorType,
    location: &'static Location<'static>,
    source: Option<Box<Frame>>,
}

/// Contains a [`Frame`] stack consisting of an original error, context information, and optionally
/// a [`Backtrace`] and a [`SpanTrace`].
///
/// To enable the backtrace, make sure `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set, to enable
/// the span trace, [`ErrorLayer`] has to be enabled.
///
/// Context information can be added by using [`wrap()`] or [`WrapReport`]. The [`Frame`]
/// stack can be iterated by using [`chain()`].
///
/// To enforce context information generation, an optional scope may be used. When creating a
/// `Report` from a message with [`new()`] or from an std-error by using [`from()`],
/// the `Report` does not have a scope. To provide a scope, the [`provider`] API is used. Use
/// [`provide()`] or [`ProvideScope`] to add a [`Provider`], which may also be used to
/// provide more context information than only a display message. This information can the be
/// retrieved by calling [`request()`], [`request_ref()`], or [`request_value()`].
///
/// To leave a scope, either use [`Report::leave_scope()`] or [`LeaveScope`].
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`wrap()`]: Self::wrap
/// [`from()`]: #impl-From<E>
/// [`chain()`]: Self::chain
/// [`new()`]: Self::new
/// [`provide()`]: Self::provide
/// [`request()`]: Self::request
/// [`request_ref()`]: Self::request_ref
/// [`request_value()`]: Self::request_value
#[must_use]
pub struct Report<Scope = ()> {
    inner: Box<ReportImpl>,
    _scope: PhantomData<Scope>,
}

/// `Result<T, Report>`
///
/// A reasonable return type to use throughout an application if no scope is used.
///
/// The `Result` type can be used with one or two parameters.
///
/// # Examples
///
/// `Result` can also be used in `fn main()`:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # fn get_user() -> Result<usize> { Ok(0) }
/// # fn get_resource() -> Result<usize> { Ok(0) }
/// use error::{ensure, Result};
///
/// fn main() -> Result<()> {
///     let user = get_user()?;
///     let resource = get_resource()?;
///
///     ensure!(
///         has_permission(user, resource),
///         "Permission denied for {user} accessing {resource}"
///     );
///
///     //...
///     # Ok(())
/// }
/// ```
///
/// If additional scopes are required, `Result` should be redefined:
///
/// ```
/// # struct ScopeErrorKind;
/// type Result<T, E = error::Report<ScopeErrorKind>> = error::Result<T, E>;
/// ```
pub type Result<T, E = Report> = core::result::Result<T, E>;

pub trait WrapReport<T> {
    type Scope;

    fn wrap_err<C>(self, context: C) -> Result<T, Report<Self::Scope>>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static;

    fn wrap_err_with<C, F>(self, context: F) -> Result<T, Report<Self::Scope>>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C;
}

pub trait ProvideScope<T> {
    fn provide<P>(self, provider: P) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static;

    fn provide_with<P, F>(self, provider: F) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P;
}

pub trait LeaveScope<T> {
    fn leave_scope(self) -> Result<T, Report>;
}

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::chain`] to create this iterator.
#[must_use]
#[derive(Clone)]
pub struct Chain<'r> {
    current: Option<&'r Frame>,
}

/// Iterator over requested values in the [`Frame`] stack of a [`Report`] for the type specified by
/// [`I::Type`].
///
/// Use [`Report::request`], [`Report::request_ref`], or [`Report::request_value`] to create this
/// iterator.
///
/// [`I::Type`]: provider::TypeTag::Type
#[must_use]
pub struct Request<'r, I> {
    chain: Chain<'r>,
    _marker: PhantomData<I>,
}
