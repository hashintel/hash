//! # Temporal Client
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
)]

use core::fmt;

pub use self::error::{ConfigError, ConnectionError, WorkflowError};

mod ai;
mod error;

use error_stack::{Report, ResultExt as _};
use temporalio_client::{Client, ClientOptions, NamespacedClient as _, RetryClient};
use url::Url;

pub struct TemporalClient {
    client: RetryClient<Client>,
}

impl fmt::Debug for TemporalClient {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("TemporalClient")
            .field("namespace", &self.client.get_client().namespace())
            .field("identity", &self.client.get_client().identity())
            .field("options", self.client.get_client().options())
            .finish()
    }
}

pub struct TemporalClientConfig {
    options: ClientOptions,
}

impl IntoFuture for TemporalClientConfig {
    type Output = Result<TemporalClient, Report<ConnectionError>>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            Ok(TemporalClient {
                client: self
                    .options
                    .connect("HASH", None)
                    .await
                    .change_context(ConnectionError)?,
            })
        }
    }
}

impl TemporalClientConfig {
    /// Creates a new Temporal client configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the configuration is invalid.
    pub fn new(url: impl Into<Url>) -> Self {
        Self {
            options: ClientOptions::builder()
                .client_name("HASH Temporal client")
                .client_version(env!("CARGO_PKG_VERSION"))
                .target_url(url)
                .build(),
        }
    }
}
