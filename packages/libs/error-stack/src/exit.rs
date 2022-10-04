use std::{
    io,
    io::Write,
    process::{ExitCode, Termination},
};

use crate::result::Result;

/// TODO
/// ```should_panic
/// # use std::io::{Error, ErrorKind};
/// # use std::process::ExitCode;
/// # use error_stack::{Exit, IntoExit, IntoReport, ResultExt};
/// #
/// fn main() -> Exit<(), Error> {
///     Err(Error::from(ErrorKind::NotFound))
///         .into_report()
///         .attach(ExitCode::from(42))
///         .into_exit()
/// }
/// ```
pub struct Exit<T, C>(Result<T, C>);

impl<T, C> Exit<T, C> {
    pub fn into_result(self) -> Result<T, C> {
        self.0
    }
}

impl<T, C> From<Result<T, C>> for Exit<T, C> {
    fn from(result: Result<T, C>) -> Self {
        Self(result)
    }
}

impl<T, C> Termination for Exit<T, C> {
    fn report(self) -> ExitCode {
        match self.0 {
            Ok(_) => ExitCode::SUCCESS,
            Err(err) => {
                // Ignore error if the write fails, for example because stderr is
                // already closed. There is not much point panicking at this point.
                drop(writeln!(io::stderr(), "Error: {err:?}"));
                err.report()
            }
        }
    }
}
