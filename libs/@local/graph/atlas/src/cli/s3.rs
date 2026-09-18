use core::{error::Error, fmt, io};

use aws_config::{BehaviorVersion, Region};
use aws_credential_types::provider::error::CredentialsError;
use aws_sdk_s3::{
    Client,
    config::{Credentials, ProvideCredentials as _},
};

use crate::integrity::SecretString;

/// A failure to resolve the region or credentials for an enabled S3 backend.
#[derive(Debug)]
pub enum S3ArgsError {
    /// Neither explicit arguments nor SDK configuration supplied a region.
    MissingRegion,
    /// The configured credential provider failed to load credentials.
    Credentials(CredentialsError),
    /// An I/O error occurred.
    Io(io::Error),
}

impl fmt::Display for S3ArgsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingRegion => {
                fmt.write_str("neither the flags nor the AWS configuration name an S3 region")
            }
            Self::Credentials(_) => fmt.write_str("the S3 credentials did not load"),
            Self::Io(_) => fmt.write_str("an I/O error occurred"),
        }
    }
}

impl Error for S3ArgsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::MissingRegion => None,
            Self::Credentials(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

impl From<CredentialsError> for S3ArgsError {
    fn from(value: CredentialsError) -> Self {
        Self::Credentials(value)
    }
}

impl From<io::Error> for S3ArgsError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

/// Optional S3 access with explicit overrides for the SDK's configuration chain.
#[derive(Debug, clap::Args)]
pub struct S3Args {
    /// Enable S3 access.
    ///
    /// Off by default.
    #[arg(long = "s3", env = "HASH_GRAPH_ATLAS_FITTING_S3")]
    enabled: bool,

    /// S3 region. Defaults to the SDK's region configuration.
    #[arg(long = "s3-region", env = "HASH_GRAPH_ATLAS_FITTING_S3_REGION")]
    region: Option<String>,

    /// Access key id paired with the explicit secret key.
    ///
    /// Defaults to the SDK credential chain.
    #[arg(
        long = "s3-access-key-id",
        env = "HASH_GRAPH_ATLAS_FITTING_S3_ACCESS_KEY_ID",
        requires = "secret_access_key"
    )]
    access_key_id: Option<String>,

    /// Secret key paired with the explicit access key id.
    ///
    /// Defaults to the SDK credential chain.
    #[arg(
        long = "s3-secret-access-key",
        env = "HASH_GRAPH_ATLAS_FITTING_S3_SECRET_ACCESS_KEY",
        hide_env_values = true,
        requires = "access_key_id"
    )]
    secret_access_key: Option<SecretString>,

    /// Session token for the explicit access-key pair.
    ///
    /// No token by default.
    #[arg(
        long = "s3-session-token",
        env = "HASH_GRAPH_ATLAS_FITTING_S3_SESSION_TOKEN",
        hide_env_values = true,
        requires = "access_key_id"
    )]
    session_token: Option<SecretString>,

    /// Service endpoint override.
    ///
    /// Defaults to the SDK's endpoint configuration.
    #[arg(long = "s3-endpoint", env = "HASH_GRAPH_ATLAS_FITTING_S3_ENDPOINT")]
    endpoint: Option<String>,

    /// Select path-style bucket addressing.
    ///
    /// Off by default.
    #[arg(
        long = "s3-force-path-style",
        env = "HASH_GRAPH_ATLAS_FITTING_S3_FORCE_PATH_STYLE"
    )]
    force_path_style: bool,
}

impl S3Args {
    /// Resolves region and credentials for an enabled S3 backend.
    ///
    /// With S3 access off, returns `None` without consulting SDK configuration or credential
    /// providers.
    ///
    /// # Errors
    ///
    /// Returns [`S3ArgsError`] if no region resolves or the configured credential provider fails.
    pub async fn client(self) -> Result<Option<Client>, S3ArgsError> {
        let Self {
            enabled,
            region,
            access_key_id,
            secret_access_key,
            session_token,
            endpoint,
            force_path_style,
        } = self;

        if !enabled {
            if region.is_some()
                || access_key_id.is_some()
                || secret_access_key.is_some()
                || session_token.is_some()
                || endpoint.is_some()
                || force_path_style
            {
                tracing::warn!(
                    "ignoring S3 options: enable access with `--s3` or \
                     `HASH_GRAPH_ATLAS_FITTING_S3=true`"
                );
            }

            return Ok(None);
        }

        let mut loader = aws_config::defaults(BehaviorVersion::latest());
        if let Some(region) = region {
            loader = loader.region(Region::new(region));
        }

        if let (Some(access_key_id), Some(secret_access_key)) = (access_key_id, secret_access_key) {
            let secret_access_key = secret_access_key.expose();
            let session_token = session_token.map(|token| String::from(&**token.expose()));

            loader = loader.credentials_provider(Credentials::new(
                access_key_id,
                &**secret_access_key,
                session_token,
                None,
                "atlas-cli",
            ));
        }

        if let Some(endpoint) = endpoint {
            loader = loader.endpoint_url(endpoint);
        }

        let config = loader.load().await;

        if config.region().is_none() {
            return Err(S3ArgsError::MissingRegion);
        }

        if let Some(credentials) = config.credentials_provider() {
            credentials.provide_credentials().await?;
        }

        let config = aws_sdk_s3::config::Builder::from(&config)
            .force_path_style(force_path_style)
            .build();

        Ok(Some(Client::from_conf(config)))
    }
}
