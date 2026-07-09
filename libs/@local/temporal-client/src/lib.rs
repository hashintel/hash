//! # Temporal Client
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
)]

use core::fmt;
use std::process;

pub use self::{
    error::{ConnectionError, WorkflowError, WorkflowResultError},
    workflow::WorkflowRun,
};

mod ai;
mod error;
mod workflow;

use error_stack::{Report, ResultExt as _};
use temporalio_client::{
    Client, ClientOptions, Connection, ConnectionOptions, NamespacedClient as _,
};
use url::Url;

pub struct TemporalClient {
    client: Client,
}

impl fmt::Debug for TemporalClient {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("TemporalClient")
            .field("namespace", &self.client.namespace())
            .field("identity", &self.client.identity())
            .finish()
    }
}

pub struct TemporalClientConfig {
    options: ConnectionOptions,
}

impl IntoFuture for TemporalClientConfig {
    type Output = Result<TemporalClient, Report<ConnectionError>>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            let connection = Connection::connect(self.options)
                .await
                .change_context(ConnectionError)?;
            Ok(TemporalClient {
                client: Client::new(connection, ClientOptions::new("HASH").build())
                    .change_context(ConnectionError)?,
            })
        }
    }
}

/// Returns the client identity in Temporal's conventional `pid@hostname` format, falling back to
/// just the process ID if the hostname is unavailable.
fn client_identity() -> String {
    let pid = process::id();
    hostname::get().map_or_else(
        |_| pid.to_string(),
        |hostname| format!("{pid}@{}", hostname.to_string_lossy()),
    )
}

impl TemporalClientConfig {
    pub fn new(url: impl Into<Url>) -> Self {
        Self {
            options: ConnectionOptions::new(url)
                .client_name("HASH Temporal client")
                .client_version(env!("CARGO_PKG_VERSION"))
                .identity(client_identity())
                .build(),
        }
    }
}
