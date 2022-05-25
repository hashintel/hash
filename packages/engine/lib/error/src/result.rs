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
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).wrap(message())),
        }
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).provide_context(context())),
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
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.wrap(message())),
        }
    }

    #[track_caller]
    fn provide_context<C2>(self, context: C2) -> Result<T, C2>
    where
        C2: Context,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C2, F>(self, context: F) -> Result<T, C2>
    where
        C2: Context,
        F: FnOnce() -> C2,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide_context(context())),
        }
    }
}
