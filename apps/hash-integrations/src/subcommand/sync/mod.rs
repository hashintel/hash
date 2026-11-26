use alloc::collections::BTreeMap;
use std::{env, fs, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_integrations_definition::{ConnectorId, Definition, SourceName};
use hash_integrations_ledger::{
    GraphClient, IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, capture,
    prepare_incremental, send, start,
};
use serde::Serialize;
use time::OffsetDateTime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use url::{Position, Url};
use uuid::Uuid;

/// Why a `sync` command failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum SyncError {
    #[display("the definition file could not be read")]
    ReadDefinition,
    #[display("the definition is not valid")]
    ParseDefinition,
    #[display("the bucket settings are not valid")]
    Bucket,
    #[display("the Graph settings are not valid")]
    Graph,
    #[display("the run could not be started")]
    Start,
    #[display("the stage failed")]
    Stage,
}

/// The commands that take a run of an integration through the stages of its pipeline.
#[derive(Debug, clap::Subcommand)]
pub enum Sync {
    /// Start a run of a definition and print its ID as JSON.
    Start(Box<StartArgs>),
    /// Store the capture files of a run, one Parquet file per table.
    Capture(Box<CaptureArgs>),
    /// Turn the captured rows of a run into entity changes.
    Prepare(Box<RunArgs>),
    /// Write the entity changes of a run to the Graph and complete the run.
    Send(Box<SendArgs>),
}

/// The bucket the state of every integration is kept in.
#[derive(Debug, clap::Args)]
pub struct BucketArgs {
    /// The bucket and prefix, as `s3://bucket/prefix`. The region, an S3-compatible endpoint and
    /// the credentials are read from `AWS_REGION`, `AWS_ENDPOINT`, `AWS_ACCESS_KEY_ID` and
    /// `AWS_SECRET_ACCESS_KEY`.
    #[clap(long = "bucket-uri", env = "HASH_INTEGRATIONS_BUCKET_URI")]
    uri: String,
}

// Origin: `ArtifactStore::s3_from_env` in labs `pocs/integrations_rs/src/blob.rs`, which reads the
// same `AWS_*` variables through `AmazonS3Builder::from_env`.
impl BucketArgs {
    /// The bucket of `uri`, reached as the `AWS_*` variables say.
    ///
    /// The region defaults to `us-east-1`. `AWS_ENDPOINT` is a URL such as
    /// `http://localhost:9000`: an `http` or `https` scheme, a host and an optional port, and no
    /// path. Its scheme says whether the bucket is reached over HTTPS.
    fn bucket(self) -> Result<S3Bucket, Report<SyncError>> {
        let variable = |name| env::var(name).change_context(SyncError::Bucket);
        let (endpoint, use_ssl) = match env::var("AWS_ENDPOINT").ok() {
            None => (None, true),
            Some(endpoint) => {
                let endpoint = Url::parse(&endpoint).change_context(SyncError::Bucket)?;
                let use_ssl = match endpoint.scheme() {
                    "https" => true,
                    "http" => false,
                    _ => return Err(Report::new(SyncError::Bucket)),
                };
                if endpoint.host_str().is_none() || endpoint.path() != "/" {
                    return Err(Report::new(SyncError::Bucket));
                }
                let address = &endpoint[Position::BeforeHost..Position::AfterPort];
                (Some(address.into()), use_ssl)
            }
        };
        Ok(S3Bucket {
            uri: self.uri.into(),
            region: env::var("AWS_REGION")
                .unwrap_or_else(|_| "us-east-1".to_owned())
                .into(),
            endpoint,
            use_ssl,
            key_id: variable("AWS_ACCESS_KEY_ID")?.into(),
            secret: Secret::from_vec(variable("AWS_SECRET_ACCESS_KEY")?.into_bytes()),
        })
    }
}

#[derive(Debug, clap::Args)]
pub struct StartArgs {
    /// The definition of the integration, a YAML file.
    definition: PathBuf,

    /// The ID of the run. Starting a run again does nothing; without an ID, a new run starts.
    #[clap(long)]
    run: Option<Uuid>,

    /// The web the run writes its entities to.
    #[clap(long, env = "HASH_WEB_ID")]
    web: Uuid,

    /// The actor the run writes as.
    #[clap(long, env = "HASH_ACTOR_ID")]
    actor: Uuid,

    #[clap(flatten)]
    bucket: BucketArgs,
}

/// A run of an integration, and the bucket its state is kept in.
#[derive(Debug, clap::Args)]
pub struct RunArgs {
    /// The ID of the run.
    run: Uuid,

    /// The web the integration writes to.
    #[clap(long, env = "HASH_WEB_ID")]
    web: Uuid,

    /// The connector of the integration's definition.
    #[clap(long)]
    connector: ConnectorId,

    #[clap(flatten)]
    bucket: BucketArgs,
}

impl RunArgs {
    /// Opens the integration's place in the bucket, which its web and connector name.
    fn open(self) -> Result<(Storage, RunId), Report<SyncError>> {
        let namespace = IntegrationNamespace::new(self.web, &self.connector);
        let storage =
            Storage::s3(self.bucket.bucket()?, &namespace).change_context(SyncError::Bucket)?;
        Ok((storage, RunId::from(self.run)))
    }
}

#[derive(Debug, clap::Args)]
pub struct CaptureArgs {
    #[clap(flatten)]
    run: RunArgs,

    /// A capture file, as `<table>=<path>`, once per table of the definition.
    #[clap(long = "file", value_parser = parse_file, required = true)]
    files: Vec<(SourceName, PathBuf)>,
}

fn parse_file(value: &str) -> Result<(SourceName, PathBuf), String> {
    let (table, path) = value
        .split_once('=')
        .ok_or_else(|| "expected `<table>=<path>`".to_owned())?;
    let table = table.parse().map_err(|error| format!("{error}"))?;
    Ok((table, PathBuf::from(path)))
}

#[derive(Debug, clap::Args)]
pub struct SendArgs {
    #[clap(flatten)]
    run: RunArgs,

    /// The address of the Graph's HTTP API, ending in `/`.
    #[clap(long, env = "HASH_INTEGRATIONS_GRAPH_URL")]
    graph_url: Url,

    /// The secret the Graph accepts from services.
    #[clap(long, env = "HASH_GRAPH_SERVICE_SECRET", hide_env_values = true)]
    graph_service_secret: String,
}

impl Sync {
    /// Runs the command.
    ///
    /// # Errors
    ///
    /// - [`SyncError::ReadDefinition`] or [`SyncError::ParseDefinition`] if `start` cannot read its
    ///   definition
    /// - [`SyncError::Bucket`] or [`SyncError::Graph`] if a setting is not valid
    /// - [`SyncError::Start`] if the run cannot be started
    /// - [`SyncError::Stage`] if the stage failed; its error says whether running it again can help
    pub(crate) async fn execute(self) -> Result<(), Report<SyncError>> {
        match self {
            Self::Start(args) => {
                let run = execute_start(*args).await?;
                print(&serde_json::json!({ "run": run }));
            }
            Self::Capture(args) => {
                let CaptureArgs { run, files } = *args;
                let (storage, run) = run.open()?;
                let files: BTreeMap<_, _> = files.into_iter().collect();
                capture(&storage, run, &files)
                    .await
                    .change_context(SyncError::Stage)?;
            }
            Self::Prepare(args) => {
                let (storage, run) = args.open()?;
                prepare_incremental(&storage, run)
                    .await
                    .change_context(SyncError::Stage)?;
            }
            Self::Send(args) => {
                let SendArgs {
                    run,
                    graph_url,
                    graph_service_secret,
                } = *args;
                let graph =
                    GraphClient::new(&graph_url, &Secret::from_string(graph_service_secret))
                        .change_context(SyncError::Graph)?;
                let (storage, run) = run.open()?;
                send(&storage, run, &graph)
                    .await
                    .change_context(SyncError::Stage)?;
            }
        }
        Ok(())
    }
}

/// Parses the definition once, opens the place its connector names in the bucket, and starts the
/// run.
async fn execute_start(args: StartArgs) -> Result<RunId, Report<SyncError>> {
    let text = fs::read_to_string(&args.definition).change_context(SyncError::ReadDefinition)?;
    let definition = Definition::from_yaml(&text).change_context(SyncError::ParseDefinition)?;
    let namespace = IntegrationNamespace::new(args.web, definition.connector());
    let storage =
        Storage::s3(args.bucket.bucket()?, &namespace).change_context(SyncError::Bucket)?;
    let run = args.run.map_or_else(RunId::new, RunId::from);
    let input = StartInput {
        run,
        web: WebId::new(args.web),
        actor: ActorEntityUuid::new(args.actor),
        definition: text.into(),
        id_namespace: None,
        submitted_at: OffsetDateTime::now_utc(),
    };
    start(&storage, &definition, input)
        .await
        .change_context(SyncError::Start)?;
    Ok(run)
}

#[expect(clippy::print_stdout, reason = "the JSON is the command's output")]
fn print(value: &impl Serialize) {
    println!(
        "{}",
        serde_json::to_string(value).expect("the output should serialize as JSON")
    );
}
