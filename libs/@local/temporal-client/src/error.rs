use thiserror::Error;

#[derive(Debug, Error)]
#[error("Could not configure Temporal client")]
pub struct ConfigError;

#[derive(Debug, Error)]
#[error("Could not connect to Temporal.io Server")]
pub struct ConnectionError;
