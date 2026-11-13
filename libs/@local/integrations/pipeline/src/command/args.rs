use core::pin::Pin;
use std::path::PathBuf;

use clap::{ArgGroup, Args, Subcommand};
use hash_crypto::Secret;
use hash_integrations_definition::ConnectorId;
use url::Url;
use uuid::Uuid;

/// Resources and identity for a local ingestion run.
#[derive(Debug, Args)]
#[command(group(ArgGroup::new("storage").required(true).args(["storage_dir", "s3_uri"])))]
pub(super) struct RunArgs {
    #[arg(long)]
    pub run_id: Option<Uuid>,
    #[arg(long)]
    pub web: Uuid,
    #[arg(long)]
    pub connector: ConnectorId,
    #[arg(long)]
    pub actor: Uuid,
    #[arg(long)]
    pub allow_mass_archive: bool,
    #[arg(long)]
    pub storage_dir: Option<PathBuf>,
    #[arg(long, requires_all = ["s3_region", "s3_access_key_id", "s3_secret_access_key"])]
    pub s3_uri: Option<Box<str>>,
    #[arg(long, requires = "s3_uri")]
    pub s3_region: Option<Box<str>>,
    #[arg(long, requires = "s3_uri")]
    pub s3_endpoint: Option<Box<str>>,
    #[arg(long, requires = "s3_uri")]
    pub s3_insecure: bool,
    #[arg(long, requires = "s3_uri")]
    pub s3_access_key_id: Option<Box<str>>,
    #[arg(
        long,
        env = "HASH_INTEGRATIONS_S3_SECRET_ACCESS_KEY",
        hide_env_values = true
    )]
    pub s3_secret_access_key: Option<Pin<Box<Secret<str>>>>,
    #[arg(long)]
    pub local_sources: PathBuf,
    #[arg(long)]
    pub scratch_dir: Option<PathBuf>,
    #[arg(long)]
    pub graph_url: Url,
    #[arg(long, env = "HASH_GRAPH_SERVICE_SECRET", hide_env_values = true)]
    pub graph_service_secret: Pin<Box<Secret<str>>>,
    #[arg(long)]
    pub vault_url: String,
    #[arg(long)]
    pub vault_mount: String,
    #[arg(long, env = "HASH_INTEGRATIONS_VAULT_TOKEN", hide_env_values = true)]
    pub vault_token: Pin<Box<Secret<str>>>,
    #[command(subcommand)]
    pub operation: OperationArgs,
}

/// The operation whose checkpoints are started or resumed.
#[derive(Debug, Subcommand)]
pub(super) enum OperationArgs {
    /// Capture a definition's sources and apply their desired state.
    Apply {
        #[arg(long)]
        definition: PathBuf,
        #[arg(long)]
        namespace: Box<str>,
        #[arg(long)]
        resend_all: bool,
    },
    /// Restore a captured run, or archive the integration's live entities.
    #[command(group(ArgGroup::new("target_state").required(true).args(["target", "empty"])))]
    Restore {
        #[arg(long)]
        target: Option<Uuid>,
        #[arg(long)]
        empty: bool,
    },
    /// Resend the committed desired state to repair Graph drift.
    Reconcile,
}
