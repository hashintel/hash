#[cfg(test)]
mod http;
#[cfg(test)]
mod rest;
mod secrets;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod postgres;

use core::num::NonZero;

pub use self::secrets::{GraphVaultConfig, GraphVaultSecretStore, SecretStore, SecretValue};
use crate::ByteSize;

/// Identifies the service involved in resolving a User Secret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum SecretService {
    Graph,
    Vault,
}

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
    #[display("{service} secret request failed")]
    SecretRequest { service: SecretService },
    #[display("{service} secret request returned HTTP {status}; expected 200 OK")]
    SecretStatus { service: SecretService, status: u16 },
    #[display("{service} secret response could not be decoded")]
    SecretResponse { service: SecretService },
    #[display("Graph secret query returned {count} entities; expected exactly one")]
    SecretEntityCount { count: usize },
    #[display("User Secret entity has an unexpected identity, type, or archive state")]
    SecretEntity,
    #[display("User Secret expiry is missing or invalid")]
    SecretExpiry,
    #[display("User Secret has expired")]
    SecretExpired,
    #[display("User Secret Vault path is missing or invalid")]
    SecretPath,
    #[display("User Secret value is empty or invalid")]
    SecretValue,
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
