use provider::{Demand, Provider};
use thiserror::Error as ThisError;

pub type Result<T, E = ErrorKind> = error::Result<T, E>;

#[derive(ThisError, Debug, Copy, Clone)]
#[allow(clippy::module_name_repetitions)]
pub enum ErrorKind {
    #[error("Could not create nano server")]
    ServerCreation,

    #[error("Could not create nano client")]
    ClientCreation,

    #[error("Could not send value")]
    Send,

    #[error("Could not receive value")]
    Receive,
}

impl Provider for ErrorKind {
    fn provide<'a>(&'a self, _demand: &mut Demand<'a>) {
        // Empty implementation
    }
}
