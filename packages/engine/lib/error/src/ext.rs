use core::fmt;

use provider::Provider;

#[cfg(feature = "std")]
use crate::Report;
use crate::{Result, ResultExt};

#[cfg(feature = "std")]
impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type Context = ();

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Result<T>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(message())),
        }
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> Result<T, C>
    where
        C: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context())),
        }
    }
}

impl<T, C> ResultExt<T> for Result<T, C> {
    type Context = C;

    #[track_caller]
    fn wrap_err<M>(self, context: M) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(context)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, context: F) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(context())),
        }
    }

    #[track_caller]
    fn provide_context<Context>(self, context: Context) -> Result<T, Context>
    where
        Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<Context, F>(self, context: F) -> Result<T, Context>
    where
        Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context())),
        }
    }
}
