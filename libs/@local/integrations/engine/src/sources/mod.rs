#[cfg(test)]
mod http;
mod secrets;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod postgres;

use core::num::NonZero;

pub use self::secrets::{GraphVaultConfig, GraphVaultSecretStore, SecretStore, SecretValue};
use crate::ByteSize;

/// Reports why a live source could not be captured or restored.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum SourceError {
    #[display("source configuration is invalid")]
    Configuration,
    #[display("source storage could not be read")]
    Read,
    #[display("source capture could not be published")]
    Write,
    #[display("source capture could not be loaded into the workspace")]
    Load,
    #[display("source query failed")]
    Query,
    #[display("User Secret is unavailable or invalid")]
    Secret,
    #[display("PostgreSQL source capture failed")]
    Postgres,
    #[display("REST destination must use HTTP or HTTPS and public addresses")]
    Destination,
    #[display("REST request failed")]
    Request,
    #[display("REST server returned HTTP {status}")]
    Status { status: u16 },
    #[display("REST response is invalid or exceeds 16 MiB")]
    Response,
    #[display("REST pagination is invalid or repeats a page")]
    Pagination,
}

/// Resource limits for the isolated database used by network connectors.
#[derive(Debug, Default, Clone, Copy)]
pub struct CaptureLimits {
    pub memory_limit: Option<ByteSize>,
    pub temp_directory_limit: Option<ByteSize>,
    pub threads: Option<NonZero<usize>>,
}
