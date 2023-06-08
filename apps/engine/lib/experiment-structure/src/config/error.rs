use thiserror::Error;

#[derive(Debug, Error)]
#[error("Could not read configuration")]
pub struct ConfigError;

pub type Result<T, E = ConfigError> = error_stack::Result<T, E>;
