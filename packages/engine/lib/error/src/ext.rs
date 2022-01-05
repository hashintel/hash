use crate::{Context, ErrorKind, Report, Result, ResultExt};

#[cfg(feature = "std")]
impl<T, E> ResultExt<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type ErrorKind = ();

    #[track_caller]
    fn context<C>(self, context: C) -> Result<T, Report>
    where
        C: Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).context(context)),
        }
    }

    #[track_caller]
    fn with_context<C, F>(self, context: F) -> Result<T, Report>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).context(context())),
        }
    }

    #[track_caller]
    fn error_kind<K>(self, error_kind: K) -> Result<T, Report<K>>
    where
        K: ErrorKind,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).error_kind(error_kind)),
        }
    }

    #[track_caller]
    fn with_error_kind<K, F>(self, error_kind: F) -> Result<T, Report<K>>
    where
        K: ErrorKind,
        F: FnOnce() -> K,
    {
        match self {
            Ok(t) => Ok(t),
            Err(error) => Err(Report::from(error).error_kind(error_kind())),
        }
    }
}

impl<T, E> ResultExt<T> for Result<T, Report<E>> {
    type ErrorKind = E;

    #[track_caller]
    fn context<C>(self, context: C) -> Self
    where
        C: Context,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.context(context)),
        }
    }

    #[track_caller]
    fn with_context<C, F>(self, context: F) -> Self
    where
        C: Context,
        F: FnOnce() -> C,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.context(context())),
        }
    }

    #[track_caller]
    fn error_kind<K>(self, error_kind: K) -> Result<T, Report<K>>
    where
        K: ErrorKind,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.error_kind(error_kind)),
        }
    }

    #[track_caller]
    fn with_error_kind<K, F>(self, error_kind: F) -> Result<T, Report<K>>
    where
        K: ErrorKind,
        F: FnOnce() -> K,
    {
        match self {
            Ok(t) => Ok(t),
            Err(report) => Err(report.error_kind(error_kind())),
        }
    }
}
