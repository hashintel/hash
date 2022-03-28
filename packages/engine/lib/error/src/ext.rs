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
        self.map_err(|error| Report::from(error).wrap(message))
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        self.map_err(|error| Report::from(error).wrap(message()))
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context,
    {
        self.map_err(|error| Report::from(error).provide_context(context))
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        self.map_err(|error| Report::from(error).provide_context(context()))
    }
}

impl<T, C> ResultExt<T> for Result<T, C> {
    type Context = C;

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Self
    where
        M: Message,
    {
        self.map_err(|report| report.wrap(message))
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        self.map_err(|report| report.wrap(message()))
    }

    #[track_caller]
    fn provide_context<C2>(self, context: C2) -> Result<T, C2>
    where
        C2: Context,
    {
        self.map_err(|report| report.provide_context(context))
    }

    #[track_caller]
    fn provide_context_lazy<C2, F>(self, context: F) -> Result<T, C2>
    where
        C2: Context,
        F: FnOnce() -> C2,
    {
        self.map_err(|report| report.provide_context(context()))
    }
}
