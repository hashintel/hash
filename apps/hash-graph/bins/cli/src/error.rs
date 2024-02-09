use std::fmt;

use error_stack::Context;

#[derive(Debug)]
pub struct GraphError;
impl Context for GraphError {}

impl fmt::Display for GraphError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the Graph query layer encountered an error during execution")
    }
}

#[derive(Debug)]
pub enum HealthcheckError {
    NotHealthy,
    Timeout,
}

impl fmt::Display for HealthcheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotHealthy => fmt.write_str("healthcheck failed"),
            Self::Timeout => fmt.write_str("healthcheck timed out"),
        }
    }
}

impl Context for HealthcheckError {}
