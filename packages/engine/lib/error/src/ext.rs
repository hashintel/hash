#[cfg(feature = "std")]
use crate::Report;
use crate::{Context, Message, Result, ResultExt};

#[cfg(feature = "std")]
impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type Context = ();

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Result<T>
    where
        M: Message,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, op: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(op())),
        }
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, op: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(op())),
        }
    }
}

impl<T, C> ResultExt<T> for Result<T, C> {
    type Context = C;

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Self
    where
        M: Message,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, op: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(op())),
        }
    }

    #[track_caller]
    fn provide_context<C2>(self, context: C2) -> Result<T, C2>
    where
        C2: Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C2, F>(self, op: F) -> Result<T, C2>
    where
        C2: Context,
        F: FnOnce() -> C2,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(op())),
        }
    }
}
