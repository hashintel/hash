use core::fmt;

use provider::Provider;

use crate::{Report, Result, ResultExt};

#[cfg(feature = "std")]
impl<T, E> ResultExt<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type ErrorKind = ();

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

    #[track_caller]
    fn wrap_err_lazy<C, F>(self, context: F) -> Result<T, Report>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(context())),
        }
    }

    #[track_caller]
    fn provide_context<K>(self, context: K) -> Result<T, Report<K>>
    where
        K: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<K, F>(self, context: F) -> Result<T, Report<K>>
    where
        K: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> K,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context())),
        }
    }
}

impl<T, E> ResultExt<T> for Result<T, Report<E>> {
    type ErrorKind = E;

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
    fn wrap_err_lazy<C, F>(self, context: F) -> Self
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(context())),
        }
    }

    #[track_caller]
    fn provide_context<K>(self, context: K) -> Result<T, Report<K>>
    where
        K: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<K, F>(self, context: F) -> Result<T, Report<K>>
    where
        K: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> K,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context())),
        }
    }
}
