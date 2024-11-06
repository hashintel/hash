#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the Graph query layer encountered an error during execution")]
pub struct GraphError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum HealthcheckError {
    #[display("healthcheck failed")]
    NotHealthy,
    #[display("healthcheck timed out")]
    Timeout,
}
