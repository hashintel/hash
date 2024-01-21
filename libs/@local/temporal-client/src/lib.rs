#![feature(impl_trait_in_assoc_type)]

pub use self::error::{ConfigError, ConnectionError, WorkflowError};

mod ai;
mod error;

use std::future::{Future, IntoFuture};

use error_stack::{Report, ResultExt};
use temporal_io_client::{Client, ClientOptions, ClientOptionsBuilder, RetryClient};
use url::Url;

#[derive(Debug)]
pub struct TemporalClient {
    client: RetryClient<Client>,
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
                    .connect("HASH", None, None)
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
    pub fn new(url: impl Into<Url>) -> Result<Self, Report<ConfigError>> {
        Ok(Self {
            options: ClientOptionsBuilder::default()
                .client_name("HASH Temporal client")
                .client_version(env!("CARGO_PKG_VERSION"))
                .target_url(url)
                .build()
                .change_context(ConfigError)?,
        })
    }
}
