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
    fn wrap_err<Message>(self, message: Message) -> Result<T>
    where
        Message: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<Message, F>(self, op: F) -> Result<T, Self::Context>
    where
        Message: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> Message,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).wrap(op())),
        }
    }

    #[track_caller]
    fn provide_context<Context>(self, context: Context) -> Result<T, Context>
    where
        Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<Context, F>(self, op: F) -> Result<T, Context>
    where
        Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).provide_context(op())),
        }
    }
}

impl<T, Context> ResultExt<T> for Result<T, Context> {
    type Context = Context;

    #[track_caller]
    fn wrap_err<Message>(self, message: Message) -> Self
    where
        Message: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<Message, F>(self, op: F) -> Result<T, Self::Context>
    where
        Message: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> Message,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.wrap(op())),
        }
    }

    #[track_caller]
    fn provide_context<NewContext>(self, context: NewContext) -> Result<T, NewContext>
    where
        NewContext: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<NewContext, F>(self, op: F) -> Result<T, NewContext>
    where
        NewContext: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> NewContext,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.provide_context(op())),
        }
    }
}
