use core::{error::Error, fmt};

use aws_config::{BehaviorVersion, Region};
use aws_credential_types::provider::error::CredentialsError;
use aws_sdk_s3::{
    Client,
    config::{Credentials, ProvideCredentials as _},
};
use clap::Args;

use crate::integrity::SecretString;

#[derive(Debug)]
pub enum S3ArgsError {
    MissingRegion,
    Credentials(CredentialsError),
}

impl fmt::Display for S3ArgsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingRegion => {
                fmt.write_str("neither the flags nor the AWS configuration name an S3 region")
            }
            Self::Credentials(_) => fmt.write_str("the S3 credentials did not load"),
        }
    }
}

impl Error for S3ArgsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::MissingRegion => None,
            Self::Credentials(error) => Some(error),
        }
    }
}

#[derive(Debug, Args)]
pub struct S3Args {
    #[arg(long = "s3", env = "HASH_GRAPH_ATLAS_S3")]
    enabled: bool,

    #[arg(
        long = "s3-region",
        env = "HASH_GRAPH_ATLAS_S3_REGION",
        requires = "enabled"
    )]
    region: Option<String>,

    #[arg(
        long = "s3-access-key-id",
        env = "HASH_GRAPH_ATLAS_S3_ACCESS_KEY_ID",
        requires = "enabled",
        requires = "secret_access_key"
    )]
    access_key_id: Option<String>,

    #[arg(
        long = "s3-secret-access-key",
        env = "HASH_GRAPH_ATLAS_S3_SECRET_ACCESS_KEY",
        hide_env_values = true,
        requires = "enabled",
        requires = "access_key_id"
    )]
    secret_access_key: Option<SecretString>,

    #[arg(
        long = "s3-session-token",
        env = "HASH_GRAPH_ATLAS_S3_SESSION_TOKEN",
        hide_env_values = true,
        requires = "access_key_id"
    )]
    session_token: Option<SecretString>,

    #[arg(
        long = "s3-endpoint",
        env = "HASH_GRAPH_ATLAS_S3_ENDPOINT",
        requires = "enabled"
    )]
    endpoint: Option<String>,

    #[arg(
        long = "s3-force-path-style",
        env = "HASH_GRAPH_ATLAS_S3_FORCE_PATH_STYLE",
        requires = "enabled"
    )]
    force_path_style: bool,
}

impl S3Args {
    pub async fn client(self) -> Result<Option<Client>, S3ArgsError> {
        if !self.enabled {
            return Ok(None);
        }

        let mut loader = aws_config::defaults(BehaviorVersion::latest());
        if let Some(region) = self.region {
            loader = loader.region(Region::new(region));
        }

        if let (Some(access_key_id), Some(secret_access_key)) =
            (self.access_key_id, self.secret_access_key)
        {
            let secret_access_key = secret_access_key.expose();
            let session_token = self
                .session_token
                .map(|token| String::from(&**token.expose()));

            loader = loader.credentials_provider(Credentials::new(
                access_key_id,
                &**secret_access_key,
                session_token,
                None,
                "atlas-cli",
            ));
        }

        if let Some(endpoint) = self.endpoint {
            loader = loader.endpoint_url(endpoint);
        }

        let config = loader.load().await;

        if config.region().is_none() {
            return Err(S3ArgsError::MissingRegion);
        }

        if let Some(credentials) = config.credentials_provider() {
            credentials
                .provide_credentials()
                .await
                .map_err(S3ArgsError::Credentials)?;
        }

        let config = aws_sdk_s3::config::Builder::from(&config)
            .force_path_style(self.force_path_style)
            .build();

        Ok(Some(Client::from_conf(config)))
    }
}
