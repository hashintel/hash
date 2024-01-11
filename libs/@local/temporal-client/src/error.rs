use thiserror::Error;

#[derive(Debug, Error)]
#[error("Could not configure Temporal client")]
pub struct ConfigError;

#[derive(Debug, Error)]
#[error("Could not connect to Temporal.io Server")]
pub struct ConnectionError;

#[derive(Debug, Error)]
#[error("Workflow execution of job {0} failed")]
pub struct WorkflowError(pub &'static str);
