//! Configure and drive the shared pipeline from one local command.

mod args;

use std::{io::Write as _, process::ExitCode};

use clap::{Parser, Subcommand};
use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_integrations_pipeline::{
    ArtifactStorage, CaptureLimits, CaptureStore, Code, GraphVaultConfig, GraphVaultSecretStore,
    OperationRequest, RunContext, RunId, RunRequest, S3Bucket, SendSettings, SourceReader,
    StageError, SystemClock, WorkspaceConfig, graph::GraphClient, run, stage::send::SendOutput,
};
use serde::Serialize;
use tempfile::TempDir;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use self::args::{OperationArgs, RunArgs};

/// A local entry point to the checkpointed ingestion pipeline.
#[derive(Debug, Parser)]
#[command(name = "hash-integrations-pipeline", about)]
pub(crate) struct Command {
    #[command(subcommand)]
    operation: Operation,
}

#[derive(Debug, Subcommand)]
enum Operation {
    /// Start or resume one ingestion run.
    Run(Box<RunArgs>),
}

impl Command {
    pub(crate) async fn execute(self) -> ExitCode {
        match self.operation {
            Operation::Run(args) => run_command(*args).await,
        }
    }
}

#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub(crate) enum RunCommandError {
    #[display("could not configure the ingestion run")]
    Setup,
    #[display("the ingestion run failed")]
    Stage,
}

struct Setup {
    request: RunRequest,
    context: RunContext,
    sources: SourceReader,
    secrets: GraphVaultSecretStore,
    graph: GraphClient,
    // Keep the directory alive through the pipeline and drop it after the resources above.
    _base: TempDir,
}

#[derive(Serialize)]
struct Completed {
    run: RunId,
    output: SendOutput,
}

#[tracing::instrument(level = "debug", skip_all)]
#[expect(
    clippy::use_debug,
    reason = "the command contract reports the complete error stack"
)]
async fn run_command(args: RunArgs) -> ExitCode {
    let run_id = RunId::from(args.run_id.unwrap_or_else(Uuid::new_v4));
    let _ = writeln!(std::io::stderr().lock(), "run {run_id}");
    let result = execute(args, run_id).await;
    match result {
        Ok(output) => {
            let completed = Completed {
                run: run_id,
                output,
            };
            let json = serde_json::to_string(&completed)
                .expect("should serialize the completed run's plain checkpoint data");
            let _ = writeln!(std::io::stdout().lock(), "{json}");
            ExitCode::SUCCESS
        }
        Err(report) => {
            let mut stderr = std::io::stderr().lock();
            let _ = writeln!(stderr, "{report:?}");
            match report.current_context() {
                RunCommandError::Setup => {
                    let _ = writeln!(stderr, "failed: setup");
                }
                RunCommandError::Stage => {
                    let kind = match report.downcast_ref::<StageError>() {
                        Some(StageError::Retryable) => "retryable",
                        Some(StageError::Permanent) | None => "permanent",
                    };
                    let code = report
                        .downcast_ref::<Code>()
                        .copied()
                        .map_or("unclassified", Code::as_str);
                    let _ = writeln!(stderr, "failed: {kind} {code}");
                }
            }
            exit_code(&report)
        }
    }
}

async fn execute(args: RunArgs, run_id: RunId) -> Result<SendOutput, Report<RunCommandError>> {
    let setup = setup(args, run_id).await?;
    run(
        &setup.context,
        setup.request,
        &setup.sources,
        &setup.secrets,
        &setup.graph,
    )
    .await
    .change_context(RunCommandError::Stage)
}

async fn setup(args: RunArgs, run: RunId) -> Result<Setup, Report<RunCommandError>> {
    let operation = match args.operation {
        OperationArgs::Apply {
            definition,
            namespace,
            resend_all,
        } => OperationRequest::Apply {
            definition: tokio::fs::read_to_string(definition)
                .await
                .change_context(RunCommandError::Setup)?
                .into_boxed_str(),
            namespace,
            resend_all,
        },
        OperationArgs::Restore { target, empty: _ } => OperationRequest::Restore {
            target: target.map(RunId::from),
        },
        OperationArgs::Reconcile => OperationRequest::Reconcile,
    };
    let request = RunRequest {
        run,
        web: WebId::new(args.web),
        connector: args.connector,
        actor: ActorEntityUuid::new(args.actor),
        operation,
        allow_mass_archive: args.allow_mass_archive,
    };
    let base = tempfile::Builder::new()
        .prefix("hash-integrations-")
        .tempdir_in(args.scratch_dir.unwrap_or_else(std::env::temp_dir))
        .change_context(RunCommandError::Setup)?;
    let scratch = base.path().join("scratch");
    tokio::fs::create_dir(&scratch)
        .await
        .change_context(RunCommandError::Setup)?;
    let storage = if let Some(directory) = args.storage_dir {
        ArtifactStorage::local(&directory).change_context(RunCommandError::Setup)?
    } else {
        let bucket = S3Bucket {
            uri: args.s3_uri.expect("should require a storage backend"),
            region: args.s3_region.expect("should require an S3 region"),
            endpoint: args.s3_endpoint,
            use_ssl: !args.s3_insecure,
            key_id: args.s3_access_key_id.expect("should require an S3 key ID"),
            secret: Secret::from_vec(
                args.s3_secret_access_key
                    .expect("should require an S3 secret")
                    .expose()
                    .as_bytes()
                    .to_vec(),
            ),
        };
        ArtifactStorage::s3(&bucket, &base.path().join("staging"))
            .change_context(RunCommandError::Setup)?
    };
    let context = RunContext::new(
        storage,
        request.web,
        &request.connector,
        scratch,
        WorkspaceConfig::default(),
        SendSettings::default(),
        Box::new(SystemClock),
    );
    let sources = SourceReader::new(
        CaptureStore::new(&args.local_sources, context.storage.clone())
            .change_context(RunCommandError::Setup)?,
        CaptureLimits::default(),
    );
    let secrets = GraphVaultSecretStore::new(GraphVaultConfig {
        graph_url: args.graph_url.to_string(),
        graph_service_secret: Secret::from_string(args.graph_service_secret.expose().to_owned()),
        vault_url: args.vault_url,
        vault_mount: args.vault_mount,
        vault_token: args.vault_token,
    })
    .change_context(RunCommandError::Setup)?;
    let graph = GraphClient::new(&args.graph_url, args.graph_service_secret)
        .change_context(RunCommandError::Setup)?;
    Ok(Setup {
        request,
        context,
        sources,
        secrets,
        graph,
        _base: base,
    })
}

fn exit_code(report: &Report<RunCommandError>) -> ExitCode {
    ExitCode::from(match report.current_context() {
        RunCommandError::Setup => 2,
        RunCommandError::Stage => match report.downcast_ref::<StageError>() {
            Some(StageError::Retryable) => 3,
            Some(StageError::Permanent) | None => 1,
        },
    })
}
