use core::fmt;

use provider::Provider;

use crate::{LeaveScope, ProvideScope, Report, Result, WrapReport};

#[cfg(feature = "std")]
impl<T, E> WrapReport<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type Scope = ();

    // TODO: Specialize on trait `Provider` to remove `fn provide`
    #[track_caller]
    fn wrap_err<C>(self, context: C) -> Result<T, Report>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(context)),
        }
    }

    // TODO: Specialize on trait `Provider` to remove `fn provide_with`
    #[track_caller]
    fn wrap_err_with<C, F>(self, context: F) -> Result<T, Report>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(context())),
        }
    }
}

#[cfg(feature = "std")]
impl<T, E> ProvideScope<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    #[track_caller]
    fn provide<P>(self, provider: P) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide(provider)),
        }
    }

    #[track_caller]
    fn provide_with<P, F>(self, provider: F) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide(provider())),
        }
    }
}

impl<T, S> WrapReport<T> for Result<T, Report<S>> {
    type Scope = S;

    #[track_caller]
    fn wrap_err<C>(self, context: C) -> Self
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(context)),
        }
    }

    #[track_caller]
    fn wrap_err_with<C, F>(self, context: F) -> Self
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(context())),
        }
    }
}

impl<T, S> ProvideScope<T> for Result<T, Report<S>> {
    #[track_caller]
    fn provide<P>(self, provider: P) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide(provider)),
        }
    }

    #[track_caller]
    fn provide_with<P, F>(self, provider: F) -> Result<T, Report<P>>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide(provider())),
        }
    }
}

impl<T, S> LeaveScope<T> for Result<T, Report<S>> {
    fn leave_scope(self) -> Result<T, Report> {
        self.map_err(Report::leave_scope)
    }
}

impl<T> WrapReport<T> for Option<T> {
    type Scope = ();

    #[track_caller]
    fn wrap_err<C>(self, context: C) -> Result<T, Report>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Some(t) => Ok(t),
            None => Err(Report::new(context)),
        }
    }

    #[track_caller]
    fn wrap_err_with<C, F>(self, context: F) -> Result<T, Report>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Some(t) => Ok(t),
            None => Err(Report::new(context())),
        }
    }
}
